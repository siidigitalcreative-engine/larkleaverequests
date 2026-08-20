import { NextResponse } from "next/server";
import { listLeaveTypeOptions } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leaveTypes = await listLeaveTypeOptions();

    return NextResponse.json(
      { leaveTypes },
      {
        headers: {
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("Unable to load Leave Type options:", error);

    return NextResponse.json(
      {
        leaveTypes: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Leave Type options.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
        },
      },
    );
  }
}
