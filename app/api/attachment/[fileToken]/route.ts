import { NextResponse } from "next/server";
import { getTenantAccessToken } from "@/lib/lark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceType = "leave" | "overtime" | "change-off";

function tableIdForSource(source: SourceType) {
  if (source === "leave") {
    const value = process.env.LARK_LEAVE_TABLE_ID;
    if (!value) throw new Error("Missing LARK_LEAVE_TABLE_ID");
    return value;
  }

  if (source === "overtime") {
    const value = process.env.LARK_OVERTIME_TABLE_ID;
    if (!value) throw new Error("Missing LARK_OVERTIME_TABLE_ID");
    return value;
  }

  const value = process.env.LARK_CHANGE_OFF_TABLE_ID;
  if (!value) throw new Error("Missing LARK_CHANGE_OFF_TABLE_ID");
  return value;
}

function contentTypeFromName(name: string) {
  const lower = name.toLowerCase();

  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".pdf")) return "application/pdf";

  return "";
}

async function attachmentFieldId(
  appToken: string,
  tableId: string,
) {
  const token = await getTenantAccessToken();
  const url = new URL(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
  );
  url.searchParams.set("page_size", "100");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `Unable to read Base fields: ${data.msg || response.statusText}`,
    );
  }

  const fields = data.data?.items ?? [];

  const attachment = fields.find(
    (field: any) =>
      String(field?.field_name ?? "").trim() === "Attachment",
  );

  const fieldId = String(
    attachment?.field_id ?? attachment?.fieldId ?? "",
  ).trim();

  if (!fieldId) {
    throw new Error(
      'Attachment field was not found. The field must be named exactly "Attachment".',
    );
  }

  return fieldId;
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

    const sourceRaw = String(
      url.searchParams.get("source") || "",
    ).trim();

    if (
      sourceRaw !== "leave" &&
      sourceRaw !== "overtime" &&
      sourceRaw !== "change-off"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid attachment source." },
        { status: 400 },
      );
    }

    const source = sourceRaw as SourceType;
    const recordId = String(
      url.searchParams.get("recordId") || "",
    ).trim();
    const fileName = String(
      url.searchParams.get("name") || "attachment",
    ).trim();

    if (!recordId) {
      return NextResponse.json(
        { error: "Missing attachment record ID." },
        { status: 400 },
      );
    }

    const appToken = process.env.LARK_BASE_APP_TOKEN;

    if (!appToken) {
      throw new Error("Missing LARK_BASE_APP_TOKEN");
    }

    const tableId = tableIdForSource(source);
    const fieldId = await attachmentFieldId(
      appToken,
      tableId,
    );

    const extra = JSON.stringify({
      bitablePerm: {
        tableId,
        attachments: {
          [fieldId]: {
            [recordId]: [fileToken],
          },
        },
      },
    });

    const token = await getTenantAccessToken();

    const downloadUrl = new URL(
      `https://open.larksuite.com/open-apis/drive/v1/medias/${encodeURIComponent(
        fileToken,
      )}/download`,
    );

    // Required for Base attachments when advanced permissions are enabled.
    downloadUrl.searchParams.set("extra", extra);

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

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
