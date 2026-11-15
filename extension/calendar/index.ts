import { getToken } from "../background/auth";
import { undoCalendar, writeCalendar } from "./calendar";

chrome.runtime.onMessage.addListener(
  (message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message?.type === "WRITE_REQUEST") {
      void answer("WRITE_RESULT", async (token) => writeCalendar(token, message.payload)).then(sendResponse);
      return true; // answering later
    }
    if (message?.type === "UNDO_REQUEST") {
      void answer("UNDO_RESULT", async (token) => undoCalendar(token, message.payload.calendarId)).then(sendResponse);
      return true;
    }
  }
);

async function answer(type: "WRITE_RESULT" | "UNDO_RESULT", work: (token: string) => Promise<unknown>) {
  let payload: unknown;
  const auth = await getToken();                    // call it directly
  if ("code" in auth) payload = auth;              // AUTH_DENIED
  else {
    try { payload = await work(auth.token); }
    catch (err: any) {                              // your functions throw AppErrors
      payload = err?.code ? err : { code: "CALENDAR_ERROR", message: "Something went wrong with Google Calendar." };
    }
  }
  try { await chrome.runtime.sendMessage({ type, payload }); } catch { /* panel closed */ }
  return payload;
}