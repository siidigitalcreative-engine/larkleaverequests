import { NextResponse } from "next/server";
import { verifyEmployee } from "@/lib/lark";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const employeeName =
      typeof body.employeeName === "string"
        ? body.employeeName.trim()
        : "";

    const mobileNumber =
      typeof body.mobileNumber === "string"
        ? body.mobileNumber.trim()
        : "";

    const staySignedIn = body.staySignedIn !== false;

    if (
      employeeName.length < 2 ||
      mobileNumber.replace(/\D/g, "").length < 10
    ) {
      return NextResponse.json(
        {
          error:
            "Select your name and enter your registered mobile number.",
        },
        { status: 400 },
      );
    }

    const employee = await verifyEmployee({
      employeeName,
      mobileNumber,
    });

    if (!employee) {
      return NextResponse.json(
        {
          error:
            "The selected name and mobile number do not match an active employee record.",
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      employee: {
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        department: employee.department ?? "",
        leaveApprovalGroup: employee.leaveApprovalGroup,
      },
      staySignedIn,
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      createSessionToken(
        {
          employeeId: employee.employeeId,
          employeeName: employee.employeeName,
          department: employee.department,
          leaveApprovalGroup:
            employee.leaveApprovalGroup,
        },
        staySignedIn,
      ),
      sessionCookieOptions(staySignedIn),
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Verification failed.",
      },
      { status: 500 },
    );
  }
}
