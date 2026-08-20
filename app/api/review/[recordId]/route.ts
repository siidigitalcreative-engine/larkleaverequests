import { NextResponse } from "next/server";
import {
  getLeaveRecord,
  sendDecisionCard,
  updateApprovalGroupDecision,
  updateLeaveDecision,
} from "@/lib/lark";
import { verifyReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function dateText(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export async function GET(
  request: Request,
  { params }: { params: { recordId: string } },
) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";

    if (!verifyReviewToken(params.recordId, token)) {
      return NextResponse.json(
        { error: "Invalid or expired review link." },
        { status: 403 },
      );
    }

    const record = await getLeaveRecord(params.recordId);
    const f = record?.fields ?? {};

    return NextResponse.json({
      request: {
        recordId: params.recordId,
        requestId: text(f["Leave Request ID"]),
        employeeName: text(f["Employee Name"]),
        employeeId: text(f["Employee ID"]),
        department: text(f["Department"]),
        approvalGroup: text(f["Approval Group"]),
        leaveType: text(f["Leave Type"]),
        startDate: f["Start Date"],
        endDate: f["End Date"],
        dayType: text(f["Day Type"]),
        startTime: text(f["Start Time"]),
        endTime: text(f["End Time"]),
        reason: text(f["Reason"]),
        status: text(f["Status"]),
        approvedBy: text(f["Approved By"]),
        rejectionReason: text(f["Rejection Reason"]),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load request." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { recordId: string } },
) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";

    if (!verifyReviewToken(params.recordId, token)) {
      return NextResponse.json(
        { error: "Invalid or expired review link." },
        { status: 403 },
      );
    }

    const decision =
      body.decision === "approve"
        ? "Approved"
        : body.decision === "reject"
          ? "Rejected"
          : null;

    if (!decision) {
      return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
    }

    const record = await getLeaveRecord(params.recordId);
    const f = record?.fields ?? {};
    const currentStatus = text(f["Status"]);

    if (currentStatus && currentStatus !== "Pending") {
      return NextResponse.json(
        { error: `This request is already ${currentStatus}.` },
        { status: 409 },
      );
    }

    const rejectionReason = text(body.rejectionReason);

    if (decision === "Rejected" && rejectionReason.length < 2) {
      return NextResponse.json(
        { error: "Please enter a rejection reason." },
        { status: 400 },
      );
    }

    await updateLeaveDecision({
      recordId: params.recordId,
      decision,
      approverName: "Approval Group",
      rejectionReason,
    });

    // Keep the copied approval-group table in sync with the master record.
    await updateApprovalGroupDecision({
      approvalGroup: text(f["Approval Group"]),
      mainRecordId: params.recordId,
      requestId: text(f["Leave Request ID"]),
      decision,
      rejectionReason,
    });

    // Post a new final-status card to the same approval group.
    // The original webhook card cannot be edited, so this gives the group
    // a clear visible Approved/Rejected result with no action buttons.
    await sendDecisionCard({
      approvalGroup: text(f["Approval Group"]),
      employeeName: text(f["Employee Name"]),
      requestId: text(f["Leave Request ID"]),
      leaveType: text(f["Leave Type"]),
      startDate: dateText(f["Start Date"]),
      endDate: dateText(f["End Date"]),
      decision,
      rejectionReason,
    });

    return NextResponse.json({
      ok: true,
      decision,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process decision." },
      { status: 500 },
    );
  }
}
