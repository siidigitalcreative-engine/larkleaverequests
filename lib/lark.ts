type TenantTokenResponse = {
  code: number;
  msg: string;
  tenant_access_token?: string;
};

export type EmployeeRecord = {
  employeeId: string;
  employeeName: string;
  department?: string;
  mobileNumber: string;
  leaveApprovalGroup: string;
  active: boolean;
};

export type NotifyContact = {
  name: string;
  openId: string;
  active: boolean;
};

export type LeaveRequestInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  dayType: "Full Day" | "Partial Day";
  startTime?: string;
  endTime?: string;
  reason: string;
  notifyNames: string[];
  attachmentToken?: string;
  submittedAt: number;
};

function baseConfig() {
  const appToken = process.env.LARK_BASE_APP_TOKEN;
  if (!appToken) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return { appToken };
}

export async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Missing LARK_APP_ID or LARK_APP_SECRET");

  const response = await fetch(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      cache: "no-store",
    },
  );

  const data = (await response.json()) as TenantTokenResponse;
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Lark token error: ${data.msg || response.statusText}`);
  }
  return data.tenant_access_token;
}

function parseActive(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "yes", "active", "1"].includes(value.toLowerCase());
  return false;
}

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length >= 12) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 11) return digits.slice(1);
  return digits;
}

async function listTableRecords(tableId: string) {
  const token = await getTenantAccessToken();
  const { appToken } = baseConfig();
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
    pageToken = data.data?.has_more ? String(data.data?.page_token ?? "") : "";
  } while (pageToken);

  return items;
}

export async function listActiveEmployees(): Promise<EmployeeRecord[]> {
  const tableId = process.env.LARK_EMPLOYEES_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_EMPLOYEES_TABLE_ID");

  const items = await listTableRecords(tableId);
  const employees: EmployeeRecord[] = [];

  for (const item of items) {
    const f = item.fields ?? {};
    const employeeId = String(f["Employee ID"] ?? "").trim();
    const employeeName = String(f["Full Name"] ?? "").trim();
    const department = String(f["Department"] ?? "").trim();
    const mobileNumber = String(f["Mobile Number"] ?? "").trim();
    const leaveApprovalGroup = String(f["Leave Approval Group"] ?? "").trim();
    const active = parseActive(f["Active"]);

    if (employeeId && employeeName && mobileNumber && leaveApprovalGroup && active) {
      employees.push({
        employeeId,
        employeeName,
        department: department || undefined,
        mobileNumber,
        leaveApprovalGroup,
        active,
      });
    }
  }

  return employees.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function verifyEmployee(input: { employeeName: string; mobileNumber: string }) {
  const employees = await listActiveEmployees();
  const name = input.employeeName.trim().toLowerCase();
  const mobile = normalizeMobile(input.mobileNumber);

  return (
    employees.find(
      (e) =>
        e.employeeName.trim().toLowerCase() === name &&
        normalizeMobile(e.mobileNumber) === mobile,
    ) ?? null
  );
}

export async function listLeaveTypeOptions(): Promise<string[]> {
  const tableId = process.env.LARK_LEAVE_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_LEAVE_TABLE_ID");

  const token = await getTenantAccessToken();
  const { appToken } = baseConfig();

  const url = new URL(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
  );
  url.searchParams.set("page_size", "100");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Lark Leave Type options error: ${data.msg || response.statusText}`);
  }

  const fields = data.data?.items ?? [];
  const leaveTypeField = fields.find(
    (field: any) => String(field.field_name ?? "").trim() === "Leave Type",
  );

  if (!leaveTypeField) {
    throw new Error('Lark field "Leave Type" was not found.');
  }

  const options = Array.isArray(leaveTypeField.property?.options)
    ? leaveTypeField.property.options
    : [];

  return options
    .map((option: any) => String(option.name ?? "").trim())
    .filter(Boolean);
}

export async function listNotifyContacts(): Promise<NotifyContact[]> {
  const tableId = process.env.LARK_NOTIFY_CONTACTS_TABLE_ID;
  if (!tableId) return [];

  const items = await listTableRecords(tableId);
  return items
    .map((item) => {
      const f = item.fields ?? {};
      return {
        name: String(f["Name"] ?? "").trim(),
        openId: String(f["Open ID"] ?? "").trim(),
        active: parseActive(f["Active"]),
      };
    })
    .filter((x) => x.name && x.openId && x.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function uploadLeaveAttachment(file: File): Promise<string> {
  const token = await getTenantAccessToken();
  const { appToken } = baseConfig();

  const form = new FormData();
  form.set("file_name", file.name || `leave-${Date.now()}`);
  form.set("parent_type", "bitable_file");
  form.set("parent_node", appToken);
  form.set("size", String(file.size));
  form.set("file", file, file.name || `leave-${Date.now()}`);

  const response = await fetch(
    "https://open.larksuite.com/open-apis/drive/v1/medias/upload_all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.data?.file_token) {
    throw new Error(`Lark attachment upload error: ${data.msg || response.statusText}`);
  }
  return String(data.data.file_token);
}


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

function normalizeTableName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Approval table routing:
 *
 * 1. If LARK_LEAVE_APPROVAL_TABLES contains the group, use that explicit mapping.
 * 2. Otherwise automatically discover a table in the SAME Base by name.
 *
 * Recommended table name:
 *   "<Approval Group> Leave Approvals"
 *
 * Example:
 *   Digital Creative -> "Digital Creative Leave Approvals"
 *
 * This means you can create more approval tables later without adding a new
 * environment variable for every table.
 */
async function approvalDestinationFor(
  group: string,
): Promise<ApprovalDestination | null> {
  const defaultAppToken = baseConfig().appToken;
  const raw = process.env.LARK_LEAVE_APPROVAL_TABLES;

  // Optional explicit overrides remain supported.
  if (raw?.trim()) {
    let config: Record<string, ApprovalDestinationConfig>;

    try {
      config = JSON.parse(raw) as Record<string, ApprovalDestinationConfig>;
    } catch {
      throw new Error(
        "LARK_LEAVE_APPROVAL_TABLES must be valid JSON.",
      );
    }

    const wanted = group.trim().toLowerCase();
    const matchedKey = Object.keys(config).find(
      (key) => key.trim().toLowerCase() === wanted,
    );

    if (matchedKey) {
      const value = config[matchedKey];

      if (typeof value === "string") {
        const tableId = value.trim();
        if (tableId) {
          return {
            appToken: defaultAppToken,
            tableId,
          };
        }
      } else {
        const tableId = String(value?.tableId ?? "").trim();

        if (tableId) {
          return {
            appToken:
              String(value?.appToken ?? "").trim() || defaultAppToken,
            tableId,
          };
        }
      }
    }
  }

  // No explicit mapping: automatically locate the table by its name.
  const tables = await listBaseTables(defaultAppToken);

  const groupName = normalizeTableName(group);

  const acceptedNames = new Set([
    normalizeTableName(`${group} Leave Approvals`),
    normalizeTableName(`${group} Leave Approval`),
    normalizeTableName(`${group} Leave Requests`),
    normalizeTableName(`${group} Leave Request`),
  ]);

  const exactMatches = tables.filter((table: any) =>
    acceptedNames.has(
      normalizeTableName(
        String(table?.name ?? table?.table_name ?? ""),
      ),
    ),
  );

  if (exactMatches.length === 1) {
    return {
      appToken: defaultAppToken,
      tableId: String(
        exactMatches[0]?.table_id ?? exactMatches[0]?.tableId ?? "",
      ).trim(),
    };
  }

  // Fallback: allow one unambiguous table whose name starts with the group
  // and contains "leave".
  const fallbackMatches = tables.filter((table: any) => {
    const name = normalizeTableName(
      String(table?.name ?? table?.table_name ?? ""),
    );

    return name.startsWith(groupName) && name.includes("leave");
  });

  if (fallbackMatches.length === 1) {
    return {
      appToken: defaultAppToken,
      tableId: String(
        fallbackMatches[0]?.table_id ?? fallbackMatches[0]?.tableId ?? "",
      ).trim(),
    };
  }

  if (fallbackMatches.length > 1 || exactMatches.length > 1) {
    throw new Error(
      `More than one approval table matches approval group "${group}". ` +
        `Rename the intended table to "${group} Leave Approvals" or add an explicit mapping in LARK_LEAVE_APPROVAL_TABLES.`,
    );
  }

  return null;
}

async function listTableFieldsFor(appToken: string, tableId: string) {
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
        `Lark approval table fields error: ${data.msg || response.statusText}`,
      );
    }

    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more
      ? String(data.data?.page_token ?? "")
      : "";
  } while (pageToken);

  return items;
}

function normalizeMemberFieldForWrite(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const members = value
    .map((item: any) => {
      if (typeof item === "string" && item.trim()) {
        return { id: item.trim() };
      }

      const id = String(
        item?.id ?? item?.open_id ?? item?.user_id ?? "",
      ).trim();

      return id ? { id } : null;
    })
    .filter(Boolean);

  return members.length ? members : undefined;
}

async function employeeMemberForApproval(employeeId: string) {
  const tableId = process.env.LARK_EMPLOYEES_TABLE_ID;
  if (!tableId) return undefined;

  const items = await listTableRecords(tableId);

  const employee = items.find(
    (item) =>
      String(item?.fields?.["Employee ID"] ?? "").trim() === employeeId.trim(),
  );

  if (!employee) return undefined;

  const fields = employee.fields ?? {};

  return normalizeMemberFieldForWrite(
    fields["Employee Lark Member"] ?? fields["Lark Member"],
  );
}

/**
 * Creates the secondary approval-workspace record.
 *
 * Routing is controlled entirely by the LARK_LEAVE_APPROVAL_TABLES env var,
 * so new approval groups/tables can be added without changing frontend/backend code.
 *
 * The function also reads the destination table schema first and only sends
 * fields that actually exist there. This avoids FieldNameNotFound when
 * different approval tables have slightly different columns.
 */
export async function createApprovalGroupRecord(
  input: LeaveRequestInput & {
    mainRecordId: string;
    requestId: string;
  },
) {
  const destination = await approvalDestinationFor(input.approvalGroup);

  if (!destination) {
    return {
      created: false as const,
      reason: `No approval table found for group: ${input.approvalGroup}. Name the table "${input.approvalGroup} Leave Approvals" or add it to LARK_LEAVE_APPROVAL_TABLES.`,
    };
  }

  const token = await getTenantAccessToken();
  const tableFields = await listTableFieldsFor(
    destination.appToken,
    destination.tableId,
  );

  const fieldsByName = new Map(
    tableFields.map((field: any) => [
      String(field?.field_name ?? "").trim(),
      field,
    ]),
  );

  const existingFieldNames = new Set(fieldsByName.keys());

  const toManilaDateTime = (date: string, time: string) => {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return new Date(`${date}T${normalizedTime}+08:00`).getTime();
  };

  const candidateFields: Record<string, unknown> = {
    "Leave Request ID": input.requestId,
    "Employee ID": input.employeeId,
    "Employee Name": input.employeeName,
    "Department": input.department || "",
    "Approval Group": input.approvalGroup,
    "Leave Type": input.leaveType,
    "Start Date": new Date(
      `${input.startDate}T00:00:00+08:00`,
    ).getTime(),
    "End Date": new Date(
      `${input.endDate}T00:00:00+08:00`,
    ).getTime(),
    "Day Type": input.dayType,
    "Reason": input.reason,
    "Decision": "Pending",
    "Status": "Pending",
    "Submitted At": input.submittedAt,
    "Main Record ID": input.mainRecordId,
    "Sync Status": "Pending",
  };

  if (input.dayType === "Partial Day" && input.startTime && input.endTime) {
    candidateFields["Start Time"] = toManilaDateTime(
      input.startDate,
      input.startTime,
    );
    candidateFields["End Time"] = toManilaDateTime(
      input.endDate,
      input.endTime,
    );
  }

  if (input.attachmentToken) {
    candidateFields["Attachment"] = [
      { file_token: input.attachmentToken },
    ];
  }

  if (existingFieldNames.has("Employee Lark Member")) {
    const memberValue = await employeeMemberForApproval(input.employeeId);
    if (memberValue) {
      candidateFields["Employee Lark Member"] = memberValue;
    }
  }

  const skippedFields: string[] = [];

  function canWriteField(fieldName: string, value: unknown) {
    const field = fieldsByName.get(fieldName);

    if (!field) {
      skippedFields.push(`${fieldName}: field does not exist`);
      return false;
    }

    if (value === undefined || value === null) {
      skippedFields.push(`${fieldName}: empty value`);
      return false;
    }

    const fieldType = Number(field?.type);

    // Single select / multi select:
    // only write values that already exist as options in the destination table.
    // This avoids the entire record creation failing because one approval table
    // is missing an option such as "Full Day".
    if (fieldType === 3 || fieldType === 4) {
      const optionNames = new Set(
        (field?.property?.options ?? []).map((option: any) =>
          String(option?.name ?? "").trim(),
        ),
      );

      if (fieldType === 3) {
        const wanted = String(value ?? "").trim();
        if (!optionNames.has(wanted)) {
          skippedFields.push(
            `${fieldName}: option "${wanted}" does not exist in destination table`,
          );
          return false;
        }
      }

      if (fieldType === 4 && Array.isArray(value)) {
        const wanted = value.map((item) => String(item).trim());
        if (wanted.some((item) => !optionNames.has(item))) {
          skippedFields.push(
            `${fieldName}: one or more multi-select options do not exist`,
          );
          return false;
        }
      }
    }

    // Computed / system fields should never be written directly.
    if ([19, 20, 1001, 1002, 1003, 1004, 1005].includes(fieldType)) {
      skippedFields.push(`${fieldName}: read-only/computed field`);
      return false;
    }

    return true;
  }

  const fields = Object.fromEntries(
    Object.entries(candidateFields).filter(([fieldName, value]) =>
      canWriteField(fieldName, value),
    ),
  );

  // Leave Request ID is the primary linkage field and should always be writable.
  if (!fields["Leave Request ID"]) {
    throw new Error(
      `Approval table "${input.approvalGroup}" is missing a writable "Leave Request ID" field.`,
    );
  }

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${destination.appToken}/tables/${destination.tableId}/records`,
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
      `Lark approval table create error for ${input.approvalGroup}: ${
        data.msg || response.statusText
      }`,
    );
  }

  return {
    created: true as const,
    tableId: destination.tableId,
    recordId: String(data.data?.record?.record_id ?? ""),
    skippedFields,
  };
}

export async function createLeaveRequest(input: LeaveRequestInput) {
  const tableId = process.env.LARK_LEAVE_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_LEAVE_TABLE_ID");

  const token = await getTenantAccessToken();
  const { appToken } = baseConfig();
  const requestId = `${input.employeeId}-LV-${input.submittedAt}`;

  const toManilaDateTime = (date: string, time: string) => {
    const normalizedTime = time.length === 5 ? `${time}:00` : time;
    return new Date(`${date}T${normalizedTime}+08:00`).getTime();
  };

  const fields: Record<string, unknown> = {
    "Leave Request ID": requestId,
    "Employee ID": input.employeeId,
    "Employee Name": input.employeeName,
    "Department": input.department || "",
    "Approval Group": input.approvalGroup,
    "Leave Type": input.leaveType,
    "Start Date": new Date(`${input.startDate}T00:00:00+08:00`).getTime(),
    "End Date": new Date(`${input.endDate}T00:00:00+08:00`).getTime(),
    "Day Type": input.dayType,
    "Reason": input.reason,
    "Status": "Pending",
    "Submitted At": input.submittedAt,
    "Rejection Reason": "",
  };

  // Only send Date-Time fields when they actually have valid values.
  if (input.dayType === "Partial Day" && input.startTime && input.endTime) {
    fields["Start Time"] = toManilaDateTime(input.startDate, input.startTime);
    fields["End Time"] = toManilaDateTime(input.endDate, input.endTime);
  }

  if (input.attachmentToken) {
    fields["Attachment"] = [{ file_token: input.attachmentToken }];
  }

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
    throw new Error(`Lark leave create error: ${data.msg || response.statusText}`);
  }

  return {
    recordId: String(data.data?.record?.record_id ?? ""),
    requestId,
  };
}

function webhookFor(group: string) {
  const key = group.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const value = process.env[`LARK_LEAVE_WEBHOOK_${key}`];
  if (!value) throw new Error(`Missing leave webhook for approval group: ${group}`);
  return value;
}

function multiUrl(url: string) {
  return { url, android_url: url, ios_url: url, pc_url: url };
}

export async function sendLeaveApprovalCard(
  input: LeaveRequestInput & { recordId: string; requestId: string; reviewToken: string },
) {
  const baseUrl = process.env.APP_PUBLIC_URL;
  if (!baseUrl) throw new Error("Missing APP_PUBLIC_URL");

  const approveUrl = `${baseUrl}/review/${encodeURIComponent(input.recordId)}?token=${encodeURIComponent(input.reviewToken)}&decision=approve`;
  const rejectUrl = `${baseUrl}/review/${encodeURIComponent(input.recordId)}?token=${encodeURIComponent(input.reviewToken)}&decision=reject`;
  const webhook = webhookFor(input.approvalGroup);

  const card = {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: `${input.employeeName} — Leave Request` },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**${input.employeeName}'s Leave**\nEmployee ID: ${input.employeeId}\nDepartment: ${input.department || "—"}\nApproval Group: ${input.approvalGroup}`,
        },
      },
      {
        tag: "div",
        fields: [
          { is_short: true, text: { tag: "lark_md", content: `**Leave Type**\n${input.leaveType}` } },
          { is_short: true, text: { tag: "lark_md", content: `**Day Type**\n${input.dayType}` } },
          { is_short: true, text: { tag: "lark_md", content: `**Start**\n${input.startDate}${input.startTime ? ` ${input.startTime}` : ""}` } },
          { is_short: true, text: { tag: "lark_md", content: `**End**\n${input.endDate}${input.endTime ? ` ${input.endTime}` : ""}` } },
        ],
      },
      { tag: "hr" },
      {
        tag: "div",
        text: { tag: "lark_md", content: `**Reason for leave**\n${input.reason}` },
      },
      ...(input.notifyNames.length
        ? [{
            tag: "div",
            text: { tag: "lark_md", content: `**Notify**\n${input.notifyNames.join(", ")}` },
          }]
        : []),
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            type: "primary",
            text: { tag: "plain_text", content: "Approve" },
            multi_url: multiUrl(approveUrl),
          },
          {
            tag: "button",
            type: "danger",
            text: { tag: "plain_text", content: "Reject" },
            multi_url: multiUrl(rejectUrl),
          },
        ],
      },
      {
        tag: "note",
        elements: [
          { tag: "plain_text", content: `Request ${input.requestId} • Pending approval` },
        ],
      },
    ],
  };

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "interactive", card }),
    cache: "no-store",
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Leave group webhook error: ${response.status} ${responseText}`);
  }
}

export async function sendDirectNotifyMessage(openId: string, text: string) {
  const token = await getTenantAccessToken();
  const url = new URL("https://open.larksuite.com/open-apis/im/v1/messages");
  url.searchParams.set("receive_id_type", "open_id");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Direct notify failed: ${data.msg || response.statusText}`);
  }
}

export async function getLeaveRecord(recordId: string) {
  const tableId = process.env.LARK_LEAVE_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_LEAVE_TABLE_ID");
  const token = await getTenantAccessToken();
  const { appToken } = baseConfig();

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Lark leave read error: ${data.msg || response.statusText}`);
  }
  return data.data?.record;
}

export async function verifyApprover(input: {
  name: string;
  mobileNumber: string;
  approvalGroup: string;
}) {
  const tableId = process.env.LARK_LEAVE_APPROVERS_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_LEAVE_APPROVERS_TABLE_ID");
  const items = await listTableRecords(tableId);
  const name = input.name.trim().toLowerCase();
  const mobile = normalizeMobile(input.mobileNumber);

  for (const item of items) {
    const f = item.fields ?? {};
    const groupsRaw = f["Approval Group"];
    const groups = Array.isArray(groupsRaw)
      ? groupsRaw.map((x: unknown) => String(x).trim())
      : String(groupsRaw ?? "").split(",").map((x) => x.trim()).filter(Boolean);

    if (
      parseActive(f["Active"]) &&
      String(f["Name"] ?? "").trim().toLowerCase() === name &&
      normalizeMobile(String(f["Mobile Number"] ?? "")) === mobile &&
      groups.includes(input.approvalGroup)
    ) {
      return { name: String(f["Name"]).trim() };
    }
  }
  return null;
}


export async function updateApprovalGroupDecision(input: {
  approvalGroup: string;
  mainRecordId: string;
  requestId: string;
  decision: "Approved" | "Rejected";
  rejectionReason?: string;
}) {
  const destination = await approvalDestinationFor(input.approvalGroup);

  if (!destination) {
    throw new Error(
      `No approval table found for group: ${input.approvalGroup}.`,
    );
  }

  const token = await getTenantAccessToken();

  // Find the copied approval record using Main Record ID first.
  // Fall back to Leave Request ID so older copied records can still be updated.
  const url = new URL(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${destination.appToken}/tables/${destination.tableId}/records`,
  );
  url.searchParams.set("page_size", "500");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(
      `Lark approval table read error: ${data.msg || response.statusText}`,
    );
  }

  const items = data.data?.items ?? [];

  const approvalRecord =
    items.find(
      (item: any) =>
        String(item?.fields?.["Main Record ID"] ?? "").trim() ===
        input.mainRecordId.trim(),
    ) ??
    items.find(
      (item: any) =>
        String(item?.fields?.["Leave Request ID"] ?? "").trim() ===
        input.requestId.trim(),
    );

  if (!approvalRecord?.record_id) {
    throw new Error(
      `Approval record not found for request ${input.requestId}.`,
    );
  }

  const tableFields = await listTableFieldsFor(
    destination.appToken,
    destination.tableId,
  );

  const existingFieldNames = new Set(
    tableFields.map((field: any) =>
      String(field?.field_name ?? "").trim(),
    ),
  );

  const fields: Record<string, unknown> = {};

  // Support either "Decision" or "Status" in approval tables.
  if (existingFieldNames.has("Decision")) {
    fields["Decision"] = input.decision;
  }

  if (existingFieldNames.has("Status")) {
    fields["Status"] = input.decision;
  }

  if (existingFieldNames.has("Rejection Reason")) {
    fields["Rejection Reason"] =
      input.decision === "Rejected"
        ? input.rejectionReason || ""
        : "";
  }

  if (existingFieldNames.has("Processed At")) {
    fields["Processed At"] = Date.now();
  }

  if (existingFieldNames.has("Sync Status")) {
    fields["Sync Status"] = "Synced";
  }

  if (!Object.keys(fields).length) {
    throw new Error(
      `Approval table for ${input.approvalGroup} has no writable Decision/Status field.`,
    );
  }

  const updateResponse = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${destination.appToken}/tables/${destination.tableId}/records/${approvalRecord.record_id}`,
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

  const updateData = await updateResponse.json();

  if (!updateResponse.ok || updateData.code !== 0) {
    throw new Error(
      `Lark approval table decision update error: ${
        updateData.msg || updateResponse.statusText
      }`,
    );
  }

  return {
    ok: true,
    approvalRecordId: String(approvalRecord.record_id),
    tableId: destination.tableId,
  };
}

export async function updateLeaveDecision(input: {
  recordId: string;
  decision: "Approved" | "Rejected";
  approverName: string;
  rejectionReason?: string;
}) {
  const tableId = process.env.LARK_LEAVE_TABLE_ID;
  if (!tableId) throw new Error("Missing LARK_LEAVE_TABLE_ID");
  const token = await getTenantAccessToken();
  const { appToken } = baseConfig();

  const fields: Record<string, unknown> = {
    Status: input.decision,
    "Approved By": input.approverName,
    "Approved At": Date.now(),
    "Rejection Reason": input.decision === "Rejected" ? input.rejectionReason || "" : "",
  };

  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${input.recordId}`,
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
    throw new Error(`Lark leave update error: ${data.msg || response.statusText}`);
  }
}

export async function sendDecisionCard(input: {
  approvalGroup: string;
  employeeName: string;
  requestId: string;
  leaveType: string;
  startDate?: string;
  endDate?: string;
  decision: "Approved" | "Rejected";
  rejectionReason?: string;
}) {
  const webhook = webhookFor(input.approvalGroup);
  const approved = input.decision === "Approved";

  const card = {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      template: approved ? "green" : "red",
      title: {
        tag: "plain_text",
        content: `${input.employeeName} — Leave ${input.decision}`,
      },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content:
            `**${input.employeeName}'s Leave**\n` +
            `Leave Type: ${input.leaveType}\n` +
            (input.startDate && input.endDate
              ? `Date: ${input.startDate}${input.startDate !== input.endDate ? ` to ${input.endDate}` : ""}\n`
              : "") +
            `Status: **${input.decision}**` +
            (!approved && input.rejectionReason
              ? `\nRejection Reason: ${input.rejectionReason}`
              : ""),
        },
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `Request ${input.requestId} • ${input.decision}`,
          },
        ],
      },
    ],
  };

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "interactive", card }),
    cache: "no-store",
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Leave decision webhook error: ${response.status} ${responseText}`);
  }

  try {
    const data = JSON.parse(responseText) as { code?: number; msg?: string };
    if (typeof data.code === "number" && data.code !== 0) {
      throw new Error(`Leave decision webhook error: ${data.msg || data.code}`);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
}
