// The holder's text answer to a clarification: its limit and its error codes.
// Pure, so a component can use them without importing the server functions
// (review-thread.functions.ts re-exports them).

export const REPLY_MAX_LENGTH = 2000;

export const REPLY_ERROR_CODES = [
  "SP_REVIEW_STALE",
  "SP_REQUEST_NOT_AWAITING_REPLY",
  "SP_REQUEST_NOT_FOUND",
  "SP_REPLY_INVALID",
] as const;
export type ReplyErrorCode =
  | (typeof REPLY_ERROR_CODES)[number]
  | "REPLY_NOT_INSTALLED"
  | "REPLY_FAILED";
