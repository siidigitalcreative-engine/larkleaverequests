import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listActiveEmployees,
  uploadLeaveAttachment,
} from "@/lib/lark";
import {
  createUndertimeApprovalGroupRecord,
  createUndertimeRequest,
  sendUndertimeApprovalCard,
} from "@/lib/undertime";
import { uploadApprovalCardImage } from "@/lib/approval-attachments";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

const schema = z.object({
  undertimeDate: z.string().min(10).max(10),
  requestedTimeOut: z.string().min(4).max(8),
  scheduledTimeOut: z.string().min(4).max(8),
  reason: z.string().min(3).max(2000),
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
      undertimeDate: String(
        form.get("undertimeDate") ?? "",
      ),
      requestedTimeOut: String(
        form.get("requestedTimeOut") ?? "",
      ),
      scheduledTimeOut: String(
        form.get("scheduledTimeOut") ?? "",
      ),
      reason: String(form.get("reason") ?? ""),
    });

    const employees = await listActiveEmployees();

    const currentEmployee = employees.find(
      (employee) =>
        employee.employeeId === session.employeeId,
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

    let attachmentToken: string | undefined;
    let attachmentImageKey: string | undefined;
    let attachmentName: string | undefined;

    const attachment = form.get("attachment");

    if (
      attachment instanceof File &&
      attachment.size > 0
    ) {
      if (attachment.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "Undertime attachment must be 10 MB or smaller.",
          },
          { status: 400 },
        );
      }

      attachmentName =
        attachment.name ||
        "Undertime attachment";

      attachmentToken =
        await uploadLeaveAttachment(attachment);

      if (
        attachment.type
          .toLowerCase()
          .startsWith("image/")
      ) {
        try {
          attachmentImageKey =
            await uploadApprovalCardImage(
              attachment,
            );
        } catch (error) {
          console.error(
            "Undertime card image upload failed:",
            error,
          );
        }
      }
    }

    const submittedAt = Date.now();

    const input = {
      employeeId:
        currentEmployee.employeeId,
      employeeName:
        currentEmployee.employeeName,
      department:
        currentEmployee.department,
      approvalGroup:
        currentEmployee.leaveApprovalGroup,
      undertimeDate:
        body.undertimeDate,
      requestedTimeOut:
        body.requestedTimeOut,
      scheduledTimeOut:
        body.scheduledTimeOut,
      reason: body.reason,
      submittedAt,
      attachmentToken,
      attachmentImageKey,
      attachmentName,
    } as const;

    const created =
      await createUndertimeRequest(
        input,
      );

    const reviewToken =
      makeReviewToken(
        `undertime:${created.recordId}`,
      );

    const routingWarnings: string[] = [];

    try {
      const approvalRecord =
        await createUndertimeApprovalGroupRecord(
          {
            ...input,
            mainRecordId:
              created.recordId,
            requestId:
              created.requestId,
          },
        );

      if (!approvalRecord.created) {
        routingWarnings.push(
          approvalRecord.reason,
        );
      }
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to create approval-group record.",
      );
    }

    try {
      await sendUndertimeApprovalCard(
        {
          ...input,
          recordId:
            created.recordId,
          requestId:
            created.requestId,
          reviewToken,
        },
      );
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to send approval-group card.",
      );
    }

    return NextResponse.json({
      ok: true,
      requestId:
        created.requestId,
      durationHours:
        created.durationHours,
      approvalGroup:
        input.approvalGroup,
      routingWarnings,
    });
  } catch (error) {
    console.error(
      "Undertime request failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit Undertime request.",
      },
      { status: 500 },
    );
  }
}
