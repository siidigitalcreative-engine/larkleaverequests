import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listActiveEmployees,
  uploadLeaveAttachment,
} from "@/lib/lark";
import {
  createOvertimeApprovalGroupRecord,
  createOvertimeRequest,
  sendOvertimeApprovalCard,
} from "@/lib/overtime";
import { uploadApprovalCardImage } from "@/lib/approval-attachments";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { makeReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";

const schema = z.object({
  overtimeDate: z.string().min(10).max(10),
  startTime: z.string().min(4).max(8),
  endTime: z.string().min(4).max(8),
  publicHoliday: z.enum(["Yes", "No"]),
  compensationMethod: z.enum([
    "Apply for days off",
    "Apply for overtimes payment",
  ]),
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
      overtimeDate: String(
        form.get("overtimeDate") ?? "",
      ),
      startTime: String(form.get("startTime") ?? ""),
      endTime: String(form.get("endTime") ?? ""),
      publicHoliday: String(
        form.get("publicHoliday") ?? "",
      ),
      compensationMethod: String(
        form.get("compensationMethod") ?? "",
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

    if (attachment instanceof File && attachment.size > 0) {
      if (attachment.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "Overtime attachment must be 10 MB or smaller.",
          },
          { status: 400 },
        );
      }

      attachmentName =
        attachment.name || "Overtime attachment";

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
            "Overtime card image upload failed:",
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
      overtimeDate: body.overtimeDate,
      startTime: body.startTime,
      endTime: body.endTime,
      publicHoliday: body.publicHoliday,
      compensationMethod: body.compensationMethod,
      reason: body.reason,
      submittedAt,
      attachmentToken,
      attachmentImageKey,
      attachmentName,
    } as const;

    const created = await createOvertimeRequest(input);

    const reviewToken = makeReviewToken(
      `overtime:${created.recordId}`,
    );

    const routingWarnings: string[] = [];

    try {
      const approvalRecord =
        await createOvertimeApprovalGroupRecord({
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
      await sendOvertimeApprovalCard({
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

    return NextResponse.json({
      ok: true,
      requestId: created.requestId,
      durationHours: created.durationHours,
      approvalGroup: input.approvalGroup,
      routingWarnings,
    });
  } catch (error) {
    console.error("Overtime request failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to submit Overtime request.",
      },
      { status: 500 },
    );
  }
}
