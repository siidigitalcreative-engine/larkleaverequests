import { NextResponse } from "next/server";
import {
  getLeaveRecord,
  updateLeaveDecisionFromCard,
} from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function extractCardAction(body: any) {
  const event = body?.event ?? body;
  const action = event?.action ?? {};
  const operator = event?.operator ?? body?.operator ?? {};

  return {
    actionValue: action?.value ?? {},
    operatorOpenId: text(operator?.open_id ?? operator?.openId),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Lark callback URL verification challenge.
    if (typeof body?.challenge === "string") {
      return NextResponse.json({ challenge: body.challenge });
    }

    const configuredToken = process.env.LARK_CARD_VERIFICATION_TOKEN;
    const incomingToken = text(
      body?.token ??
      body?.event?.token ??
      body?.header?.token,
    );

    if (configuredToken && incomingToken && incomingToken !== configuredToken) {
      return NextResponse.json({ error: "Invalid callback token." }, { status: 403 });
    }

    const { actionValue, operatorOpenId } = extractCardAction(body);
    const action = text(actionValue?.action);
    const recordId = text(actionValue?.recordId);

    if (
      !recordId ||
      (action !== "leave_approve" && action !== "leave_reject")
    ) {
      return NextResponse.json({
        toast: {
          type: "warning",
          content: "Unsupported leave action.",
        },
      });
    }

    const record = await getLeaveRecord(recordId);
    const fields = record?.fields ?? {};
    const currentStatus = text(fields["Status"]);

    if (currentStatus && currentStatus !== "Pending") {
      return NextResponse.json({
        toast: {
          type: "warning",
          content: `This leave request is already ${currentStatus}.`,
        },
      });
    }

    const decision = action === "leave_approve" ? "Approved" : "Rejected";

    await updateLeaveDecisionFromCard({
      recordId,
      decision,
    });

    console.log("Leave card action processed", {
      recordId,
      decision,
      operatorOpenId,
    });

    return NextResponse.json({
      toast: {
        type: "success",
        content:
          decision === "Approved"
            ? "Leave request approved."
            : "Leave request rejected.",
      },
    });
  } catch (error) {
    console.error("Lark leave card callback failed:", error);

    return NextResponse.json(
      {
        toast: {
          type: "error",
          content:
            error instanceof Error
              ? error.message
              : "Unable to process leave request.",
        },
      },
      { status: 500 },
    );
  }
}
