import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { listEmployeeApprovalHistory } from "@/lib/lark";
import { listEmployeeOvertimeHistory } from "@/lib/overtime";
import { listEmployeeUndertimeHistory } from "@/lib/undertime";
import {
  listEmployeeGeneralApprovalHistory,
  listEmployeeOffsetApprovalHistory,
} from "@/lib/general-offset-approvals";
import { makeReviewToken } from "@/lib/reviewToken";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
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

    const [
      existingItems,
      overtimeItems,
      undertimeItems,
      generalApprovalItems,
      offsetApprovalItems,
    ] = await Promise.all([
      listEmployeeApprovalHistory(session.employeeId),
      listEmployeeOvertimeHistory(session.employeeId),
      listEmployeeUndertimeHistory(session.employeeId),
      listEmployeeGeneralApprovalHistory(session.employeeId),
      listEmployeeOffsetApprovalHistory(session.employeeId),
    ]);

    const slugForType = (requestType: string) => {
      if (requestType === "Leave Request") return "leave";
      if (requestType === "Change Day-Off") return "change-day-off";
      if (requestType === "Overtime") return "overtime";
      if (requestType === "Undertime") return "undertime";
      if (requestType === "General Approval") return "general-approval";
      return "offset-approval";
    };

    const baseUrl = String(process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");

    const items = [
      ...existingItems,
      ...overtimeItems,
      ...undertimeItems,
      ...generalApprovalItems,
      ...offsetApprovalItems,
    ]
      .map((item) => {
        const slug = slugForType(item.requestType);
        const recordId = String(item.recordId || "").trim();

        if (!recordId) {
          return { ...item, viewUrl: "" };
        }

        const token = makeReviewToken(`request-view:${slug}:${recordId}`);
        const relativeUrl =
          `/request/${encodeURIComponent(slug)}/${encodeURIComponent(recordId)}` +
          `?token=${encodeURIComponent(token)}`;

        return {
          ...item,
          viewUrl: baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl,
        };
      })
      .sort(
        (a, b) =>
          Number(b.submittedAt || 0) -
          Number(a.submittedAt || 0),
      );

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Approval history load failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load approval history.",
      },
      { status: 500 },
    );
  }
}
