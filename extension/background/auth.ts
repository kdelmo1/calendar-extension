export type AppError = {
  code:
    | "AUTH_DENIED"
    | "NO_DATES"
    | "RATE_LIMIT"
    | "TIMEOUT"
    | "PARSE_FAILED"
    | "PARTIAL_WRITE"
    | "CALENDAR_ERROR";
  message: string;
};

export type TokenResult = { token: string } | AppError;

export async function getToken(): Promise<TokenResult> {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive: true });
    if (token) return { token };
  } catch {
    // Closing or declining sign-in rejects the Chrome API promise.
  }

  return {
    code: "AUTH_DENIED",
    message: "Google sign-in was not completed. Please try again and allow Calendar access.",
  };
}
