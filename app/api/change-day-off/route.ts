import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createChangeOffApprovalGroupRecord,
  createChangeOffRequest,
  sendChangeOffApprovalCard,
} from "@/lib/lark";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

const schema = z.object({
  currentOffDate: z.string().min(10).max(10),
  requestedNewOffDate: z.string().min(10).max(10),
  reason: z.string().min(3).max(2000),
});

function manilaTodayParts() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    day: now.getUTCDate(),
    weekday: now.getUTCDay(),
  };
}

function ymd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function currentManilaWeek() {
  const p = manilaTodayParts();
  const today = new Date(Date.UTC(p.year, p.month, p.day));
  const daysSinceMonday = (p.weekday + 6) % 7;

  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - daysSinceMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return { start: ymd(monday), end: ymd(sunday) };
}

export async function POST(request: Request) {
  try {
    const session = verifySessionToken(
      cookies().get(SESSION_COOKIE_NAME)?.value,
    );

    if (!session) {
      return NextResponse.json(
        { error: "Please verify your identity again." },
        { status: 401 },
      );
    }

    const body = schema.parse(await request.json());

    const week = currentManilaWeek();

    if (
      body.requestedNewOffDate < week.start ||
      body.requestedNewOffDate > week.end
    ) {
      return NextResponse.json(
        {
          error: `Requested New Off-Date must be within this week (${week.start} to ${week.end}).`,
        },
        { status: 400 },
      );
    }

    if (body.currentOffDate === body.requestedNewOffDate) {
      return NextResponse.json(
        { error: "Current and requested new off-date cannot be the same." },
        { status: 400 },
      );
    }

    const submittedAt = Date.now();

    const input = {
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      department: session.department,
      approvalGroup: session.leaveApprovalGroup,
      currentOffDate: body.currentOffDate,
      requestedNewOffDate: body.requestedNewOffDate,
      reason: body.reason,
      submittedAt,
    };

    // Master record first.
    const created = await createChangeOffRequest(input);
    const reviewToken = makeReviewToken(`change-off:${created.recordId}`);

    // Secondary routing should not cause duplicate master records on retry.
    const routingWarnings: string[] = [];

    try {
      const approvalRecord = await createChangeOffApprovalGroupRecord({
        ...input,
        mainRecordId: created.recordId,
        requestId: created.requestId,
      });

      if (!approvalRecord.created) {
        routingWarnings.push(approvalRecord.reason);
      }
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to create approval-group record.",
      );
    }

    try {
      await sendChangeOffApprovalCard({
        ...input,
        ...created,
        reviewToken,
      });
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to send approval-group card.",
      );
    }

    return NextResponse.json({
      ok: true,
      requestId: created.requestId,
      routingWarnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit Change Day-Off request.",
      },
      { status: 500 },
    );
  }
}
