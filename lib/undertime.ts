import { getTenantAccessToken } from "@/lib/lark";

export type UndertimeInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  undertimeDate: string;
  requestedEarlyTimeOut: string;
  regularTimeOut: string;
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

function undertimeTableId() {
  const tableId = process.env.LARK_UNDERTIME_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_UNDERTIME_TABLE_ID");
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

export function undertimeDateTimes(
  undertimeDate: string,
  requestedEarlyTimeOut: string,
  regularTimeOut: string,
) {
  const requested = new Date(
    `${undertimeDate}T${
      requestedEarlyTimeOut.length === 5
        ? `${requestedEarlyTimeOut}:00`
        : requestedEarlyTimeOut
    }+08:00`,
  );

  const scheduled = new Date(
    `${undertimeDate}T${
      regularTimeOut.length === 5
        ? `${regularTimeOut}:00`
        : regularTimeOut
    }+08:00`,
  );

  if (
    !Number.isFinite(requested.getTime()) ||
    !Number.isFinite(scheduled.getTime())
  ) {
    throw new Error("Invalid Undertime date or time.");
  }

  if (requested.getTime() >= scheduled.getTime()) {
    throw new Error(
      "Requested Early Time Out must be earlier than Regular Time Out.",
    );
  }

  return {
    requestedMs: requested.getTime(),
    scheduledMs: scheduled.getTime(),
    durationHours:
      Math.round(
        ((scheduled.getTime() - requested.getTime()) / 3_600_000) *
          100,
      ) / 100,
  };
}

async function listRecords(
  tableId: string,
  appToken = baseAppToken(),
) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

async function listFields(
  tableId: string,
  appToken = baseAppToken(),
) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        skippedFields.push(`${name}: empty value`);
        return false;
      }

      const fieldType = Number(field?.type);

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
      }

      if (
        [19, 20, 1001, 1002, 1003, 1004, 1005].includes(
          fieldType,
        )
      ) {
        skippedFields.push(
          `${name}: read-only/computed field`,
        );
        return false;
      }

      return true;
    }),
  );

  return {
    fields,
    skippedFields,
  };
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
        "Content-Type":
          "application/json; charset=utf-8",
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

  return String(
    data.data?.record?.record_id ?? "",
  );
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
        "Content-Type":
          "application/json; charset=utf-8",
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

export async function createUndertimeRequest(
  input: UndertimeInput,
) {
  const tableId = undertimeTableId();
  const fieldsInfo = await listFields(tableId);

  const requestId =
    `${input.employeeId}-UT-${input.submittedAt}`;

  const times = undertimeDateTimes(
    input.undertimeDate,
    input.requestedEarlyTimeOut,
    input.regularTimeOut,
  );

  if (input.attachmentToken) {
    const hasAttachmentField =
      fieldsInfo.some(
        (field: any) =>
          text(field?.field_name) ===
          "Attachment",
      );

    if (!hasAttachmentField) {
      throw new Error(
        'Undertime Records is missing the "Attachment" field. Add an Attachment-type field named exactly "Attachment".',
      );
    }
  }

  const { fields } = writableFields(
    fieldsInfo,
    {
      "Undertime Request ID": requestId,
      "Request ID": requestId,
      "Employee ID": input.employeeId,
      "Employee Name": input.employeeName,
      Department: input.department || "",
      "Approval Group": input.approvalGroup,
      "Undertime Date": toDateMs(
        input.undertimeDate,
      ),
      "Requested Early Time Out":
        times.requestedMs,
      "Regular Time Out":
        times.scheduledMs,
      "Duration (Hours)":
        times.durationHours,
      Reason: input.reason,
      Status: "Pending",
      "Submitted At": input.submittedAt,
    },
  );

  const recordId = await createRecord(
    tableId,
    fields,
  );

  if (input.attachmentToken) {
    await updateRecord(
      tableId,
      recordId,
      {
        Attachment: [
          {
            file_token:
              input.attachmentToken,
          },
        ],
      },
    );
  }

  return {
    recordId,
    requestId,
    durationHours:
      times.durationHours,
    requestedMs:
      times.requestedMs,
    scheduledMs:
      times.scheduledMs,
  };
}

export async function createUndertimeApprovalGroupRecord(
  input: UndertimeInput & {
    mainRecordId: string;
    requestId: string;
  },
) {
  const destination =
    await approvalDestinationFor(
      input.approvalGroup,
    );

  if (!destination) {
    return {
      created: false as const,
      reason:
        `No approval table found for group: ${input.approvalGroup}.`,
    };
  }

  const fieldsInfo =
    await listFields(
      destination.tableId,
      destination.appToken,
    );

  const times =
    undertimeDateTimes(
      input.undertimeDate,
      input.requestedEarlyTimeOut,
      input.regularTimeOut,
    );

  const hasAttachmentField =
    fieldsInfo.some(
      (field: any) =>
        text(field?.field_name) ===
        "Attachment",
    );

  const {
    fields,
    skippedFields,
  } = writableFields(
    fieldsInfo,
    {
      "Approval Type": "Undertime",
      "Request ID": input.requestId,
      "Request Title":
        `${input.employeeName} — Undertime`,
      "Request Details": input.reason,
      "Employee ID": input.employeeId,
      "Employee Name": input.employeeName,
      Department: input.department || "",
      "Approval Group":
        input.approvalGroup,

      // Reuse the existing Overtime department-table date field
      // so no new department columns are required.
      "Overtime Date": toDateMs(
        input.undertimeDate,
      ),

      // Reuse the existing generic time columns.
      "Start Time": times.requestedMs,
      "End Time": times.scheduledMs,
      "Duration (Hours)":
        times.durationHours,

      Reason: input.reason,
      Decision: "Pending",
      Status: "Pending",
      "Submitted At":
        input.submittedAt,
      "Main Record ID":
        input.mainRecordId,
      "Sync Status": "Pending",
    },
  );

  if (!fields["Request ID"]) {
    throw new Error(
      `Approval table "${input.approvalGroup}" needs a writable "Request ID" field.`,
    );
  }

  const recordId =
    await createRecord(
      destination.tableId,
      fields,
      destination.appToken,
    );

  if (input.attachmentToken) {
    if (!hasAttachmentField) {
      skippedFields.push(
        'Attachment: field does not exist in destination approval table',
      );
    } else {
      await updateRecord(
        destination.tableId,
        recordId,
        {
          Attachment: [
            {
              file_token:
                input.attachmentToken,
            },
          ],
        },
        destination.appToken,
      );
    }
  }

  return {
    created: true as const,
    tableId:
      destination.tableId,
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
      "Content-Type":
        "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      msg_type: "interactive",
      card,
    }),
    cache: "no-store",
  });

  const data =
    await response.json().catch(() => null);

  if (
    !response.ok ||
    (data && data.code && data.code !== 0)
  ) {
    throw new Error(
      `Lark webhook error: ${
        data?.msg || response.statusText
      }`,
    );
  }
}

function dateText(
  value: string | number,
) {
  const timestamp =
    typeof value === "number"
      ? value
      : toDateMs(value);

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      month: "short",
      day: "2-digit",
      year: "numeric",
    },
  ).format(new Date(timestamp));
}

function timeText(timestamp: number) {
  return new Intl.DateTimeFormat(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    },
  ).format(new Date(timestamp));
}

function filedText(timestamp: number) {
  return new Intl.DateTimeFormat(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    },
  ).format(new Date(timestamp));
}

export async function sendUndertimeApprovalCard(
  input: UndertimeInput & {
    recordId: string;
    requestId: string;
    reviewToken: string;
  },
) {
  const baseUrl =
    process.env.APP_PUBLIC_URL;

  if (!baseUrl) {
    throw new Error(
      "Missing APP_PUBLIC_URL",
    );
  }

  const approveUrl =
    `${baseUrl}/review/undertime/${encodeURIComponent(
      input.recordId,
    )}` +
    `?token=${encodeURIComponent(
      input.reviewToken,
    )}&decision=approve`;

  const rejectUrl =
    `${baseUrl}/review/undertime/${encodeURIComponent(
      input.recordId,
    )}` +
    `?token=${encodeURIComponent(
      input.reviewToken,
    )}&decision=reject`;

  const times =
    undertimeDateTimes(
      input.undertimeDate,
      input.requestedEarlyTimeOut,
      input.regularTimeOut,
    );

  const elements: any[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**${input.employeeName}'s Undertime**\n` +
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
              `**Undertime Date**\n${dateText(
                input.undertimeDate,
              )}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content:
              `**Requested Early Time Out**\n${timeText(
                times.requestedMs,
              )}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content:
              `**Regular Time Out**\n${timeText(
                times.scheduledMs,
              )}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content:
              `**Duration**\n${times.durationHours} hour(s)`,
          },
        },
      ],
    },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**Reason**\n${input.reason}`,
      },
    },
  ];

  if (input.attachmentImageKey) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**Attachment${
            input.attachmentName
              ? ` — ${input.attachmentName}`
              : ""
          }**`,
      },
    });

    elements.push({
      tag: "img",
      img_key:
        input.attachmentImageKey,
      alt: {
        tag: "plain_text",
        content:
          input.attachmentName ||
          "Undertime attachment",
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
        text: {
          tag: "plain_text",
          content: "Approve",
        },
        type: "primary",
        multi_url:
          multiUrl(approveUrl),
      },
      {
        tag: "button",
        text: {
          tag: "plain_text",
          content: "Reject",
        },
        type: "danger",
        multi_url:
          multiUrl(rejectUrl),
      },
    ],
  });

  await postWebhook(
    webhookFor(input.approvalGroup),
    {
      config: {
        wide_screen_mode: true,
        enable_forward: true,
      },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content:
            `${input.employeeName} — Undertime Request`,
        },
      },
      elements,
    },
  );
}

export async function getUndertimeRecord(
  recordId: string,
) {
  const token =
    await getTenantAccessToken();
  const tableId =
    undertimeTableId();
  const appToken =
    baseAppToken();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      headers: {
        Authorization:
          `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.code !== 0
  ) {
    throw new Error(
      `Unable to load Undertime record: ${
        data.msg ||
        response.statusText
      }`,
    );
  }

  return data.data?.record;
}

export async function updateUndertimeDecision(
  input: {
    recordId: string;
    decision:
      | "Approved"
      | "Rejected";
    rejectionReason: string;
    approvalComment: string;
  },
) {
  const tableId =
    undertimeTableId();
  const fieldsInfo =
    await listFields(tableId);

  const { fields } =
    writableFields(
      fieldsInfo,
      {
        Status: input.decision,
        "Approved At":
          input.decision ===
          "Approved"
            ? Date.now()
            : undefined,
        "Rejection Reason":
          input.decision ===
          "Rejected"
            ? input.rejectionReason
            : undefined,
        "Approval Comment":
          input.decision ===
          "Approved"
            ? input.approvalComment
            : undefined,
      },
    );

  await updateRecord(
    tableId,
    input.recordId,
    fields,
  );
}

export async function updateUndertimeApprovalGroupDecision(
  input: {
    approvalGroup: string;
    mainRecordId: string;
    requestId: string;
    decision:
      | "Approved"
      | "Rejected";
    rejectionReason: string;
    approvalComment: string;
  },
) {
  const destination =
    await approvalDestinationFor(
      input.approvalGroup,
    );

  if (!destination) {
    throw new Error(
      `No approval table found for group: ${input.approvalGroup}`,
    );
  }

  const records =
    await listRecords(
      destination.tableId,
      destination.appToken,
    );

  const match =
    records.find(
      (record: any) => {
        const fields =
          record?.fields ?? {};

        return (
          text(
            fields[
              "Main Record ID"
            ],
          ) ===
            input.mainRecordId ||
          text(
            fields[
              "Request ID"
            ],
          ) === input.requestId
        );
      },
    );

  if (!match?.record_id) {
    throw new Error(
      `Undertime approval record was not found in ${input.approvalGroup} Approvals.`,
    );
  }

  const fieldsInfo =
    await listFields(
      destination.tableId,
      destination.appToken,
    );

  const { fields } =
    writableFields(
      fieldsInfo,
      {
        Decision:
          input.decision,
        Status:
          input.decision,
        "Rejection Reason":
          input.decision ===
          "Rejected"
            ? input.rejectionReason
            : undefined,
        "Approval Comment":
          input.decision ===
          "Approved"
            ? input.approvalComment
            : undefined,
        "Sync Status":
          "Synced",
      },
    );

  await updateRecord(
    destination.tableId,
    String(match.record_id),
    fields,
    destination.appToken,
  );
}

export type UndertimeHistoryItem = {
  requestId: string;
  requestType: "Undertime";
  title: string;
  detail: string;
  status: string;
  submittedAt: number;
  undertimeDate?: number;
  rejectionReason?: string;
};

export async function listEmployeeUndertimeHistory(
  employeeId: string,
): Promise<UndertimeHistoryItem[]> {
  const normalized =
    text(employeeId);

  if (!normalized) return [];

  try {
    const records =
      await listRecords(
        undertimeTableId(),
      );

    const results:
      UndertimeHistoryItem[] = [];

    for (const record of records) {
      const f =
        record?.fields ?? {};

      if (
        text(f["Employee ID"]) !==
        normalized
      ) {
        continue;
      }

      const requested =
        Number(
          f[
            "Requested Early Time Out"
          ] ?? 0,
        ) || 0;

      const scheduled =
        Number(
          f[
            "Regular Time Out"
          ] ?? 0,
        ) || 0;

      const duration =
        requested > 0 &&
        scheduled > requested
          ? Math.round(
              ((scheduled -
                requested) /
                3_600_000) *
                100,
            ) / 100
          : Number(
              f[
                "Duration (Hours)"
              ] ?? 0,
            ) || 0;

      results.push({
        requestId:
          text(
            f[
              "Undertime Request ID"
            ],
          ) ||
          text(
            f["Request ID"],
          ),
        requestType:
          "Undertime",
        title: "Undertime",
        detail:
          `${duration || "—"} hour(s)`,
        status:
          text(f["Status"]) ||
          "Pending",
        submittedAt:
          Number(
            f["Submitted At"] ??
              0,
          ) || 0,
        undertimeDate:
          Number(
            f["Undertime Date"] ??
              0,
          ) || undefined,
        rejectionReason:
          text(
            f[
              "Rejection Reason"
            ],
          ) || undefined,
      });
    }

    return results.sort(
      (a, b) =>
        b.submittedAt -
        a.submittedAt,
    );
  } catch (error) {
    console.error(
      "Undertime history load failed:",
      error,
    );
    return [];
  }
}
