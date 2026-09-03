import { getTenantAccessToken } from "@/lib/lark";

type ChangeOffEnhancedInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  currentOffDate: string;
  requestedNewOffDate: string;
  reason: string;
  submittedAt: number;
  attachmentToken?: string;
  attachmentImageKey?: string;
  attachmentName?: string;
};

type ApprovalDestination = {
  appToken: string;
  tableId: string;
};

type ApprovalDestinationConfig =
  | string
  | {
      tableId?: string;
      appToken?: string;
    };

function appToken() {
  const value = process.env.LARK_BASE_APP_TOKEN;
  if (!value) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return value;
}

function changeOffTableId() {
  const value = process.env.LARK_CHANGE_OFF_TABLE_ID;
  if (!value) throw new Error("Missing LARK_CHANGE_OFF_TABLE_ID");
  return value;
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function listBaseTables(baseAppToken: string) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken}/tables`,
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(
        `Lark Base table-list error: ${data.msg || response.statusText}`,
      );
    }

    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more
      ? String(data.data?.page_token ?? "")
      : "";
  } while (pageToken);

  return items;
}

async function approvalDestinationFor(
  group: string,
): Promise<ApprovalDestination | null> {
  const defaultAppToken = appToken();
  const raw =
    process.env.LARK_APPROVAL_TABLES ||
    process.env.LARK_LEAVE_APPROVAL_TABLES;

  if (raw?.trim()) {
    let config: Record<string, ApprovalDestinationConfig>;

    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error(
        "LARK_APPROVAL_TABLES (or legacy LARK_LEAVE_APPROVAL_TABLES) must be valid JSON.",
      );
    }

    const wanted = group.trim().toLowerCase();
    const matchedKey = Object.keys(config).find(
      (key) => key.trim().toLowerCase() === wanted,
    );

    if (matchedKey) {
      const value = config[matchedKey];

      if (typeof value === "string" && value.trim()) {
        return {
          appToken: defaultAppToken,
          tableId: value.trim(),
        };
      }

      if (typeof value === "object" && value) {
        const tableId = String(value.tableId ?? "").trim();

        if (tableId) {
          return {
            appToken:
              String(value.appToken ?? "").trim() ||
              defaultAppToken,
            tableId,
          };
        }
      }
    }
  }

  const tables = await listBaseTables(defaultAppToken);

  const acceptedNames = new Set([
    normalize(`${group} Approvals`),
    normalize(`${group} Approval`),
    normalize(`${group} Leave Approvals`),
    normalize(`${group} Leave Approval`),
  ]);

  const matches = tables.filter((table: any) =>
    acceptedNames.has(
      normalize(
        String(table?.name ?? table?.table_name ?? ""),
      ),
    ),
  );

  if (matches.length === 1) {
    return {
      appToken: defaultAppToken,
      tableId: String(
        matches[0]?.table_id ?? matches[0]?.tableId ?? "",
      ).trim(),
    };
  }

  if (matches.length > 1) {
    throw new Error(
      `More than one approval table matches "${group}". Add an explicit mapping in LARK_APPROVAL_TABLES.`,
    );
  }

  return null;
}

async function listFields(
  baseAppToken: string,
  tableId: string,
) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken}/tables/${tableId}/fields`,
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(
        `Lark Base fields error: ${data.msg || response.statusText}`,
      );
    }

    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more
      ? String(data.data?.page_token ?? "")
      : "";
  } while (pageToken);

  return items;
}

async function updateRecord(
  baseAppToken: string,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  const token = await getTenantAccessToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken}/tables/${tableId}/records/${recordId}`,
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
    throw new Error(
      `Lark Base update error: ${data.msg || response.statusText}`,
    );
  }
}

async function listRecords(
  baseAppToken: string,
  tableId: string,
) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      throw new Error(
        `Lark Base read error: ${data.msg || response.statusText}`,
      );
    }

    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more
      ? String(data.data?.page_token ?? "")
      : "";
  } while (pageToken);

  return items;
}

export async function attachToChangeOffMaster(
  recordId: string,
  attachmentToken?: string,
) {
  if (!attachmentToken) return { updated: false as const };

  const baseAppToken = appToken();
  const tableId = changeOffTableId();
  const fields = await listFields(baseAppToken, tableId);

  const hasAttachment = fields.some(
    (field: any) =>
      String(field?.field_name ?? "").trim() === "Attachment",
  );

  if (!hasAttachment) {
    return {
      updated: false as const,
      warning:
        'Change Day-Off Records is missing an "Attachment" field.',
    };
  }

  await updateRecord(baseAppToken, tableId, recordId, {
    Attachment: [{ file_token: attachmentToken }],
  });

  return { updated: true as const };
}

export async function attachToChangeOffApprovalCopy(input: {
  approvalGroup: string;
  mainRecordId: string;
  requestId: string;
  attachmentToken?: string;
}) {
  if (!input.attachmentToken) {
    return { updated: false as const };
  }

  const destination = await approvalDestinationFor(
    input.approvalGroup,
  );

  if (!destination) {
    return {
      updated: false as const,
      warning: `No approval table found for ${input.approvalGroup}.`,
    };
  }

  const fields = await listFields(
    destination.appToken,
    destination.tableId,
  );

  const hasAttachment = fields.some(
    (field: any) =>
      String(field?.field_name ?? "").trim() === "Attachment",
  );

  if (!hasAttachment) {
    return {
      updated: false as const,
      warning: `${input.approvalGroup} Approvals is missing an "Attachment" field.`,
    };
  }

  const records = await listRecords(
    destination.appToken,
    destination.tableId,
  );

  const record = records.find(
    (item: any) =>
      String(
        item?.fields?.["Main Record ID"] ?? "",
      ).trim() === input.mainRecordId,
  ) ??
    records.find(
      (item: any) =>
        String(item?.fields?.["Request ID"] ?? "").trim() ===
        input.requestId,
    );

  if (!record?.record_id) {
    return {
      updated: false as const,
      warning:
        "Approval copy was created, but its record could not be found for attachment sync.",
    };
  }

  await updateRecord(
    destination.appToken,
    destination.tableId,
    String(record.record_id),
    {
      Attachment: [
        { file_token: input.attachmentToken },
      ],
    },
  );

  return { updated: true as const };
}

function webhookFor(group: string) {
  const key = group
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");

  const value =
    process.env[`LARK_APPROVAL_WEBHOOK_${key}`] ||
    process.env[`LARK_LEAVE_WEBHOOK_${key}`];

  if (!value) {
    throw new Error(
      `Missing approval webhook for group: ${group}.`,
    );
  }

  return value;
}

function multiUrl(url: string) {
  return {
    url,
    android_url: url,
    ios_url: url,
    pc_url: url,
  };
}

function dateText(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(
    new Date(`${value}T00:00:00+08:00`),
  );
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

export async function sendChangeOffApprovalCardEnhanced(
  input: ChangeOffEnhancedInput & {
    recordId: string;
    requestId: string;
    reviewToken: string;
  },
) {
  const baseUrl = process.env.APP_PUBLIC_URL;
  if (!baseUrl) throw new Error("Missing APP_PUBLIC_URL");

  const approveUrl =
    `${baseUrl}/review/change-day-off/${encodeURIComponent(
      input.recordId,
    )}` +
    `?token=${encodeURIComponent(input.reviewToken)}` +
    `&decision=approve`;

  const rejectUrl =
    `${baseUrl}/review/change-day-off/${encodeURIComponent(
      input.recordId,
    )}` +
    `?token=${encodeURIComponent(input.reviewToken)}` +
    `&decision=reject`;

  const elements: any[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**${input.employeeName}'s Change Day-Off Request**\n` +
          `Employee ID: ${input.employeeId}\n` +
          `Department: ${input.department || "—"}\n` +
          `Approval Group: ${input.approvalGroup}\n` +
          `**Date Filed: ${filedText(input.submittedAt)}**`,
      },
    },
    {
      tag: "div",
      fields: [
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content:
              `**Current Off-Date**\n` +
              `${dateText(input.currentOffDate)}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content:
              `**Requested New Off-Date**\n` +
              `${dateText(input.requestedNewOffDate)}`,
          },
        },
      ],
    },
    {
      tag: "hr",
    },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**Reason for Change**\n${input.reason}`,
      },
    },
  ];

  if (input.attachmentImageKey) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**Attachment${
          input.attachmentName
            ? ` — ${input.attachmentName}`
            : ""
        }**`,
      },
    });

    elements.push({
      tag: "img",
      img_key: input.attachmentImageKey,
      alt: {
        tag: "plain_text",
        content:
          input.attachmentName ||
          "Change Day-Off attachment",
      },
      mode: "fit_horizontal",
      preview: true,
    });
  }

  elements.push({
    tag: "action",
    actions: [
      {
        tag: "button",
        type: "primary",
        text: {
          tag: "plain_text",
          content: "Approve",
        },
        multi_url: multiUrl(approveUrl),
      },
      {
        tag: "button",
        type: "danger",
        text: {
          tag: "plain_text",
          content: "Reject",
        },
        multi_url: multiUrl(rejectUrl),
      },
    ],
  });

  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `Request ${input.requestId} • Pending approval`,
      },
    ],
  });

  const response = await fetch(
    webhookFor(input.approvalGroup),
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        msg_type: "interactive",
        card: {
          config: {
            wide_screen_mode: true,
            enable_forward: true,
          },
          header: {
            template: "blue",
            title: {
              tag: "plain_text",
              content: `${input.employeeName} — Change Day-Off Request`,
            },
          },
          elements,
        },
      }),
      cache: "no-store",
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Approval group webhook error: ${response.status} ${responseText}`,
    );
  }
}
