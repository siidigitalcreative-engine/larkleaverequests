import { NextResponse } from "next/server";
import {
  getOffsetApprovalRecord,
  updateOffsetApprovalDecision,
  updateExtraApprovalGroupDecision,
  sendExtraApprovalDecisionCard,
} from "@/lib/general-offset-approvals";
import { extractApprovalAttachments } from "@/lib/approval-attachments";
import { verifyReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function dateText(value: unknown) {
  const n = numberValue(value);
  if (!n) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(n));
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
        `offset-approval:${params.recordId}`,
        token,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid or expired review link." },
        { status: 403 },
      );
    }

    const record =
      await getOffsetApprovalRecord(params.recordId);
    const f = record?.fields ?? {};

    return NextResponse.json({
      request: {
        recordId: params.recordId,
        requestId:
          text(f["Offset Request ID"]) ||
          text(f["Request ID"]),
        employeeName: text(f["Employee Name"]),
        employeeId: text(f["Employee ID"]),
        department: text(f["Department"]),
        approvalGroup: text(f["Approval Group"]),
        dateWorked:
          numberValue(f["Date Worked"]),
        workType: text(f["Work Type"]),
        requestedOffsetDate:
          numberValue(
            f["Requested Offset Date"],
          ),
        hoursWorked:
          Number(f["Hours Worked"] ?? 0) || 0,
        reason:
          text(f["Reason / Work Details"]),
        submittedAt:
          numberValue(f["Submitted At"]),
        attachments:
          extractApprovalAttachments(
            f["Attachment"],
          ),
        status:
          text(f["Status"]) || "Pending",
        rejectionReason:
          text(f["Rejection Reason"]),
        approvalComment:
          text(f["Approval Comment"]),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Offset Approval request.",
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
      typeof body.token === "string"
        ? body.token
        : "";

    if (
      !verifyReviewToken(
        `offset-approval:${params.recordId}`,
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

    const record =
      await getOffsetApprovalRecord(params.recordId);
    const f = record?.fields ?? {};
    const currentStatus =
      text(f["Status"]);

    if (
      currentStatus &&
      currentStatus !== "Pending"
    ) {
      return NextResponse.json(
        {
          error: `This request is already ${currentStatus}.`,
        },
        { status: 409 },
      );
    }

    const rejectionReason =
      text(body.rejectionReason);
    const approvalComment =
      text(body.approvalComment);

    if (
      decision === "Rejected" &&
      rejectionReason.length < 2
    ) {
      return NextResponse.json(
        {
          error:
            "Please enter a rejection reason.",
        },
        { status: 400 },
      );
    }

    await updateOffsetApprovalDecision({
      recordId: params.recordId,
      decision,
      rejectionReason,
      approvalComment,
    });

    const requestId =
      text(f["Offset Request ID"]) ||
      text(f["Request ID"]);

    const warnings: string[] = [];

    try {
      await updateExtraApprovalGroupDecision({
        approvalGroup:
          text(f["Approval Group"]),
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
      await sendExtraApprovalDecisionCard({
        requestType: "Offset Approval",
        approvalGroup:
          text(f["Approval Group"]),
        employeeName:
          text(f["Employee Name"]),
        requestId,
        summaryLines: [
          `Date Worked: ${dateText(
            f["Date Worked"],
          )}`,
          `Requested Offset Date: ${dateText(
            f["Requested Offset Date"],
          )}`,
          `Hours Worked: ${
            Number(
              f["Hours Worked"] ?? 0,
            ) || 0
          }`,
        ],
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
            : "Unable to process Offset Approval decision.",
      },
      { status: 500 },
    );
  }
}
