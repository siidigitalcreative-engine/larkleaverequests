import { NextResponse } from "next/server";
import {
  getOvertimeRecord,
  sendOvertimeDecisionCard,
  updateOvertimeApprovalGroupDecision,
  updateOvertimeDecision,
} from "@/lib/overtime";
import { extractApprovalAttachments } from "@/lib/approval-attachments";
import { verifyReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(
  request: Request,
  { params }: { params: { recordId: string } },
) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";

    if (
      !verifyReviewToken(
        `overtime:${params.recordId}`,
        token,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid or expired review link." },
        { status: 403 },
      );
    }

    const record = await getOvertimeRecord(params.recordId);
    const f = record?.fields ?? {};

    const startTime = Number(f["Start Time"] ?? 0) || 0;
    const endTime = Number(f["End Time"] ?? 0) || 0;
    const durationHours =
      startTime > 0 && endTime > startTime
        ? Math.round(
            ((endTime - startTime) / 3_600_000) * 100,
          ) / 100
        : Number(f["Duration (Hours)"] ?? 0) || 0;

    return NextResponse.json({
      request: {
        recordId: params.recordId,
        requestId:
          text(f["Overtime Request ID"]) ||
          text(f["Request ID"]),
        employeeName: text(f["Employee Name"]),
        employeeId: text(f["Employee ID"]),
        department: text(f["Department"]),
        approvalGroup: text(f["Approval Group"]),
        overtimeDate: Number(f["Overtime Date"] ?? 0) || 0,
        startTime,
        endTime,
        durationHours,
        publicHoliday: text(f["Public Holiday?"]),
        compensationMethod: text(f["Compensation Method"]),
        reason: text(f["Reason"]),
        submittedAt: Number(f["Submitted At"] ?? 0) || 0,
        attachments: extractApprovalAttachments(f["Attachment"]),
        status: text(f["Status"]) || "Pending",
        rejectionReason: text(f["Rejection Reason"]),
        approvalComment: text(f["Approval Comment"]),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Overtime request.",
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
    const token =
      typeof body.token === "string" ? body.token : "";

    if (
      !verifyReviewToken(
        `overtime:${params.recordId}`,
        token,
      )
    ) {
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

    const record = await getOvertimeRecord(params.recordId);
    const f = record?.fields ?? {};
    const currentStatus = text(f["Status"]);

    if (currentStatus && currentStatus !== "Pending") {
      return NextResponse.json(
        {
          error: `This request is already ${currentStatus}.`,
        },
        { status: 409 },
      );
    }

    const rejectionReason = text(body.rejectionReason);
    const approvalComment = text(body.approvalComment);

    if (
      decision === "Rejected" &&
      rejectionReason.length < 2
    ) {
      return NextResponse.json(
        { error: "Please enter a rejection reason." },
        { status: 400 },
      );
    }

    await updateOvertimeDecision({
      recordId: params.recordId,
      decision,
      rejectionReason,
      approvalComment,
    });

    const requestId =
      text(f["Overtime Request ID"]) ||
      text(f["Request ID"]);
    const warnings: string[] = [];

    try {
      await updateOvertimeApprovalGroupDecision({
        approvalGroup: text(f["Approval Group"]),
        mainRecordId: params.recordId,
        requestId,
        decision,
        rejectionReason,
        approvalComment,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "Unable to sync approval table.",
      );
    }

    try {
      const startTime = Number(f["Start Time"] ?? 0) || 0;
      const endTime = Number(f["End Time"] ?? 0) || 0;
      const durationHours =
        startTime > 0 && endTime > startTime
          ? Math.round(
              ((endTime - startTime) / 3_600_000) * 100,
            ) / 100
          : Number(f["Duration (Hours)"] ?? 0) || 0;

      await sendOvertimeDecisionCard({
        approvalGroup: text(f["Approval Group"]),
        employeeName: text(f["Employee Name"]),
        requestId,
        overtimeDate: Number(f["Overtime Date"] ?? 0) || 0,
        startTime,
        endTime,
        durationHours,
        compensationMethod: text(
          f["Compensation Method"],
        ),
        decision,
        rejectionReason,
        approvalComment,
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
            : "Unable to process Overtime decision.",
      },
      { status: 500 },
    );
  }
}
