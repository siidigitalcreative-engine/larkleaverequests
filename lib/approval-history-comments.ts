import { getTenantAccessToken, uploadLeaveAttachment } from "@/lib/lark";
import { extractApprovalAttachments, uploadApprovalCardImage } from "@/lib/approval-attachments";
import { makeReviewToken } from "@/lib/reviewToken";

export type HistoryCommentRequestType =
  | "Leave Request"
  | "Change Day-Off"
  | "Overtime"
  | "Undertime";

type RequestConfig = {
  tableId: string;
  requestIdFields: string[];
  label: string;
  tokenKey: (recordId: string) => string;
  reviewPath: (recordId: string) => string;
};

function baseAppToken() {
  const value = process.env.LARK_BASE_APP_TOKEN;
  if (!value) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return value;
}

function configFor(type: HistoryCommentRequestType): RequestConfig {
  if (type === "Leave Request") {
    const tableId = process.env.LARK_LEAVE_TABLE_ID;
    if (!tableId) throw new Error("Missing LARK_LEAVE_TABLE_ID");
    return {
      tableId,
      requestIdFields: ["Leave Request ID", "Request ID"],
      label: "Leave Request",
      tokenKey: (recordId) => recordId,
      reviewPath: (recordId) => `/review/${encodeURIComponent(recordId)}`,
    };
  }

  if (type === "Change Day-Off") {
    const tableId = process.env.LARK_CHANGE_OFF_TABLE_ID;
    if (!tableId) throw new Error("Missing LARK_CHANGE_OFF_TABLE_ID");
    return {
      tableId,
      requestIdFields: ["Change Off Request ID", "Request ID"],
      label: "Change Day-Off",
      tokenKey: (recordId) => `change-off:${recordId}`,
      reviewPath: (recordId) =>
        `/review/change-day-off/${encodeURIComponent(recordId)}`,
    };
  }

  if (type === "Overtime") {
    const tableId = process.env.LARK_OVERTIME_TABLE_ID;
    if (!tableId) throw new Error("Missing LARK_OVERTIME_TABLE_ID");
    return {
      tableId,
      requestIdFields: ["Overtime Request ID", "Request ID"],
      label: "Overtime",
      tokenKey: (recordId) => `overtime:${recordId}`,
      reviewPath: (recordId) =>
        `/review/overtime/${encodeURIComponent(recordId)}`,
    };
  }

  const tableId = process.env.LARK_UNDERTIME_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_UNDERTIME_TABLE_ID");
  return {
    tableId,
    requestIdFields: ["Undertime Request ID", "Request ID"],
    label: "Undertime",
    tokenKey: (recordId) => `undertime:${recordId}`,
    reviewPath: (recordId) =>
      `/review/undertime/${encodeURIComponent(recordId)}`,
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function dateText(value: unknown) {
  const n = numberValue(value);
  if (!n) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(n));
}

function timeText(value: unknown) {
  const n = numberValue(value);
  if (!n) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(n));
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

async function listRecords(tableId: string) {
  const token = await getTenantAccessToken();
  const appToken = baseAppToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(`Lark Base read error: ${data.msg || response.statusText}`);
    }

    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more
      ? String(data.data?.page_token ?? "")
      : "";
  } while (pageToken);

  return items;
}

async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  const token = await getTenantAccessToken();
  const appToken = baseAppToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ fields }),
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(`Lark Base update error: ${data.msg || response.statusText}`);
  }
}

async function findOwnedRecord(input: {
  requestType: HistoryCommentRequestType;
  requestId: string;
  employeeId: string;
}) {
  const config = configFor(input.requestType);
  const records = await listRecords(config.tableId);

  const record = records.find((item: any) => {
    const f = item?.fields ?? {};
    if (text(f["Employee ID"]) !== input.employeeId) return false;
    return config.requestIdFields.some(
      (name) => text(f[name]) === input.requestId,
    );
  });

  if (!record?.record_id) {
    throw new Error("Request was not found under your Employee ID.");
  }

  return {
    config,
    recordId: String(record.record_id),
    fields: record.fields ?? {},
  };
}

function webhookFor(group: string) {
  const key = group
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");

  const value =
    process.env[`LARK_APPROVAL_WEBHOOK_${key}`] ||
    process.env[`LARK_LEAVE_WEBHOOK_${key}`];

  if (!value) throw new Error(`Missing approval webhook for group: ${group}`);
  return value;
}

function requestDetails(
  type: HistoryCommentRequestType,
  f: Record<string, unknown>,
) {
  if (type === "Leave Request") {
    const start = dateText(f["Start Date"]);
    const end = dateText(f["End Date"]);
    return [
      `Leave Type: ${text(f["Leave Type"]) || "—"}`,
      `Date: ${start}${start !== end ? ` to ${end}` : ""}`,
    ].join("\n");
  }

  if (type === "Change Day-Off") {
    return [
      `Current Off-Date: ${dateText(f["Current Off-Date"])}`,
      `Requested New Off-Date: ${dateText(f["Requested New Off-Date"])}`,
    ].join("\n");
  }

  if (type === "Overtime") {
    return [
      `Overtime Date: ${dateText(f["Overtime Date"])}`,
      `Time: ${timeText(f["Start Time"])} – ${timeText(f["End Time"])}`,
    ].join("\n");
  }

  return [
    `Undertime Date: ${dateText(f["Undertime Date"])}`,
    `Requested Early Time Out: ${timeText(f["Requested Early Time Out"])}`,
    `Regular Time Out: ${timeText(f["Regular Time Out"])}`,
  ].join("\n");
}

async function sendCommentNotification(input: {
  requestType: HistoryCommentRequestType;
  requestId: string;
  recordId: string;
  fields: Record<string, unknown>;
  comment: string;
  commenterName: string;
  attachmentName?: string;
  attachmentImageKey?: string;
}) {
  const group = text(input.fields["Approval Group"]);
  if (!group) throw new Error("Request is missing Approval Group.");

  const employeeName =
    text(input.fields["Employee Name"]) ||
    text(input.fields["Employee ID"]) ||
    "Employee";

  const status = text(input.fields["Status"]) || "Pending";
  const config = configFor(input.requestType);
  const baseUrl = process.env.APP_PUBLIC_URL;
  const reviewToken = makeReviewToken(config.tokenKey(input.recordId));

  const viewUrl = baseUrl
    ? `${baseUrl}${config.reviewPath(input.recordId)}?token=${encodeURIComponent(
        reviewToken,
      )}`
    : "";

  const elements: any[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**${employeeName} — ${config.label}**\n` +
          `Request ID: ${input.requestId}\n` +
          `Status: **${status}**\n` +
          `${requestDetails(input.requestType, input.fields)}`,
      },
    },
    { tag: "hr" },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**New Comment by ${input.commenterName}**\n` +
          `${input.comment || "(Attachment added)"}` +
          (input.attachmentName
            ? `\n\nAttachment: ${input.attachmentName}`
            : ""),
      },
    },
  ];

  if (input.attachmentImageKey) {
    elements.push({
      tag: "img",
      img_key: input.attachmentImageKey,
      alt: {
        tag: "plain_text",
        content: input.attachmentName || "Comment attachment",
      },
      mode: "fit_horizontal",
      compact_width: true,
      preview: true,
    });
  }

  if (viewUrl) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: { tag: "plain_text", content: "View Request" },
          type: "primary",
          multi_url: {
            url: viewUrl,
            android_url: viewUrl,
            ios_url: viewUrl,
            pc_url: viewUrl,
          },
        },
      ],
    });
  }

  const response = await fetch(webhookFor(group), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        config: { wide_screen_mode: true, enable_forward: true },
        header: {
          template: "blue",
          title: {
            tag: "plain_text",
            content: `New Comment — ${config.label}`,
          },
        },
        elements,
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (
    !response.ok ||
    (data && typeof data.code === "number" && data.code !== 0)
  ) {
    throw new Error(`Lark webhook error: ${data?.msg || response.statusText}`);
  }
}

export async function getHistoryComments(input: {
  requestType: HistoryCommentRequestType;
  requestId: string;
  employeeId: string;
}) {
  const found = await findOwnedRecord(input);
  return {
    comments: text(found.fields["Comments"]),
    status: text(found.fields["Status"]) || "Pending",
  };
}

export async function addHistoryComment(input: {
  requestType: HistoryCommentRequestType;
  requestId: string;
  employeeId: string;
  commenterName: string;
  comment: string;
  attachment?: File;
}) {
  const found = await findOwnedRecord(input);
  const previousComments = text(found.fields["Comments"]);
  const previousAttachments = extractApprovalAttachments(
    found.fields["Attachment"],
  );

  let attachmentToken = "";
  let attachmentImageKey = "";
  let attachmentName = "";

  if (input.attachment && input.attachment.size > 0) {
    if (input.attachment.size > 10 * 1024 * 1024) {
      throw new Error("Comment attachment must be 10 MB or smaller.");
    }

    attachmentName = input.attachment.name || "Comment attachment";
    attachmentToken = await uploadLeaveAttachment(input.attachment);

    if (input.attachment.type.toLowerCase().startsWith("image/")) {
      try {
        attachmentImageKey = await uploadApprovalCardImage(input.attachment);
      } catch (error) {
        console.error("Comment card image upload failed:", error);
      }
    }
  }

  const now = Date.now();
  const entryParts = [`${filedText(now)} — ${input.commenterName}`];

  if (input.comment) entryParts.push(input.comment);
  if (attachmentName) entryParts.push(`Attachment: ${attachmentName}`);

  const entry = entryParts.join("\n");
  const comments = previousComments
    ? `${previousComments}\n\n${entry}`
    : entry;

  const fields: Record<string, unknown> = { Comments: comments };

  if (attachmentToken) {
    const allTokens = [
      ...previousAttachments
        .map((item) => item.fileToken)
        .filter(Boolean),
      attachmentToken,
    ];

    fields.Attachment = allTokens.map((fileToken) => ({
      file_token: fileToken,
    }));
  }

  await updateRecord(found.config.tableId, found.recordId, fields);

  const warnings: string[] = [];

  try {
    await sendCommentNotification({
      requestType: input.requestType,
      requestId: input.requestId,
      recordId: found.recordId,
      fields: { ...found.fields, Comments: comments },
      comment: input.comment,
      commenterName: input.commenterName,
      attachmentName: attachmentName || undefined,
      attachmentImageKey: attachmentImageKey || undefined,
    });
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Unable to send comment notification.",
    );
  }

  return { comments, warnings };
}
