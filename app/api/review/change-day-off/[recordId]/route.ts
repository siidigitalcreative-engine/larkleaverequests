import { NextResponse } from "next/server";
import {
  getChangeOffRecord,
  sendChangeOffDecisionCard,
  updateApprovalGroupDecision,
  updateChangeOffDecision,
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

    if (!verifyReviewToken(`change-off:${params.recordId}`, token)) {
      return NextResponse.json(
        { error: "Invalid or expired review link." },
        { status: 403 },
      );
    }

    const record = await getChangeOffRecord(params.recordId);
    const f = record?.fields ?? {};

    return NextResponse.json({
      request: {
        recordId: params.recordId,
        requestId:
          text(f["Change Off Request ID"]) || text(f["Request ID"]),
        employeeName: text(f["Employee Name"]),
        employeeId: text(f["Employee ID"]),
        department: text(f["Department"]),
        approvalGroup: text(f["Approval Group"]),
        currentOffDate: f["Current Off-Date"],
        requestedNewOffDate: f["Requested New Off-Date"],
        reason:
          text(f["Reason for Change"]) || text(f["Reason"]),
        status: text(f["Status"]),
        rejectionReason: text(f["Rejection Reason"]),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load request.",
      },
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

    if (!verifyReviewToken(`change-off:${params.recordId}`, token)) {
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
      return NextResponse.json(
        { error: "Invalid decision." },
        { status: 400 },
      );
    }

    const record = await getChangeOffRecord(params.recordId);
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

    await updateChangeOffDecision({
      recordId: params.recordId,
      decision,
      rejectionReason,
    });

    const warnings: string[] = [];

    try {
      await updateApprovalGroupDecision({
        approvalGroup: text(f["Approval Group"]),
        mainRecordId: params.recordId,
        requestId:
          text(f["Change Off Request ID"]) || text(f["Request ID"]),
        decision,
        rejectionReason,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "Unable to sync approval table.",
      );
    }

    try {
      await sendChangeOffDecisionCard({
        approvalGroup: text(f["Approval Group"]),
        employeeName: text(f["Employee Name"]),
        requestId:
          text(f["Change Off Request ID"]) || text(f["Request ID"]),
        currentOffDate: dateText(f["Current Off-Date"]),
        requestedNewOffDate: dateText(f["Requested New Off-Date"]),
        decision,
        rejectionReason,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "Unable to send final decision card.",
      );
    }

    return NextResponse.json({
      ok: true,
      decision,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process decision.",
      },
      { status: 500 },
    );
  }
}
