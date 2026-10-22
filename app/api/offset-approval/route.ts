import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { listActiveEmployees } from "@/lib/lark";
import {
  createOffsetApprovalGroupRecord,
  createOffsetApprovalRequest,
  sendOffsetApprovalCard,
} from "@/lib/general-offset-approvals";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";
import { sendCentralRequestNotification } from "@/lib/request-notifications";
import { resolveTemporaryApprovalAttachment } from "@/lib/temporary-approval-attachment";

export const runtime = "nodejs";

const schema = z.object({
  dateWorked: z.string().min(10).max(10),
  workType: z.enum([
    "Weekend",
    "Rest Day",
    "Holiday",
    "Other",
  ]),
  requestedOffsetDate: z.string().min(10).max(10),
  hoursWorked: z.coerce.number().positive().max(24),
  reason: z.string().min(3).max(4000),
  attachmentBlobPathname: z.string().max(1000).optional().default(""),
  attachmentName: z.string().max(500).optional().default(""),
  attachmentType: z.string().max(200).optional().default(""),
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
      dateWorked: String(
        form.get("dateWorked") ?? "",
      ),
      workType: String(
        form.get("workType") ?? "",
      ),
      requestedOffsetDate: String(
        form.get("requestedOffsetDate") ?? "",
      ),
      hoursWorked: String(
        form.get("hoursWorked") ?? "",
      ),
      reason: String(
        form.get("reason") ?? "",
      ),
      attachmentBlobPathname: String(
        form.get("attachmentBlobPathname") ?? "",
      ),
      attachmentName: String(
        form.get("attachmentName") ?? "",
      ),
      attachmentType: String(
        form.get("attachmentType") ?? "",
      ),
    });

    if (
      body.dateWorked ===
      body.requestedOffsetDate
    ) {
      return NextResponse.json(
        {
          error:
            "Requested Offset Date must be different from Date Worked.",
        },
        { status: 400 },
      );
    }

    const employees =
      await listActiveEmployees();

    const currentEmployee =
      employees.find(
        (employee) =>
          employee.employeeId ===
          session.employeeId,
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

    const attachment =
      await resolveTemporaryApprovalAttachment({
        employeeId:
          currentEmployee.employeeId,
        pathname:
          body.attachmentBlobPathname,
        name:
          body.attachmentName,
        contentType:
          body.attachmentType,
      });

    const submittedAt =
      Date.now();

    const input = {
      employeeId:
        currentEmployee.employeeId,
      employeeName:
        currentEmployee.employeeName,
      department:
        currentEmployee.department,
      approvalGroup:
        currentEmployee.leaveApprovalGroup,
      dateWorked:
        body.dateWorked,
      workType:
        body.workType,
      requestedOffsetDate:
        body.requestedOffsetDate,
      hoursWorked:
        body.hoursWorked,
      reason:
        body.reason,
      submittedAt,
      attachmentToken:
        attachment.attachmentToken,
      attachmentImageKey:
        attachment.attachmentImageKey,
      attachmentName:
        attachment.attachmentName,
    } as const;

    const created =
      await createOffsetApprovalRequest(
        input,
      );

    const reviewToken =
      makeReviewToken(
        `offset-approval:${created.recordId}`,
      );

    const routingWarnings:
      string[] = [];

    try {
      const approvalRecord =
        await createOffsetApprovalGroupRecord({
          ...input,
          mainRecordId:
            created.recordId,
          requestId:
            created.requestId,
        });

      if (
        !approvalRecord.created
      ) {
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
      await sendOffsetApprovalCard({
        ...input,
        recordId:
          created.recordId,
        requestId:
          created.requestId,
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
        requestType:
          "Offset Approval",
        employeeId:
          input.employeeId,
        employeeName:
          input.employeeName,
        department:
          input.department,
        approvalGroup:
          input.approvalGroup,
        submittedAt:
          input.submittedAt,
        requestId:
          created.requestId,
        dateWorked:
          input.dateWorked,
        workType:
          input.workType,
        requestedOffsetDate:
          input.requestedOffsetDate,
        hoursWorked:
          input.hoursWorked,
        reason:
          input.reason,
        attachmentImageKey:
          input.attachmentImageKey,
        attachmentName:
          input.attachmentName,
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
      requestId:
        created.requestId,
      approvalGroup:
        input.approvalGroup,
      routingWarnings,
    });
  } catch (error) {
    console.error(
      "Offset Approval request failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit Offset Approval request.",
      },
      { status: 500 },
    );
  }
}
