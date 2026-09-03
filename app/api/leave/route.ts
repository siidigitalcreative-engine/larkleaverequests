import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createApprovalGroupRecord,
  createLeaveRequest,
  listNotifyContacts,
  sendDirectNotifyMessage,
  uploadLeaveAttachment,
} from "@/lib/lark";
import { uploadApprovalCardImage } from "@/lib/approval-attachments";
import { sendLeaveApprovalCardEnhanced } from "@/lib/approval-cards";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

const schema = z.object({
  leaveType: z.string().min(2).max(100),
  startDate: z.string().min(10).max(10),
  endDate: z.string().min(10).max(10),
  dayType: z.enum(["Full Day", "Partial Day"]),
  startTime: z.string().max(10).optional(),
  endTime: z.string().max(10).optional(),
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

    const parsed = schema.parse({
      leaveType: String(form.get("leaveType") ?? ""),
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? ""),
      dayType: String(form.get("dayType") ?? ""),
      startTime:
        String(form.get("startTime") ?? "") || undefined,
      endTime:
        String(form.get("endTime") ?? "") || undefined,
      reason: String(form.get("reason") ?? ""),
    });

    if (parsed.endDate < parsed.startDate) {
      return NextResponse.json(
        { error: "End date cannot be before start date." },
        { status: 400 },
      );
    }

    if (
      parsed.dayType === "Partial Day" &&
      (!parsed.startTime || !parsed.endTime)
    ) {
      return NextResponse.json(
        {
          error:
            "Start and end time are required for Partial Day leave.",
        },
        { status: 400 },
      );
    }

    const notifyNames = form
      .getAll("notify")
      .map((x) => String(x).trim())
      .filter(Boolean);

    let attachmentToken: string | undefined;
    let attachmentImageKey: string | undefined;
    let attachmentName: string | undefined;

    const attachment = form.get("attachment");

    if (attachment instanceof File && attachment.size > 0) {
      if (attachment.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Attachment must be 10 MB or smaller." },
          { status: 400 },
        );
      }

      attachmentName =
        attachment.name || "Leave attachment";

      attachmentToken =
        await uploadLeaveAttachment(attachment);

      // For image attachments, also upload a copy to Lark IM so
      // the Custom Bot approval card can show an actual image preview.
      if (
        attachment.type
          .toLowerCase()
          .startsWith("image/")
      ) {
        try {
          attachmentImageKey =
            await uploadApprovalCardImage(attachment);
        } catch (error) {
          // Do not fail the Leave request if inline-card image upload fails.
          console.error(
            "Leave card image upload failed:",
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
      approvalGroup: session.leaveApprovalGroup,
      ...parsed,
      notifyNames,
      attachmentToken,
      submittedAt,
    };

    const created = await createLeaveRequest(input);
    const reviewToken = makeReviewToken(created.recordId);

    const routingWarnings: string[] = [];
    let approvalRecordCreated = false;
    let approvalTableId = "";

    try {
      const approvalRecord =
        await createApprovalGroupRecord({
          ...input,
          mainRecordId: created.recordId,
          requestId: created.requestId,
        });

      if (!approvalRecord.created) {
        routingWarnings.push(approvalRecord.reason);
      } else {
        approvalRecordCreated = true;
        approvalTableId = approvalRecord.tableId;
      }
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to create approval-group record.",
      );
    }

    try {
      await sendLeaveApprovalCardEnhanced({
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        department: input.department,
        approvalGroup: input.approvalGroup,
        leaveType: input.leaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        dayType: input.dayType,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
        submittedAt: input.submittedAt,
        recordId: created.recordId,
        requestId: created.requestId,
        reviewToken,
        attachmentImageKey,
        attachmentName,
      });
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to send approval-group webhook.",
      );
    }

    const notifyFailures: string[] = [];

    try {
      const contacts = await listNotifyContacts();
      const selectedContacts = contacts.filter((x) =>
        notifyNames.includes(x.name),
      );

      for (const contact of selectedContacts) {
        try {
          await sendDirectNotifyMessage(
            contact.openId,
            `${session.employeeName} submitted a ${parsed.leaveType} request for ${parsed.startDate} to ${parsed.endDate}. Status: Pending Approval.`,
          );
        } catch {
          notifyFailures.push(contact.name);
        }
      }
    } catch (error) {
      routingWarnings.push(
        error instanceof Error
          ? error.message
          : "Unable to process notify contacts.",
      );
    }

    return NextResponse.json({
      ok: true,
      requestId: created.requestId,
      approvalRecordCreated,
      approvalTableId,
      notifyFailures,
      routingWarnings,
    });
  } catch (error) {
    console.error("Leave request failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Leave request failed.",
      },
      { status: 500 },
    );
  }
}
