import { NextResponse } from "next/server";
import { listNotifyContacts } from "@/lib/lark";

export const runtime = "nodejs";

export async function GET() {
  try {
    const contacts = await listNotifyContacts();
    return NextResponse.json({
      contacts: contacts.map((x) => ({ name: x.name })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load notify contacts." },
      { status: 500 },
    );
  }
}
