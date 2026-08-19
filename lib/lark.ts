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

  // Lark Date/DateTime fields must receive millisecond timestamps.
  // Do not send blank strings to Start Time / End Time for Full Day leave.
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
  leaveType: string;
  decision: "Approved" | "Rejected";
  approverName: string;
  rejectionReason?: string;
}) {
  const webhook = webhookFor(input.approvalGroup);
  const approved = input.decision === "Approved";
  const card = {
    config: { wide_screen_mode: true },
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
            `**${input.leaveType}**\nStatus: **${input.decision}**\nProcessed by: ${input.approverName}` +
            (!approved && input.rejectionReason ? `\nReason: ${input.rejectionReason}` : ""),
        },
      },
    ],
  };
  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "interactive", card }),
    cache: "no-store",
  });
}
