import { NextResponse } from "next/server";
import { getRequestView, isRequestViewType } from "@/lib/request-view";
import { getTenantAccessToken } from "@/lib/lark";
import { verifyReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function baseAppToken() {
  const value = process.env.LARK_BASE_APP_TOKEN;
  if (!value) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return value;
}

function tableIdFor(requestType: string) {
  if (requestType === "leave") {
    const value = process.env.LARK_LEAVE_TABLE_ID;
    if (!value) throw new Error("Missing LARK_LEAVE_TABLE_ID");
    return value;
  }

  if (requestType === "change-day-off") {
    const value = process.env.LARK_CHANGE_OFF_TABLE_ID;
    if (!value) throw new Error("Missing LARK_CHANGE_OFF_TABLE_ID");
    return value;
  }

  if (requestType === "overtime") {
    const value = process.env.LARK_OVERTIME_TABLE_ID;
    if (!value) throw new Error("Missing LARK_OVERTIME_TABLE_ID");
    return value;
  }

  if (requestType === "undertime") {
    const value = process.env.LARK_UNDERTIME_TABLE_ID;
    if (!value) throw new Error("Missing LARK_UNDERTIME_TABLE_ID");
    return value;
  }

  if (requestType === "general-approval") {
    const value = process.env.LARK_GENERAL_APPROVAL_TABLE_ID;
    if (!value) throw new Error("Missing LARK_GENERAL_APPROVAL_TABLE_ID");
    return value;
  }

  const value = process.env.LARK_OFFSET_APPROVAL_TABLE_ID;
  if (!value) throw new Error("Missing LARK_OFFSET_APPROVAL_TABLE_ID");
  return value;
}

function filedText(value: number) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

async function updateComments(
  tableId: string,
  recordId: string,
  comments: string,
) {
  const token = await getTenantAccessToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records/${recordId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        fields: {
          Comments: comments,
        },
      }),
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `Unable to save comment: ${data.msg || response.statusText}`,
    );
  }
}

function validToken(
  requestType: string,
  recordId: string,
  token: string,
) {
  return verifyReviewToken(
    `request-view:${requestType}:${recordId}`,
    token,
  );
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: {
      requestType: string;
      recordId: string;
    };
  },
) {
  try {
    const requestType = String(params.requestType || "").trim();
    const recordId = String(params.recordId || "").trim();

    if (!isRequestViewType(requestType) || !recordId) {
      return NextResponse.json(
        { error: "Invalid request link." },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";

    if (!validToken(requestType, recordId, token)) {
      return NextResponse.json(
        { error: "Invalid or expired request link." },
        { status: 403 },
      );
    }

    const requestView = await getRequestView(requestType, recordId);

    return NextResponse.json({
      request: requestView,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load request.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: {
      requestType: string;
      recordId: string;
    };
  },
) {
  try {
    const requestType = String(params.requestType || "").trim();
    const recordId = String(params.recordId || "").trim();

    if (!isRequestViewType(requestType) || !recordId) {
      return NextResponse.json(
        { error: "Invalid request link." },
        { status: 400 },
      );
    }

    const body = await request.json();

    const token = text(body.token);
    const commenterName = text(body.commenterName);
    const comment = text(body.comment);

    if (!validToken(requestType, recordId, token)) {
      return NextResponse.json(
        { error: "Invalid or expired request link." },
        { status: 403 },
      );
    }

    if (commenterName.length < 2) {
      return NextResponse.json(
        { error: "Please enter your name." },
        { status: 400 },
      );
    }

    if (!comment) {
      return NextResponse.json(
        { error: "Please enter a comment." },
        { status: 400 },
      );
    }

    if (comment.length > 4000) {
      return NextResponse.json(
        { error: "Comment must be 4000 characters or less." },
        { status: 400 },
      );
    }

    const current = await getRequestView(requestType, recordId);
    const previous = text(current.comments);

    const entry =
      `${filedText(Date.now())} — ${commenterName}\n` + comment;

    const comments = previous
      ? `${previous}\n\n${entry}`
      : entry;

    await updateComments(
      tableIdFor(requestType),
      recordId,
      comments,
    );

    return NextResponse.json({
      ok: true,
      comments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to add comment.",
      },
      { status: 500 },
    );
  }
}
