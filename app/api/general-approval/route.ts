import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listActiveEmployees,
  uploadLeaveAttachment,
} from "@/lib/lark";
import { uploadApprovalCardImage } from "@/lib/approval-attachments";
import {
  createGeneralApprovalGroupRecord,
  createGeneralApprovalRequest,
  sendGeneralApprovalCard,
} from "@/lib/general-offset-approvals";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";
import { sendCentralRequestNotification } from "@/lib/request-notifications";

export const runtime = "nodejs";

const schema = z.object({
  requestCategory: z.enum([
    "Item Release",
    "Equipment",
    "Purchase",
    "Budget Request",
    "Other",
  ]),
  requestTitle: z.string().min(3).max(200),
  requestDetails: z.string().min(3).max(4000),
  amountBudget: z.string().max(50).optional().default(""),
});

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

    const form = await request.formData();

    const body = schema.parse({
      requestCategory: String(form.get("requestCategory") ?? ""),
      requestTitle: String(form.get("requestTitle") ?? ""),
      requestDetails: String(form.get("requestDetails") ?? ""),
      amountBudget: String(form.get("amountBudget") ?? ""),
    });

    const employees = await listActiveEmployees();
    const currentEmployee = employees.find(
      (employee) => employee.employeeId === session.employeeId,
    );

    if (!currentEmployee) {
      return NextResponse.json(
        {
          error:
            "Your employee record is inactive or no longer available. Please verify again.",
        },
        { status: 403 },
      );
    }

    const amountBudget = body.amountBudget.trim()
      ? Number(body.amountBudget.replace(/,/g, ""))
      : undefined;

    if (
      amountBudget !== undefined &&
      (!Number.isFinite(amountBudget) || amountBudget < 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Amount / Budget must be a valid non-negative number.",
        },
        { status: 400 },
      );
    }

    let attachmentToken: string | undefined;
    let attachmentImageKey: string | undefined;
    let attachmentName: string | undefined;

    const attachment = form.get("attachment");

    if (attachment instanceof File && attachment.size > 0) {
      if (attachment.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "General Approval attachment must be 10 MB or smaller.",
          },
          { status: 400 },
        );
      }

      attachmentName =
        attachment.name || "General Approval attachment";

      attachmentToken =
        await uploadLeaveAttachment(attachment);

      if (
        attachment.type
          .toLowerCase()
          .startsWith("image/")
      ) {
        try {
          attachmentImageKey =
            await uploadApprovalCardImage(attachment);
        } catch (error) {
          console.error(
            "General Approval card image upload failed:",
            error,
          );
        }
      }
    }

    const submittedAt = Date.now();

    const input = {
      employeeId: currentEmployee.employeeId,
      employeeName: currentEmployee.employeeName,
      department: currentEmployee.department,
      approvalGroup:
        currentEmployee.leaveApprovalGroup,
      requestCategory: body.requestCategory,
      requestTitle: body.requestTitle,
      requestDetails: body.requestDetails,
      amountBudget,
      submittedAt,
      attachmentToken,
      attachmentImageKey,
      attachmentName,
    } as const;

    const created =
      await createGeneralApprovalRequest(input);

    const reviewToken = makeReviewToken(
      `general-approval:${created.recordId}`,
    );

    const routingWarnings: string[] = [];

    try {
      const approvalRecord =
        await createGeneralApprovalGroupRecord({
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
      await sendGeneralApprovalCard({
        ...input,
        recordId: created.recordId,
        requestId: created.requestId,
        reviewToken,
      });
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to send approval-group card.",
      );
    }

    try {
      await sendCentralRequestNotification({
        requestType: "General Approval",
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        department: input.department,
        approvalGroup: input.approvalGroup,
        submittedAt: input.submittedAt,
        requestId: created.requestId,
        requestCategory: input.requestCategory,
        requestTitle: input.requestTitle,
        requestDetails: input.requestDetails,
        amountBudget: input.amountBudget,
        reason: input.requestDetails,
        attachmentImageKey,
        attachmentName,
      });
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to send centralized request notification.",
      );
    }

    return NextResponse.json({
      ok: true,
      requestId: created.requestId,
      approvalGroup: input.approvalGroup,
      routingWarnings,
    });
  } catch (error) {
    console.error("General Approval request failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit General Approval request.",
      },
      { status: 500 },
    );
  }
}
