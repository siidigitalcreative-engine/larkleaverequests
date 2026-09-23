import { NextResponse } from "next/server";
import {
  getGeneralApprovalRecord,
  updateGeneralApprovalDecision,
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

export async function GET(
  request: Request,
  { params }: { params: { recordId: string } },
) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";

    if (
      !verifyReviewToken(
        `general-approval:${params.recordId}`,
        token,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid or expired review link." },
        { status: 403 },
      );
    }

    const record =
      await getGeneralApprovalRecord(params.recordId);
    const f = record?.fields ?? {};

    return NextResponse.json({
      request: {
        recordId: params.recordId,
        requestId:
          text(f["General Approval Request ID"]) ||
          text(f["Request ID"]),
        employeeName: text(f["Employee Name"]),
        employeeId: text(f["Employee ID"]),
        department: text(f["Department"]),
        approvalGroup: text(f["Approval Group"]),
        requestCategory: text(f["Request Category"]),
        requestTitle: text(f["Request Title"]),
        requestDetails: text(f["Request Details"]),
        amountBudget:
          Number(f["Amount/Budget"] ?? 0) || 0,
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
            : "Unable to load General Approval request.",
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
        `general-approval:${params.recordId}`,
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
      await getGeneralApprovalRecord(params.recordId);
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

    await updateGeneralApprovalDecision({
      recordId: params.recordId,
      decision,
      rejectionReason,
      approvalComment,
    });

    const requestId =
      text(f["General Approval Request ID"]) ||
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
        requestType: "General Approval",
        approvalGroup:
          text(f["Approval Group"]),
        employeeName:
          text(f["Employee Name"]),
        requestId,
        summaryLines: [
          `Category: ${
            text(f["Request Category"]) || "—"
          }`,
          `Request Title: ${
            text(f["Request Title"]) || "—"
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
            : "Unable to process General Approval decision.",
      },
      { status: 500 },
    );
  }
}
