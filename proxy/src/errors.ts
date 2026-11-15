import type { AppError } from "./types.js";

// Throw this anywhere in the server to send an AppError back to the extension.
// `status` is the HTTP status code the server replies with.
export class AppErrorException extends Error {
  code: AppError["code"];
  status: number;

  constructor(code: AppError["code"], message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }

  // The plain object we actually send over the network.
  toJSON(): AppError {
    return { code: this.code, message: this.message };
  }
}
