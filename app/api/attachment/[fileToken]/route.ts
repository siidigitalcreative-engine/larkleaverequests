import { NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFromName(name: string) {
  const lower = name.toLowerCase();

  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".pdf")) return "application/pdf";

  return "";
}

export async function GET(
  request: Request,
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

    const url = new URL(request.url);
    const fileName = String(url.searchParams.get("name") || "attachment").trim();

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

    if (!response.ok) {
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

    const bytes = await response.arrayBuffer();

    if (!bytes.byteLength) {
      return NextResponse.json(
        { error: "Attachment download returned an empty file." },
        { status: 502 },
      );
    }

    const upstreamType =
      response.headers.get("content-type") || "";

    const inferredType = contentTypeFromName(fileName);

    // Lark may return application/octet-stream for Base attachments.
    // For browser previews, use the known filename extension when possible.
    const contentType =
      inferredType ||
      (upstreamType &&
      upstreamType !== "application/octet-stream"
        ? upstreamType
        : "application/octet-stream");

    const safeName =
      fileName.replace(/[\r\n"]/g, "") || "attachment";

    const headers = new Headers();

    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `inline; filename="${safeName}"`,
    );
    headers.set(
      "Cache-Control",
      "private, no-store, no-cache, max-age=0",
    );
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(bytes, {
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
