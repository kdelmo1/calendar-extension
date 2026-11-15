// Lane 3: Google Calendar API Integration
// Simple, beginner-friendly code with short comments.

// Import AppError shape from your shared types or define it locally if needed
type AppError = {
  code: "AUTH_DENIED" | "NO_DATES" | "RATE_LIMIT" | "TIMEOUT" | "PARSE_FAILED" | "PARTIAL_WRITE" | "CALENDAR_ERROR";
  message: string;
};

/**
 * Creates a new, separate Google Calendar.
 * @param token - OAuth access token from Lane 1 (GET_TOKEN)
 * @param name - The name of the calendar (e.g. from ParseResult)
 * @param timeZone - The user's timezone (e.g. "America/Los_Angeles")
 * @returns The new calendar's ID string, or throws an AppError
 */

//make a new calendar
export async function createCalendar(token: string, name: string, timeZone: string): Promise<string> {
  const url = "https://www.googleapis.com/calendar/v3/calendars";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: name,
        timeZone: timeZone,
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw { code: "AUTH_DENIED", message: "Google authentication failed or was denied." } as AppError;
      }
      throw { code: "CALENDAR_ERROR", message: `Failed to create calendar: ${response.statusText}` } as AppError;
    }

    const data = await response.json();
    return data.id; // Returns the unique calendar ID
  } catch (error: any) {
    if (error.code) {
      throw error; // Re-throw our custom AppError
    }
    throw { code: "CALENDAR_ERROR", message: error.message || "Unknown error creating calendar." } as AppError;
  }
}

// Helper type matching your project definitions
type CalendarEvent = {
  id: string;
  title: string;
  allDay: boolean;
  start: string;              // "YYYY-MM-DD" if allDay, else ISO date-time
  end: string;                // INCLUSIVE; Lane 3 converts to Google's exclusive end
  recurrence: string | null;  // RRULE string or null
  location: string | null;
  description: string | null;
  category: "deadline" | "holiday" | "exam" | "class" | "event";
  confidence: number;         // 0-1
  sourceText: string;         // original snippet
};

/**
 * Adds a single event to a Google Calendar.
 * Converts our CalendarEvent shape into Google Calendar API's expected format.
 */
export async function addEvent(token: string, calendarId: string, event: CalendarEvent, timeZone: string): Promise<any> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  // 1. Build Google's expected request body
  const googleEvent: any = {
    summary: event.title,
    description: `${event.description || ""}\n\n[Category: ${event.category}]\nSource: "${event.sourceText}"`.trim(),
    location: event.location,
  };

  // 2. Handle recurrence rule if present
  if (event.recurrence) {
    googleEvent.recurrence = [event.recurrence];
  }

  // 3. Handle start and end dates (All-day vs Timed)
  if (event.allDay) {
    // Google all-day end dates are exclusive, so we add 1 day to the inclusive end date
    const endDateObj = new Date(event.end);
    endDateObj.setUTCDate(endDateObj.getUTCDate() + 1); // UTC math: local math breaks on the daylight-saving day
    const exclusiveEndStr = endDateObj.toISOString().split('T')[0];

    googleEvent.start = { date: event.start };
    googleEvent.end = { date: exclusiveEndStr };
  } else {
    googleEvent.start = { dateTime: withSeconds(event.start), timeZone: timeZone };
    googleEvent.end = { dateTime: withSeconds(event.end), timeZone: timeZone };
  }

  // 4. Send the POST request to Google Calendar API
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(googleEvent),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw {
      code: response.status === 429 || response.status === 403 ? "RATE_LIMIT" : "CALENDAR_ERROR",
      message: `Failed to add event "${event.title}": ${errorBody}`
    };
  }

  return await response.json();
}

// Types for write results
type WriteResult = {
  calendarId: string;
  calendarLink: string;
  added: number;
  failed: { eventId: string; reason: string }[];
};

/**
 * Helper function to retry an async API call on rate limits (429 or 403)
 * Waits 1s, then 2s, then 4s.
 */

//not too many requests :3
async function fetchWithRetry(fn: () => Promise<Response>, retries = [1000, 2000, 4000]): Promise<Response> {
  try {
    const response = await fn();
    if ((response.status === 429 || response.status === 403) && retries.length > 0) {
      const waitTime = retries[0];
      console.warn(`Rate limited (status ${response.status}). Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return fetchWithRetry(fn, retries.slice(1));
    }
    return response;
  } catch (error) {
    if (retries.length > 0) {
      await new Promise(resolve => setTimeout(resolve, retries[0]));
      return fetchWithRetry(fn, retries.slice(1));
    }
    throw error;
  }
}

/**
 * Creates the calendar and adds all parsed events in batches of 5.
 * Handles retries and collects successes/failures.
 */

//takes the list of parsed events and adds them to calendar
export async function writeCalendar(token: string, parseResult: { calendarName: string; timeZone: string; events: CalendarEvent[] }): Promise<WriteResult> {
  // 1. Create the new separate calendar
  const calendarId = await createCalendar(token, parseResult.calendarName, parseResult.timeZone);
  const calendarLink = `https://calendar.google.com/calendar/u/0?cid=${encodeURIComponent(calendarId)}`;

  let added = 0;
  const failed: { eventId: string; reason: string }[] = [];

  // 2. Process events in batches of 5
  const batchSize = 5;
  for (let i = 0; i < parseResult.events.length; i += batchSize) {
    const batch = parseResult.events.slice(i, i + batchSize);

    // Run batch requests in parallel
    const promises = batch.map(async (event) => {
      try {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        
        // Build Google event payload (same logic as addEvent)
        const googleEvent: any = {
          summary: event.title,
          description: `${event.description || ""}\n\n[Category: ${event.category}]\nSource: "${event.sourceText}"`.trim(),
          location: event.location,
        };

        if (event.recurrence) {
          googleEvent.recurrence = [event.recurrence];
        }

        if (event.allDay) {
          const endDateObj = new Date(event.end);
          endDateObj.setUTCDate(endDateObj.getUTCDate() + 1); // UTC math: local math breaks on the daylight-saving day
          googleEvent.start = { date: event.start };
          googleEvent.end = { date: endDateObj.toISOString().split('T')[0] };
        } else {
          googleEvent.start = { dateTime: withSeconds(event.start), timeZone: parseResult.timeZone };
          googleEvent.end = { dateTime: withSeconds(event.end), timeZone: parseResult.timeZone };
        }

        // Execute request with retry logic
        const response = await fetchWithRetry(() => fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        }));

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText);
        }

        added++;
      } catch (err: any) {
        failed.push({
          eventId: event.id,
          reason: err.message || "Failed to add event"
        });
      }
    });

    // Wait for current batch of 5 to finish before starting the next batch
    await Promise.all(promises);
  }

  // 3. Evaluate results based on your specifications
  if (added === 0 && parseResult.events.length > 0) {
    throw { code: "CALENDAR_ERROR", message: "Nothing worked. Failed to add any events to the calendar." };
  }

  if (failed.length > 0) {
    throw { code: "PARTIAL_WRITE", message: `Successfully added ${added} events, but ${failed.length} failed.` };
  }

  return {
    calendarId,
    calendarLink,
    added,
    failed
  };
}

/**
 * Deletes a Google Calendar (used for the Undo feature).
 * @param token - OAuth access token from Lane 1 (GET_TOKEN)
 * @param calendarId - The ID of the calendar to delete
 * @returns { ok: true } on success, or throws an AppError
 */
export async function undoCalendar(token: string, calendarId: string): Promise<{ ok: true }> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw { code: "AUTH_DENIED", message: "Authentication failed while trying to undo calendar." };
      }
      throw { code: "CALENDAR_ERROR", message: `Failed to delete calendar: ${response.statusText}` };
    }

    return { ok: true };
  } catch (error: any) {
    if (error.code) {
      throw error; // Re-throw our custom AppError
    }
    throw { code: "CALENDAR_ERROR", message: error.message || "Unknown error deleting calendar." };
  }
}

/**
 * Optional: Makes a calendar public so anyone with the link can follow/view it.
 * Uses Google Calendar ACL API (role: "reader", scope: { type: "default" })
 */
export async function makeCalendarPublic(token: string, calendarId: string): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      scope: {
        type: "default"
      }
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.warn("Could not make calendar public (non-fatal):", errText);
    // We log a warning instead of crashing, since public sharing is optional
  }
}
// Google wants "YYYY-MM-DDTHH:MM:SS". Times edited in the review screen come back
// as "2027-01-04T09:00" (no seconds), so add ":00" when they're missing.
function withSeconds(dateTime: string): string {
  return dateTime.length === 16 ? `${dateTime}:00` : dateTime;
}
