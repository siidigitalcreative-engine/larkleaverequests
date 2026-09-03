import { getTenantAccessToken } from "@/lib/lark";

export type OvertimeInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  publicHoliday: "Yes" | "No";
  compensationMethod:
    | "Apply for days off"
    | "Apply for overtimes payment";
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

function baseAppToken() {
  const appToken = process.env.LARK_BASE_APP_TOKEN;
  if (!appToken) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return appToken;
}

function overtimeTableId() {
  const tableId = process.env.LARK_OVERTIME_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_OVERTIME_TABLE_ID");
  return tableId;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTableName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDateMs(date: string) {
  return new Date(`${date}T00:00:00+08:00`).getTime();
}

export function overtimeDateTimes(
  overtimeDate: string,
  startTime: string,
  endTime: string,
) {
  const start = new Date(
    `${overtimeDate}T${startTime.length === 5 ? `${startTime}:00` : startTime}+08:00`,
  );

  let end = new Date(
    `${overtimeDate}T${endTime.length === 5 ? `${endTime}:00` : endTime}+08:00`,
  );

  // Overtime may cross midnight.
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    durationHours:
      Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) /
      100,
  };
}

async function listRecords(tableId: string, appToken = baseAppToken()) {
  const token = await getTenantAccessToken();
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

async function listFields(tableId: string, appToken = baseAppToken()) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
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

async function listBaseTables(appToken: string) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables`,
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
  const defaultAppToken = baseAppToken();
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
        const tableId = text(value.tableId);

        if (tableId) {
          return {
            appToken: text(value.appToken) || defaultAppToken,
            tableId,
          };
        }
      }
    }
  }

  const tables = await listBaseTables(defaultAppToken);
  const wantedNames = new Set([
    normalizeTableName(`${group} Approvals`),
    normalizeTableName(`${group} Approval`),
  ]);

  const matches = tables.filter((table: any) =>
    wantedNames.has(
      normalizeTableName(
        String(table?.name ?? table?.table_name ?? ""),
      ),
    ),
  );

  if (matches.length === 1) {
    return {
      appToken: defaultAppToken,
      tableId: text(
        matches[0]?.table_id ?? matches[0]?.tableId,
      ),
    };
  }

  if (matches.length > 1) {
    throw new Error(
      `More than one approval table matches "${group}". Add an explicit mapping in LARK_APPROVAL_TABLES.`,
    );
  }

  return null;
}

function writableFields(
  tableFields: any[],
  candidates: Record<string, unknown>,
) {
  const byName = new Map(
    tableFields.map((field: any) => [
      text(field?.field_name),
      field,
    ]),
  );

  const skippedFields: string[] = [];

  const fields = Object.fromEntries(
    Object.entries(candidates).filter(([name, value]) => {
      const field = byName.get(name);

      if (!field) {
        skippedFields.push(`${name}: field does not exist`);
        return false;
      }

      if (value === undefined || value === null || value === "") {
        skippedFields.push(`${name}: empty value`);
        return false;
      }

      const fieldType = Number(field?.type);

      // Single select / multi-select options must already exist.
      if (fieldType === 3 || fieldType === 4) {
        const optionNames = new Set(
          (field?.property?.options ?? []).map((option: any) =>
            text(option?.name),
          ),
        );

        if (fieldType === 3) {
          const wanted = text(value);
          if (!optionNames.has(wanted)) {
            skippedFields.push(
              `${name}: option "${wanted}" does not exist`,
            );
            return false;
          }
        }

        if (fieldType === 4 && Array.isArray(value)) {
          if (
            value.some((item) => !optionNames.has(text(item)))
          ) {
            skippedFields.push(
              `${name}: one or more options do not exist`,
            );
            return false;
          }
        }
      }

      // Formula / lookup / computed fields should not be written.
      if (
        [19, 20, 1001, 1002, 1003, 1004, 1005].includes(
          fieldType,
        )
      ) {
        skippedFields.push(`${name}: read-only/computed field`);
        return false;
      }

      return true;
    }),
  );

  return { fields, skippedFields };
}

async function createRecord(
  tableId: string,
  fields: Record<string, unknown>,
  appToken = baseAppToken(),
) {
  const token = await getTenantAccessToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: "POST",
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
      `Lark Base create error: ${data.msg || response.statusText}`,
    );
  }

  return String(data.data?.record?.record_id ?? "");
}

async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
  appToken = baseAppToken(),
) {
  const token = await getTenantAccessToken();

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
    throw new Error(
      `Lark Base update error: ${data.msg || response.statusText}`,
    );
  }
}

export async function createOvertimeRequest(input: OvertimeInput) {
  const tableId = overtimeTableId();
  const fieldsInfo = await listFields(tableId);
  const requestId = `${input.employeeId}-OT-${input.submittedAt}`;
  const times = overtimeDateTimes(
    input.overtimeDate,
    input.startTime,
    input.endTime,
  );

  const { fields } = writableFields(fieldsInfo, {
    "Overtime Request ID": requestId,
    "Request ID": requestId,
    "Employee ID": input.employeeId,
    "Employee Name": input.employeeName,
    Department: input.department || "",
    "Approval Group": input.approvalGroup,
    "Overtime Date": toDateMs(input.overtimeDate),
    "Start Time": times.startMs,
    "End Time": times.endMs,
    // If Duration (Hours) is a Formula field, this is automatically skipped.
    // If it is a Number field, the calculated value is written.
    "Duration (Hours)": times.durationHours,
    "Public Holiday?": input.publicHoliday,
    "Compensation Method": input.compensationMethod,
    Reason: input.reason,
    Status: "Pending",
    "Submitted At": input.submittedAt,
    Attachment: input.attachmentToken
      ? [{ file_token: input.attachmentToken }]
      : undefined,
  });

  const recordId = await createRecord(tableId, fields);

  return {
    recordId,
    requestId,
    durationHours: times.durationHours,
    startMs: times.startMs,
    endMs: times.endMs,
  };
}

export async function createOvertimeApprovalGroupRecord(
  input: OvertimeInput & {
    mainRecordId: string;
    requestId: string;
  },
) {
  const destination = await approvalDestinationFor(
    input.approvalGroup,
  );

  if (!destination) {
    return {
      created: false as const,
      reason: `No approval table found for group: ${input.approvalGroup}.`,
    };
  }

  const fieldsInfo = await listFields(
    destination.tableId,
    destination.appToken,
  );
  const times = overtimeDateTimes(
    input.overtimeDate,
    input.startTime,
    input.endTime,
  );

  const { fields, skippedFields } = writableFields(
    fieldsInfo,
    {
      "Approval Type": "Overtime",
      "Request ID": input.requestId,
      "Request Title": `${input.employeeName} — Overtime`,
      "Request Details": input.reason,
      "Employee ID": input.employeeId,
      "Employee Name": input.employeeName,
      Department: input.department || "",
      "Approval Group": input.approvalGroup,
      "Overtime Date": toDateMs(input.overtimeDate),
      "Start Time": times.startMs,
      "End Time": times.endMs,
      "Duration (Hours)": times.durationHours,
      "Public Holiday?": input.publicHoliday,
      "Compensation Method": input.compensationMethod,
      Reason: input.reason,
      Decision: "Pending",
      Status: "Pending",
      "Submitted At": input.submittedAt,
      Attachment: input.attachmentToken
        ? [{ file_token: input.attachmentToken }]
        : undefined,
      "Main Record ID": input.mainRecordId,
      "Sync Status": "Pending",
    },
  );

  if (!fields["Request ID"]) {
    throw new Error(
      `Approval table "${input.approvalGroup}" needs a writable "Request ID" field.`,
    );
  }

  const recordId = await createRecord(
    destination.tableId,
    fields,
    destination.appToken,
  );

  return {
    created: true as const,
    tableId: destination.tableId,
    recordId,
    skippedFields,
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

  if (!value) {
    throw new Error(
      `Missing approval webhook for approval group: ${group}`,
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

async function postWebhook(
  webhook: string,
  card: Record<string, unknown>,
) {
  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      msg_type: "interactive",
      card,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || (data && data.code && data.code !== 0)) {
    throw new Error(
      `Lark webhook error: ${data?.msg || response.statusText}`,
    );
  }
}

function dateText(value: string | number) {
  const timestamp =
    typeof value === "number" ? value : toDateMs(value);

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
}

function timeText(timestamp: number) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

export async function sendOvertimeApprovalCard(
  input: OvertimeInput & {
    recordId: string;
    requestId: string;
    reviewToken: string;
  },
) {
  const baseUrl = process.env.APP_PUBLIC_URL;
  if (!baseUrl) throw new Error("Missing APP_PUBLIC_URL");

  const approveUrl =
    `${baseUrl}/review/overtime/${encodeURIComponent(input.recordId)}` +
    `?token=${encodeURIComponent(input.reviewToken)}&decision=approve`;

  const rejectUrl =
    `${baseUrl}/review/overtime/${encodeURIComponent(input.recordId)}` +
    `?token=${encodeURIComponent(input.reviewToken)}&decision=reject`;

  const times = overtimeDateTimes(
    input.overtimeDate,
    input.startTime,
    input.endTime,
  );

  const card = {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      template: "blue",
      title: {
        tag: "plain_text",
        content: `${input.employeeName} — Overtime Request`,
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content:
            `**${input.employeeName}'s Overtime**\n` +
            `Employee ID: ${input.employeeId}\n` +
            `Department: ${input.department || "—"}\n` +
            `Approval Group: ${input.approvalGroup}\n` +
            `**Date Filed: ${new Intl.DateTimeFormat("en-PH", {
              timeZone: "Asia/Manila",
              month: "short",
              day: "2-digit",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }).format(new Date(input.submittedAt))}**`,
        },
      },
      {
        tag: "div",
        fields: [
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**Overtime Date**\n${dateText(input.overtimeDate)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content:
                `**Time**\n${timeText(times.startMs)} – ` +
                `${timeText(times.endMs)}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**Duration**\n${times.durationHours} hour(s)`,
            },
          },
          {
            is_short: true,
            text: {
              tag: "lark_md",
              content: `**Public Holiday?**\n${input.publicHoliday}`,
            },
          },
          {
            is_short: false,
            text: {
              tag: "lark_md",
              content:
                `**Compensation Method**\n` +
                `${input.compensationMethod}`,
            },
          },
        ],
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Reason**\n${input.reason}`,
        },
      },
      ...(input.attachmentImageKey
        ? [
            {
              tag: "div",
              text: {
                tag: "lark_md",
                content: `**Attachment${input.attachmentName ? ` — ${input.attachmentName}` : ""}**`,
              },
            },
            {
              tag: "img",
              img_key: input.attachmentImageKey,
              alt: {
                tag: "plain_text",
                content:
                  input.attachmentName ||
                  "Overtime attachment",
              },
              mode: "fit_horizontal",
              preview: true,
            },
          ]
        : []),
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: "Approve",
            },
            type: "primary",
            multi_url: multiUrl(approveUrl),
          },
          {
            tag: "button",
            text: {
              tag: "plain_text",
              content: "Reject",
            },
            type: "danger",
            multi_url: multiUrl(rejectUrl),
          },
        ],
      },
    ],
  };

  await postWebhook(webhookFor(input.approvalGroup), card);
}

export async function getOvertimeRecord(recordId: string) {
  const token = await getTenantAccessToken();
  const tableId = overtimeTableId();
  const appToken = baseAppToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `Unable to load Overtime record: ${data.msg || response.statusText}`,
    );
  }

  return data.data?.record;
}

export async function updateOvertimeDecision(input: {
  recordId: string;
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const tableId = overtimeTableId();
  const fieldsInfo = await listFields(tableId);

  const { fields } = writableFields(fieldsInfo, {
    Status: input.decision,
    "Approved At":
      input.decision === "Approved" ? Date.now() : undefined,
    "Rejection Reason":
      input.decision === "Rejected"
        ? input.rejectionReason
        : undefined,
    "Approval Comment":
      input.decision === "Approved"
        ? input.approvalComment
        : undefined,
  });

  await updateRecord(tableId, input.recordId, fields);
}

export async function updateOvertimeApprovalGroupDecision(input: {
  approvalGroup: string;
  mainRecordId: string;
  requestId: string;
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const destination = await approvalDestinationFor(
    input.approvalGroup,
  );

  if (!destination) {
    throw new Error(
      `No approval table found for group: ${input.approvalGroup}`,
    );
  }

  const records = await listRecords(
    destination.tableId,
    destination.appToken,
  );

  const match = records.find((record: any) => {
    const fields = record?.fields ?? {};

    return (
      text(fields["Main Record ID"]) === input.mainRecordId ||
      text(fields["Request ID"]) === input.requestId
    );
  });

  if (!match?.record_id) {
    throw new Error(
      `Overtime approval record was not found in ${input.approvalGroup} Approvals.`,
    );
  }

  const fieldsInfo = await listFields(
    destination.tableId,
    destination.appToken,
  );

  const { fields } = writableFields(fieldsInfo, {
    Decision: input.decision,
    Status: input.decision,
    "Rejection Reason":
      input.decision === "Rejected"
        ? input.rejectionReason
        : undefined,
    "Approval Comment":
      input.decision === "Approved"
        ? input.approvalComment
        : undefined,
    "Sync Status": "Synced",
  });

  await updateRecord(
    destination.tableId,
    String(match.record_id),
    fields,
    destination.appToken,
  );
}

export async function sendOvertimeDecisionCard(input: {
  approvalGroup: string;
  employeeName: string;
  requestId: string;
  overtimeDate: number;
  startTime: number;
  endTime: number;
  durationHours: number;
  compensationMethod: string;
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const approved = input.decision === "Approved";

  const detail =
    approved && input.approvalComment
      ? `\n**Approval Comment**\n${input.approvalComment}`
      : !approved && input.rejectionReason
        ? `\n**Rejection Reason**\n${input.rejectionReason}`
        : "";

  const card = {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      template: approved ? "green" : "red",
      title: {
        tag: "plain_text",
        content: `Overtime Request ${input.decision}`,
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content:
            `**${input.employeeName}**\n` +
            `Request ID: ${input.requestId}\n` +
            `Overtime Date: ${dateText(input.overtimeDate)}\n` +
            `Time: ${timeText(input.startTime)} – ${timeText(input.endTime)}\n` +
            `Duration: ${input.durationHours} hour(s)\n` +
            `Compensation: ${input.compensationMethod}` +
            detail,
        },
      },
    ],
  };

  await postWebhook(webhookFor(input.approvalGroup), card);
}

export type OvertimeHistoryItem = {
  requestId: string;
  requestType: "Overtime";
  title: string;
  detail: string;
  status: string;
  submittedAt: number;
  overtimeDate?: number;
  rejectionReason?: string;
};

export async function listEmployeeOvertimeHistory(
  employeeId: string,
): Promise<OvertimeHistoryItem[]> {
  const normalized = text(employeeId);
  if (!normalized) return [];

  try {
    const records = await listRecords(overtimeTableId());
    const results: OvertimeHistoryItem[] = [];

    for (const record of records) {
      const f = record?.fields ?? {};

      if (text(f["Employee ID"]) !== normalized) continue;

      const start = Number(f["Start Time"] ?? 0) || 0;
      const end = Number(f["End Time"] ?? 0) || 0;
      const duration =
        start > 0 && end > start
          ? Math.round(((end - start) / 3_600_000) * 100) / 100
          : Number(f["Duration (Hours)"] ?? 0) || 0;

      const compensation = text(f["Compensation Method"]);

      results.push({
        requestId:
          text(f["Overtime Request ID"]) ||
          text(f["Request ID"]),
        requestType: "Overtime",
        title: "Overtime",
        detail:
          `${duration || "—"} hour(s)` +
          (compensation ? ` • ${compensation}` : ""),
        status: text(f["Status"]) || "Pending",
        submittedAt: Number(f["Submitted At"] ?? 0) || 0,
        overtimeDate:
          Number(f["Overtime Date"] ?? 0) || undefined,
        rejectionReason:
          text(f["Rejection Reason"]) || undefined,
      });
    }

    return results.sort(
      (a, b) => b.submittedAt - a.submittedAt,
    );
  } catch (error) {
    console.error("Overtime history load failed:", error);
    return [];
  }
}
