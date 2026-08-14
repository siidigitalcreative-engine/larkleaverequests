import { NextResponse } from "next/server";
import { listActiveEmployees } from "@/lib/lark";

export const runtime = "nodejs";

export async function GET() {
  try {
    const employees = await listActiveEmployees();
    return NextResponse.json({
      employees: employees.map((e) => ({
        employeeName: e.employeeName,
        department: e.department ?? "",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load employees." },
      { status: 500 },
    );
  }
}
