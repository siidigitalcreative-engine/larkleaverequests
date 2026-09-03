import { NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { fileToken: string } },
) {
  try {
    const fileToken = String(params.fileToken || "").trim();

    if (!fileToken) {
      return NextResponse.json(
        { error: "Missing attachment token." },
        { status: 400 },
      );
    }

    const token = await getTenantAccessToken();

    const response = await fetch(
      `https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(
        fileToken,
      )}/download`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => "");
      return NextResponse.json(
        {
          error:
            message ||
            `Unable to download attachment (${response.status}).`,
        },
        { status: response.status || 500 },
      );
    }

    const headers = new Headers();

    headers.set(
      "Content-Type",
      response.headers.get("content-type") ||
        "application/octet-stream",
    );
    headers.set(
      "Cache-Control",
      "private, no-store, no-cache, max-age=0",
    );

    const disposition =
      response.headers.get("content-disposition");

    if (disposition) {
      headers.set("Content-Disposition", disposition);
    }

    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load attachment.",
      },
      { status: 500 },
    );
  }
}
