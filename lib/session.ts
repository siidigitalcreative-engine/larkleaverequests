import crypto from "crypto";

export const SESSION_COOKIE_NAME = "leave_requests_session";

const PERSISTENT_SESSION_SECONDS = 60 * 60 * 24 * 365; // 1 year
const TEMP_SESSION_SECONDS = 60 * 60 * 12; // 12 hours

export type EmployeeSession = {
  employeeId: string;
  employeeName: string;
  department?: string;
  leaveApprovalGroup: string;
  exp: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;

  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters.",
    );
  }

  return value;
}

function sign(payload: string) {
  return crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(
  input: Omit<EmployeeSession, "exp">,
  staySignedIn = true,
) {
  const duration = staySignedIn
    ? PERSISTENT_SESSION_SECONDS
    : TEMP_SESSION_SECONDS;

  const payload: EmployeeSession = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + duration,
  };

  const encoded = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(
  token?: string | null,
): EmployeeSession | null {
  if (!token) return null;

  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as EmployeeSession;

    if (
      !payload.employeeId ||
      !payload.employeeName ||
      !payload.leaveApprovalGroup
    ) {
      return null;
    }

    if (
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(
  staySignedIn = true,
) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(staySignedIn
      ? { maxAge: PERSISTENT_SESSION_SECONDS }
      : {}),
  };
}
