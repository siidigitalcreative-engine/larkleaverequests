import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createChangeOffApprovalGroupRecord,
  createChangeOffRequest,
  uploadLeaveAttachment,
} from "@/lib/lark";
import { uploadApprovalCardImage } from "@/lib/approval-attachments";
import {
  attachToChangeOffApprovalCopy,
  attachToChangeOffMaster,
  sendChangeOffApprovalCardEnhanced,
} from "@/lib/change-off-enhanced";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

const schema = z.object({
  currentOffDate: z.string().min(10).max(10),
  requestedNewOffDate: z.string().min(10).max(10),
  reason: z.string().min(3).max(2000),
});

export async function POST(request: Request) {
  try {
    const session = verifySessionToken(
      cookies().get(SESSION_COOKIE_NAME)?.value,
    );

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Please verify your identity again.",
        },
        { status: 401 },
      );
    }

    const form = await request.formData();

    const body = schema.parse({
      currentOffDate: String(
        form.get("currentOffDate") ?? "",
      ),
      requestedNewOffDate: String(
        form.get("requestedNewOffDate") ?? "",
      ),
      reason: String(form.get("reason") ?? ""),
    });

    if (
      body.currentOffDate ===
      body.requestedNewOffDate
    ) {
      return NextResponse.json(
        {
          error:
            "Current and requested new off-date cannot be the same.",
        },
        { status: 400 },
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
              "Attachment must be 10 MB or smaller.",
          },
          { status: 400 },
        );
      }

      attachmentName =
        attachment.name ||
        "Change Day-Off attachment";

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
          // Master request should still succeed if
          // inline image preview cannot be uploaded.
          console.error(
            "Change Day-Off card image upload failed:",
            error,
          );
        }
      }
    }

    const submittedAt = Date.now();

    const input = {
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      department: session.department,
      approvalGroup:
        session.leaveApprovalGroup,
      currentOffDate: body.currentOffDate,
      requestedNewOffDate:
        body.requestedNewOffDate,
      reason: body.reason,
      submittedAt,
    };

    // 1) Create master record first.
    const created =
      await createChangeOffRequest(input);

    const reviewToken = makeReviewToken(
      `change-off:${created.recordId}`,
    );

    const routingWarnings: string[] = [];

    // 2) Add attachment to master record.
    if (attachmentToken) {
      try {
        const result =
          await attachToChangeOffMaster(
            created.recordId,
            attachmentToken,
          );

        if (
          !result.updated &&
          result.warning
        ) {
          routingWarnings.push(result.warning);
        }
      } catch (error) {
        routingWarnings.push(
          error instanceof Error
            ? error.message
            : "Unable to save Change Day-Off attachment.",
        );
      }
    }

    // 3) Create approval-group copy.
    let approvalRecordCreated = false;

    try {
      const approvalRecord =
        await createChangeOffApprovalGroupRecord(
          {
            ...input,
            mainRecordId: created.recordId,
            requestId: created.requestId,
          },
        );

      if (!approvalRecord.created) {
        routingWarnings.push(
          approvalRecord.reason,
        );
      } else {
        approvalRecordCreated = true;
      }
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to create approval-group record.",
      );
    }

    // 4) Copy attachment to approval-group record.
    if (
      attachmentToken &&
      approvalRecordCreated
    ) {
      try {
        const result =
          await attachToChangeOffApprovalCopy({
            approvalGroup:
              input.approvalGroup,
            mainRecordId:
              created.recordId,
            requestId: created.requestId,
            attachmentToken,
          });

        if (
          !result.updated &&
          result.warning
        ) {
          routingWarnings.push(result.warning);
        }
      } catch (error) {
        routingWarnings.push(
          error instanceof Error
            ? error.message
            : "Unable to sync attachment to approval table.",
        );
      }
    }

    // 5) Send approval card with Date Filed
    // and inline image preview when applicable.
    try {
      await sendChangeOffApprovalCardEnhanced(
        {
          ...input,
          recordId: created.recordId,
          requestId: created.requestId,
          reviewToken,
          attachmentToken,
          attachmentImageKey,
          attachmentName,
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
