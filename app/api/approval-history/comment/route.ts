import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  addHistoryComment,
  getHistoryComments,
  type HistoryCommentRequestType,
} from "@/lib/approval-history-comments";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const runtime = "nodejs";

const validTypes = new Set<HistoryCommentRequestType>([
  "Leave Request",
  "Change Day-Off",
  "Overtime",
  "Undertime",
]);

function requestType(value: unknown): HistoryCommentRequestType {
  const result = String(value ?? "").trim() as HistoryCommentRequestType;
  if (!validTypes.has(result)) throw new Error("Invalid request type.");
  return result;
}

function currentSession() {
  const value = verifySessionToken(
    cookies().get(SESSION_COOKIE_NAME)?.value,
  );
  if (!value) throw new Error("Please verify your identity again.");
  return value;
}

export async function GET(request: Request) {
  try {
    const current = currentSession();
    const url = new URL(request.url);
    const type = requestType(url.searchParams.get("requestType"));
    const requestId = String(
      url.searchParams.get("requestId") ?? "",
    ).trim();

    if (!requestId) {
      return NextResponse.json(
        { error: "Missing request ID." },
        { status: 400 },
      );
    }

    const data = await getHistoryComments({
      requestType: type,
      requestId,
      employeeId: current.employeeId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load comments.";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("verify your identity") ? 401 : 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = currentSession();
    const form = await request.formData();

    const type = requestType(form.get("requestType"));
    const requestId = String(form.get("requestId") ?? "").trim();
    const comment = String(form.get("comment") ?? "").trim();

    const attachmentValue = form.get("attachment");
    const attachment =
      attachmentValue instanceof File && attachmentValue.size > 0
        ? attachmentValue
        : undefined;

    if (!requestId) {
      return NextResponse.json(
        { error: "Missing request ID." },
        { status: 400 },
      );
    }

    if (!comment && !attachment) {
      return NextResponse.json(
        {
          error: "Enter a comment or attach a file before sending.",
        },
        { status: 400 },
      );
    }

    const result = await addHistoryComment({
      requestType: type,
      requestId,
      employeeId: current.employeeId,
      commenterName: current.employeeName,
      comment,
      attachment,
    });

    return NextResponse.json({
      ok: true,
      comments: result.comments,
      warnings: result.warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to add comment.";

    return NextResponse.json(
      { error: message },
      {
        status: message.includes("verify your identity") ? 401 : 500,
      },
    );
  }
}
