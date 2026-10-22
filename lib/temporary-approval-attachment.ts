import { del, get } from "@vercel/blob";
import {
  uploadLeaveAttachment,
} from "@/lib/lark";
import {
  uploadApprovalCardImage,
} from "@/lib/approval-attachments";

const MAX_ATTACHMENT_BYTES =
  10 * 1024 * 1024;

export async function resolveTemporaryApprovalAttachment(
  input: {
    employeeId: string;
    pathname?: string;
    name?: string;
    contentType?: string;
  },
) {
  const pathname =
    String(input.pathname ?? "").trim();
  const name =
    String(input.name ?? "").trim();
  const contentType =
    String(input.contentType ?? "").trim();

  if (!pathname) {
    return {
      attachmentToken: undefined,
      attachmentImageKey: undefined,
      attachmentName: undefined,
    };
  }

  const requiredPrefix =
    `approvals-temp/${input.employeeId}/`;

  if (!pathname.startsWith(requiredPrefix)) {
    throw new Error(
      "Invalid temporary attachment path.",
    );
  }

  let shouldDelete = false;

  try {
    const result = await get(pathname, {
      access: "private",
      useCache: false,
    });

    if (
      !result ||
      result.statusCode !== 200 ||
      !result.stream
    ) {
      throw new Error(
        "Temporary attachment could not be loaded.",
      );
    }

    shouldDelete = true;

    const size =
      Number(result.blob.size ?? 0);

    if (
      size > 0 &&
      size > MAX_ATTACHMENT_BYTES
    ) {
      throw new Error(
        "Attachment must be 10 MB or smaller.",
      );
    }

    const response =
      new Response(result.stream);
    const blob =
      await response.blob();

    if (
      blob.size >
      MAX_ATTACHMENT_BYTES
    ) {
      throw new Error(
        "Attachment must be 10 MB or smaller.",
      );
    }

    const finalName =
      name ||
      result.blob.pathname
        .split("/")
        .pop() ||
      `attachment-${Date.now()}`;

    const finalType =
      contentType ||
      result.blob.contentType ||
      blob.type ||
      "application/octet-stream";

    const file = new File(
      [blob],
      finalName,
      {
        type: finalType,
      },
    );

    const attachmentToken =
      await uploadLeaveAttachment(file);

    let attachmentImageKey:
      | string
      | undefined;

    if (
      finalType
        .toLowerCase()
        .startsWith("image/")
    ) {
      try {
        attachmentImageKey =
          await uploadApprovalCardImage(
            file,
          );
      } catch (error) {
        console.error(
          "Approval card image upload failed:",
          error,
        );
      }
    }

    return {
      attachmentToken,
      attachmentImageKey,
      attachmentName: finalName,
    };
  } finally {
    if (shouldDelete) {
      try {
        await del(pathname);
      } catch (error) {
        console.error(
          "Temporary approval attachment cleanup failed:",
          error,
        );
      }
    }
  }
}
