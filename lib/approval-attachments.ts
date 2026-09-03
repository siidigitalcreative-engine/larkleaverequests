import { getTenantAccessToken } from "@/lib/lark";

export type ApprovalAttachment = {
  fileToken: string;
  name: string;
  type?: string;
  size?: number;
};

export function extractApprovalAttachments(value: unknown): ApprovalAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => ({
      fileToken: String(
        item?.file_token ??
          item?.fileToken ??
          item?.token ??
          "",
      ).trim(),
      name: String(
        item?.name ??
          item?.file_name ??
          "Attachment",
      ).trim(),
      type: String(
        item?.type ??
          item?.mime_type ??
          "",
      ).trim() || undefined,
      size:
        Number(item?.size ?? 0) > 0
          ? Number(item?.size)
          : undefined,
    }))
    .filter((item) => item.fileToken);
}

export async function uploadApprovalCardImage(
  file: File,
): Promise<string | undefined> {
  if (!file.type?.toLowerCase().startsWith("image/")) {
    return undefined;
  }

  const token = await getTenantAccessToken();
  const form = new FormData();

  form.set("image_type", "message");
  form.set("image", file, file.name || `attachment-${Date.now()}`);

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
