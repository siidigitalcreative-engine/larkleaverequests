import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const webhook =
    process.env.LARK_REQUEST_NOTIFICATION_WEBHOOK ||
    process.env.LARK_REQUEST_FEED_WEBHOOK;

  if (!webhook) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Request Notifications webhook environment variable is missing.",
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text: "Request Notifications test — webhook is working.",
        },
      }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || (data && data.code && data.code !== 0)) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.msg || response.statusText,
          larkCode: data?.code ?? null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        "Test message sent to Request Notifications.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Webhook test failed.",
      },
      { status: 500 },
    );
  }
}
