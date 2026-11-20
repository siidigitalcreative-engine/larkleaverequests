import { NextResponse } from "next/server";
import {
  getRequestView,
  isRequestViewType,
} from "@/lib/request-view";
import { verifyReviewToken } from "@/lib/reviewToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (
      !verifyReviewToken(
        `request-view:${requestType}:${recordId}`,
        token,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid or expired request link." },
        { status: 403 },
      );
    }

    const requestView = await getRequestView(requestType, recordId);

    return NextResponse.json({ request: requestView });
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
