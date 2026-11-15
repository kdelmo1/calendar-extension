// Checks and tidies the repeating-event rules (RRULEs) Gemini writes, so Google Calendar
// always accepts them. Example of a good rule:
//   RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270312T075959Z
//
// What we fix:
//   - Anything that isn't a valid RRULE -> null (the event stays as a one-time event)
//   - UNTIL for timed events must be a UTC time ("...T075959Z"). Gemini writes a day
//     ("20270311"), so we turn it into 23:59:59 that day in the event's time zone, in UTC.
//   - A weekly rule's first meeting must be on one of its days: "TU,TH" starting on a
//     Monday is moved to that Tuesday.
// Spec: RFC 5545 section 3.3.10. Google: https://developers.google.com/calendar/api/concepts/events-calendars#recurring_events

const FREQS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // index = JavaScript getUTCDay()

type Times = { allDay: boolean; start: string; end: string };

// Returns the cleaned rule and (possibly moved) times. rule is null if there is no usable rule.
export function fixRecurrence(raw: unknown, times: Times, timeZone: string): { rule: string | null } & Times {
  const none = { rule: null, ...times };
  if (typeof raw !== "string" || !/^RRULE:/i.test(raw.trim())) return none;

  // "RRULE:FREQ=WEEKLY;BYDAY=TU,TH" -> { FREQ: "WEEKLY", BYDAY: "TU,TH" }
  const parts: Record<string, string> = {};
  for (const piece of raw.trim().slice(6).split(";")) {
    const [key, value] = piece.split("=");
    if (key && value) parts[key.trim().toUpperCase()] = value.trim().toUpperCase();
  }

  const freq = parts.FREQ;
  if (!FREQS.includes(freq)) return none;

  const byday = parts.BYDAY ? parts.BYDAY.split(",") : [];
  if (byday.some((d) => !/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.test(d))) return none;

  const interval = parts.INTERVAL && /^\d{1,2}$/.test(parts.INTERVAL) ? Number(parts.INTERVAL) : 1;
  const count = parts.COUNT && /^\d{1,3}$/.test(parts.COUNT) ? Number(parts.COUNT) : null;
  const untilDay = parseUntilDay(parts.UNTIL); // "2027-03-11" or null

  // Weekly: move the first meeting forward to the first listed day (at most 6 days).
  let { start, end } = times;
  if (freq === "WEEKLY" && byday.length > 0) {
    const plainDays = byday.map((d) => d.slice(-2));
    for (let shift = 0; shift < 7; shift++) {
      if (plainDays.includes(DAYS[weekday(addDays(start, shift))])) {
        start = addDays(start, shift);
        end = addDays(end, shift);
        break;
      }
    }
  }

  // A rule that ends before it starts is a mistake.
  if (untilDay && untilDay < start.slice(0, 10)) return none;

  const rule = ["RRULE:FREQ=" + freq];
  if (interval > 1) rule.push(`INTERVAL=${interval}`);
  if (byday.length) rule.push(`BYDAY=${byday.join(",")}`);
  if (untilDay) rule.push(`UNTIL=${times.allDay ? untilDay.replace(/-/g, "") : endOfDayUtc(untilDay, timeZone)}`);
  else if (count && count > 0) rule.push(`COUNT=${count}`); // UNTIL and COUNT can't both be used
  return { rule: rule.join(";"), allDay: times.allDay, start, end };
}

// "20270311" or "20270311T235959Z" -> "2027-03-11" (the last day). Anything else -> null.
function parseUntilDay(until: string | undefined): string | null {
  const m = until?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  // A UTC time is already exact; we only use its day (in UTC) as the last day.
  return Number.isNaN(new Date(`${day}T00:00:00Z`).getTime()) ? null : day;
}

// 23:59:59 on `day` in `timeZone`, written as UTC like "20270312T075959Z".
function endOfDayUtc(day: string, timeZone: string): string {
  const asIfUtc = Date.parse(`${day}T23:59:59Z`);
  // How far is the time zone from UTC on that day? (handles daylight saving time)
  const offset = zoneOffsetMs(asIfUtc, timeZone);
  const utc = new Date(asIfUtc - offset);
  return utc.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

// Milliseconds the time zone is ahead of UTC at that moment (e.g. -8 hours for Los Angeles in winter).
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallClock - utcMs;
}

// Day of the week (0 = Sunday) of "2027-01-05" or "2027-01-05T09:50:00".
function weekday(dateOrDateTime: string): number {
  return new Date(`${dateOrDateTime.slice(0, 10)}T12:00:00Z`).getUTCDay();
}

// Adds whole days to "2027-01-05" or "2027-01-05T09:50:00", keeping the same format.
function addDays(dateOrDateTime: string, days: number): string {
  if (days === 0) return dateOrDateTime;
  const d = new Date(`${dateOrDateTime.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) + dateOrDateTime.slice(10);
}
