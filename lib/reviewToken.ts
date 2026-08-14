import crypto from "crypto";

function secret() {
  const value = process.env.REVIEW_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("REVIEW_TOKEN_SECRET (or SESSION_SECRET fallback) must be at least 32 characters.");
  }
  return value;
}

export function makeReviewToken(recordId: string) {
  return crypto.createHmac("sha256", secret()).update(recordId).digest("base64url");
}

export function verifyReviewToken(recordId: string, token: string) {
  const expected = makeReviewToken(recordId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
