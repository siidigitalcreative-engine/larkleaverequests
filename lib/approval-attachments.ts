import { getTenantAccessToken } from "@/lib/lark";

export type ApprovalAttachment = {
  fileToken: string;
  name: string;
  type?: string;
  size?: number;
};

function attachmentItems(value: unknown): any[] {
  if (Array.isArray(value)) return value;

  // Some Lark responses can wrap field values.
  if (
    value &&
    typeof value === "object"
  ) {
    const item = value as any;

    if (Array.isArray(item.value)) {
      return item.value;
    }

    if (Array.isArray(item.attachments)) {
      return item.attachments;
    }

    if (
      item.file_token ||
      item.fileToken ||
      item.token
    ) {
      return [item];
    }
  }

  return [];
}

export function extractApprovalAttachments(
  value: unknown,
): ApprovalAttachment[] {
  return attachmentItems(value)
    .map((item: any) => {
      const nested =
        item?.value &&
        typeof item.value === "object"
          ? item.value
          : item;

      return {
        fileToken: String(
          nested?.file_token ??
            nested?.fileToken ??
            nested?.token ??
            "",
        ).trim(),
        name: String(
          nested?.name ??
            nested?.file_name ??
            nested?.fileName ??
            "Attachment",
        ).trim(),
        type:
          String(
            nested?.type ??
              nested?.mime_type ??
              nested?.mimeType ??
              "",
          ).trim() || undefined,
        size:
          Number(nested?.size ?? 0) > 0
            ? Number(nested?.size)
            : undefined,
      };
    })
    .filter((item) => item.fileToken);
}

export async function uploadApprovalCardImage(
  file: File,
): Promise<string | undefined> {
  if (
    !file.type
      ?.toLowerCase()
      .startsWith("image/")
  ) {
    return undefined;
  }

  const token =
    await getTenantAccessToken();

  const form = new FormData();

  form.set("image_type", "message");
  form.set(
    "image",
    file,
    file.name ||
      `attachment-${Date.now()}`,
  );

  const response = await fetch(
    "https://open.larksuite.com/open-apis/im/v1/images",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (
    !response.ok ||
    data.code !== 0 ||
    !data.data?.image_key
  ) {
    throw new Error(
      `Lark image upload error: ${
        data.msg || response.statusText
      }`,
    );
  }

  return String(data.data.image_key);
}
