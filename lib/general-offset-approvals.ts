import { getTenantAccessToken } from "@/lib/lark";
import { getMonthlyRequestCounts, monthlyRequestCountLines } from "@/lib/monthly-request-counts";

export type GeneralApprovalInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  requestCategory: "Item Release" | "Equipment" | "Purchase" | "Budget Request" | "Other";
  requestTitle: string;
  requestDetails: string;
  amountBudget?: number;
  submittedAt: number;
  attachmentToken?: string;
  attachmentImageKey?: string;
  attachmentName?: string;
};

export type OffsetApprovalInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  dateWorked: string;
  workType: "Weekend" | "Rest Day" | "Holiday" | "Other";
  requestedOffsetDate: string;
  hoursWorked: number;
  reason: string;
  submittedAt: number;
  attachmentToken?: string;
  attachmentImageKey?: string;
  attachmentName?: string;
};

type ApprovalDestination = { appToken: string; tableId: string };
type ApprovalDestinationConfig = string | { tableId?: string; appToken?: string };

function baseAppToken() {
  const value = process.env.LARK_BASE_APP_TOKEN;
  if (!value) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return value;
}
function generalTableId() {
  const value = process.env.LARK_GENERAL_APPROVAL_TABLE_ID;
  if (!value) throw new Error("Missing LARK_GENERAL_APPROVAL_TABLE_ID");
  return value;
}
function offsetTableId() {
  const value = process.env.LARK_OFFSET_APPROVAL_TABLE_ID;
  if (!value) throw new Error("Missing LARK_OFFSET_APPROVAL_TABLE_ID");
  return value;
}
function text(value: unknown) { return String(value ?? "").trim(); }
function normalizeTableName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function toDateMs(date: string) {
  return new Date(`${date}T00:00:00+08:00`).getTime();
}
function dateText(value: string | number) {
  const timestamp = typeof value === "number" ? value : toDateMs(value);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric",
  }).format(new Date(timestamp));
}
function filedText(timestamp: number) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(timestamp));
}

async function listRecords(tableId: string, appToken = baseAppToken()) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`);
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.code !== 0) throw new Error(`Lark Base read error: ${data.msg || response.statusText}`);
    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more ? String(data.data?.page_token ?? "") : "";
  } while (pageToken);
  return items;
}

async function listFields(tableId: string, appToken = baseAppToken()) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`);
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.code !== 0) throw new Error(`Lark Base fields error: ${data.msg || response.statusText}`);
    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more ? String(data.data?.page_token ?? "") : "";
  } while (pageToken);
  return items;
}

async function listBaseTables(appToken: string) {
  const token = await getTenantAccessToken();
  const items: any[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables`);
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.code !== 0) throw new Error(`Lark Base table-list error: ${data.msg || response.statusText}`);
    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more ? String(data.data?.page_token ?? "") : "";
  } while (pageToken);
  return items;
}

async function approvalDestinationFor(group: string): Promise<ApprovalDestination | null> {
  const defaultAppToken = baseAppToken();
  const raw = process.env.LARK_APPROVAL_TABLES || process.env.LARK_LEAVE_APPROVAL_TABLES;
  if (raw?.trim()) {
    let config: Record<string, ApprovalDestinationConfig>;
    try { config = JSON.parse(raw); }
    catch { throw new Error("LARK_APPROVAL_TABLES (or legacy LARK_LEAVE_APPROVAL_TABLES) must be valid JSON."); }

    const wanted = group.trim().toLowerCase();
    const matchedKey = Object.keys(config).find((key) => key.trim().toLowerCase() === wanted);
    if (matchedKey) {
      const value = config[matchedKey];
      if (typeof value === "string" && value.trim()) return { appToken: defaultAppToken, tableId: value.trim() };
      if (typeof value === "object" && value) {
        const tableId = text(value.tableId);
        if (tableId) return { appToken: text(value.appToken) || defaultAppToken, tableId };
      }
    }
  }

  const tables = await listBaseTables(defaultAppToken);
  const wantedNames = new Set([
    normalizeTableName(`${group} Approvals`),
    normalizeTableName(`${group} Approval`),
  ]);
  const matches = tables.filter((table: any) =>
    wantedNames.has(normalizeTableName(String(table?.name ?? table?.table_name ?? ""))),
  );
  if (matches.length === 1) {
    return { appToken: defaultAppToken, tableId: text(matches[0]?.table_id ?? matches[0]?.tableId) };
  }
  if (matches.length > 1) throw new Error(`More than one approval table matches "${group}". Add an explicit mapping in LARK_APPROVAL_TABLES.`);
  return null;
}

function writableFields(tableFields: any[], candidates: Record<string, unknown>) {
  const byName = new Map(tableFields.map((field: any) => [text(field?.field_name), field]));
  const skippedFields: string[] = [];
  const fields = Object.fromEntries(
    Object.entries(candidates).filter(([name, value]) => {
      const field = byName.get(name);
      if (!field) { skippedFields.push(`${name}: field does not exist`); return false; }
      if (value === undefined || value === null || value === "") { skippedFields.push(`${name}: empty value`); return false; }

      const fieldType = Number(field?.type);
      if (fieldType === 3 || fieldType === 4) {
        const optionNames = new Set((field?.property?.options ?? []).map((option: any) => text(option?.name)));
        if (fieldType === 3) {
          const wanted = text(value);
          if (!optionNames.has(wanted)) { skippedFields.push(`${name}: option "${wanted}" does not exist`); return false; }
        }
        if (fieldType === 4 && Array.isArray(value) && value.some((item) => !optionNames.has(text(item)))) {
          skippedFields.push(`${name}: one or more options do not exist`);
          return false;
        }
      }
      if ([19, 20, 1001, 1002, 1003, 1004, 1005].includes(fieldType)) {
        skippedFields.push(`${name}: read-only/computed field`);
        return false;
      }
      return true;
    }),
  );
  return { fields, skippedFields };
}

async function createRecord(tableId: string, fields: Record<string, unknown>, appToken = baseAppToken()) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ fields }),
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0) throw new Error(`Lark Base create error: ${data.msg || response.statusText}`);
  return String(data.data?.record?.record_id ?? "");
}

async function updateRecord(tableId: string, recordId: string, fields: Record<string, unknown>, appToken = baseAppToken()) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ fields }),
      cache: "no-store",
    },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0) throw new Error(`Lark Base update error: ${data.msg || response.statusText}`);
}

async function getRecord(tableId: string, recordId: string) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records/${recordId}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0) throw new Error(`Unable to load request record: ${data.msg || response.statusText}`);
  return data.data?.record;
}

function webhookFor(group: string) {
  const key = group.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const value = process.env[`LARK_APPROVAL_WEBHOOK_${key}`] || process.env[`LARK_LEAVE_WEBHOOK_${key}`];
  if (!value) throw new Error(`Missing approval webhook for approval group: ${group}`);
  return value;
}

function multiUrl(url: string) {
  return { url, android_url: url, ios_url: url, pc_url: url };
}

async function postWebhook(webhook: string, card: Record<string, unknown>) {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ msg_type: "interactive", card }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && typeof data.code === "number" && data.code !== 0)) {
    throw new Error(`Lark webhook error: ${data?.msg || response.statusText}`);
  }
}

async function saveAttachment(tableId: string, recordId: string, attachmentToken?: string) {
  if (!attachmentToken) return;
  await updateRecord(tableId, recordId, { Attachment: [{ file_token: attachmentToken }] });
}

async function createApprovalGroupRecord(input: {
  approvalGroup: string;
  approvalType: "General Approval" | "Offset Approval";
  requestId: string;
  requestTitle: string;
  requestDetails: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  submittedAt: number;
  mainRecordId: string;
  reason: string;
  startDate?: number;
  endDate?: number;
  durationHours?: number;
  attachmentToken?: string;
}) {
  const destination = await approvalDestinationFor(input.approvalGroup);
  if (!destination) return { created: false as const, reason: `No approval table found for group: ${input.approvalGroup}.` };

  const fieldsInfo = await listFields(destination.tableId, destination.appToken);
  const hasAttachmentField = fieldsInfo.some((field: any) => text(field?.field_name) === "Attachment");
  const { fields, skippedFields } = writableFields(fieldsInfo, {
    "Approval Type": input.approvalType,
    "Request ID": input.requestId,
    "Request Title": input.requestTitle,
    "Request Details": input.requestDetails,
    "Employee ID": input.employeeId,
    "Employee Name": input.employeeName,
    Department: input.department || "",
    "Approval Group": input.approvalGroup,
    "Start Date": input.startDate,
    "End Date": input.endDate,
    "Duration (Hours)": input.durationHours,
    Reason: input.reason,
    Decision: "Pending",
    Status: "Pending",
    "Submitted At": input.submittedAt,
    "Main Record ID": input.mainRecordId,
    "Sync Status": "Pending",
  });

  if (!fields["Request ID"]) throw new Error(`Approval table "${input.approvalGroup}" needs a writable "Request ID" field.`);

  const recordId = await createRecord(destination.tableId, fields, destination.appToken);
  if (input.attachmentToken) {
    if (!hasAttachmentField) skippedFields.push("Attachment: field does not exist in destination approval table");
    else {
      await updateRecord(
        destination.tableId, recordId,
        { Attachment: [{ file_token: input.attachmentToken }] },
        destination.appToken,
      );
    }
  }
  return { created: true as const, tableId: destination.tableId, recordId, skippedFields };
}

async function syncApprovalGroupDecision(input: {
  approvalGroup: string;
  mainRecordId: string;
  requestId: string;
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const destination = await approvalDestinationFor(input.approvalGroup);
  if (!destination) throw new Error(`No approval table found for group: ${input.approvalGroup}`);

  const records = await listRecords(destination.tableId, destination.appToken);
  const match = records.find((record: any) => {
    const fields = record?.fields ?? {};
    return text(fields["Main Record ID"]) === input.mainRecordId || text(fields["Request ID"]) === input.requestId;
  });
  if (!match?.record_id) throw new Error(`Approval record was not found in ${input.approvalGroup} Approvals.`);

  const fieldsInfo = await listFields(destination.tableId, destination.appToken);
  const { fields } = writableFields(fieldsInfo, {
    Decision: input.decision,
    Status: input.decision,
    "Rejection Reason": input.decision === "Rejected" ? input.rejectionReason : undefined,
    "Approval Comment": input.decision === "Approved" ? input.approvalComment : undefined,
    "Sync Status": "Synced",
  });
  await updateRecord(destination.tableId, String(match.record_id), fields, destination.appToken);
}

export async function createGeneralApprovalRequest(input: GeneralApprovalInput) {
  const tableId = generalTableId();
  const fieldsInfo = await listFields(tableId);
  const requestId = `${input.employeeId}-GA-${input.submittedAt}`;
  const { fields } = writableFields(fieldsInfo, {
    "General Approval Request ID": requestId,
    "Request ID": requestId,
    "Employee ID": input.employeeId,
    "Employee Name": input.employeeName,
    Department: input.department || "",
    "Approval Group": input.approvalGroup,
    "Request Title": input.requestTitle,
    "Request Category": input.requestCategory,
    "Request Details": input.requestDetails,
    "Amount/Budget": input.amountBudget && input.amountBudget > 0 ? input.amountBudget : undefined,
    Status: "Pending",
    "Submitted At": input.submittedAt,
  });
  const recordId = await createRecord(tableId, fields);
  await saveAttachment(tableId, recordId, input.attachmentToken);
  return { recordId, requestId };
}

export async function createGeneralApprovalGroupRecord(
  input: GeneralApprovalInput & { mainRecordId: string; requestId: string },
) {
  return createApprovalGroupRecord({
    approvalGroup: input.approvalGroup,
    approvalType: "General Approval",
    requestId: input.requestId,
    requestTitle: input.requestTitle,
    requestDetails: input.requestDetails,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    department: input.department,
    submittedAt: input.submittedAt,
    mainRecordId: input.mainRecordId,
    reason: input.requestDetails,
    attachmentToken: input.attachmentToken,
  });
}

export async function createOffsetApprovalRequest(input: OffsetApprovalInput) {
  const tableId = offsetTableId();
  const fieldsInfo = await listFields(tableId);
  const requestId = `${input.employeeId}-OA-${input.submittedAt}`;
  const { fields } = writableFields(fieldsInfo, {
    "Offset Request ID": requestId,
    "Request ID": requestId,
    "Employee ID": input.employeeId,
    "Employee Name": input.employeeName,
    Department: input.department || "",
    "Approval Group": input.approvalGroup,
    "Date Worked": toDateMs(input.dateWorked),
    "Work Type": input.workType,
    "Requested Offset Date": toDateMs(input.requestedOffsetDate),
    "Hours Worked": input.hoursWorked,
    "Reason / Work Details": input.reason,
    Status: "Pending",
    "Submitted At": input.submittedAt,
  });
  const recordId = await createRecord(tableId, fields);
  await saveAttachment(tableId, recordId, input.attachmentToken);
  return { recordId, requestId };
}

export async function createOffsetApprovalGroupRecord(
  input: OffsetApprovalInput & { mainRecordId: string; requestId: string },
) {
  return createApprovalGroupRecord({
    approvalGroup: input.approvalGroup,
    approvalType: "Offset Approval",
    requestId: input.requestId,
    requestTitle: `${input.employeeName} — Offset Approval`,
    requestDetails: input.reason,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    department: input.department,
    submittedAt: input.submittedAt,
    mainRecordId: input.mainRecordId,
    reason: input.reason,
    startDate: toDateMs(input.dateWorked),
    endDate: toDateMs(input.requestedOffsetDate),
    durationHours: input.hoursWorked,
    attachmentToken: input.attachmentToken,
  });
}

export async function sendGeneralApprovalCard(
  input: GeneralApprovalInput & { recordId: string; requestId: string; reviewToken: string },
) {
  const baseUrl = process.env.APP_PUBLIC_URL;
  if (!baseUrl) throw new Error("Missing APP_PUBLIC_URL");
  const approveUrl = `${baseUrl}/review/general-approval/${encodeURIComponent(input.recordId)}?token=${encodeURIComponent(input.reviewToken)}&decision=approve`;
  const rejectUrl = `${baseUrl}/review/general-approval/${encodeURIComponent(input.recordId)}?token=${encodeURIComponent(input.reviewToken)}&decision=reject`;
  const monthlyCountLines = monthlyRequestCountLines(await getMonthlyRequestCounts(input.employeeId, input.submittedAt));

  const elements: any[] = [
    { tag: "div", text: { tag: "lark_md", content:
      `**${input.employeeName}'s General Approval**\nEmployee ID: ${input.employeeId}\nDepartment: ${input.department || "—"}\nApproval Group: ${input.approvalGroup}\n` +
      (monthlyCountLines ? `${monthlyCountLines}\n` : "") +
      `**Date Filed: ${filedText(input.submittedAt)}**`
    }},
    { tag: "div", fields: [
      { is_short: true, text: { tag: "lark_md", content: `**Category**\n${input.requestCategory}` }},
      ...(input.amountBudget && input.amountBudget > 0 ? [{
        is_short: true,
        text: { tag: "lark_md", content: `**Amount / Budget**\n₱${input.amountBudget.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
      }] : []),
    ]},
    { tag: "div", text: { tag: "lark_md", content: `**Request Title**\n${input.requestTitle}` }},
    { tag: "div", text: { tag: "lark_md", content: `**Request Details**\n${input.requestDetails}` }},
  ];

  if (input.attachmentImageKey) elements.push({
    tag: "img", img_key: input.attachmentImageKey,
    alt: { tag: "plain_text", content: input.attachmentName || "General Approval attachment" },
    compact_width: true, preview: true,
  });
  else if (input.attachmentName) elements.push({
    tag: "div", text: { tag: "lark_md", content: `**Attachment**\n${input.attachmentName}` },
  });

  elements.push({ tag: "action", actions: [
    { tag: "button", text: { tag: "plain_text", content: "Approve" }, type: "primary", multi_url: multiUrl(approveUrl) },
    { tag: "button", text: { tag: "plain_text", content: "Reject" }, type: "danger", multi_url: multiUrl(rejectUrl) },
  ]});

  await postWebhook(webhookFor(input.approvalGroup), {
    config: { wide_screen_mode: true, enable_forward: true },
    header: { template: "blue", title: { tag: "plain_text", content: `${input.employeeName} — General Approval` }},
    elements,
  });
}

export async function sendOffsetApprovalCard(
  input: OffsetApprovalInput & { recordId: string; requestId: string; reviewToken: string },
) {
  const baseUrl = process.env.APP_PUBLIC_URL;
  if (!baseUrl) throw new Error("Missing APP_PUBLIC_URL");
  const approveUrl = `${baseUrl}/review/offset-approval/${encodeURIComponent(input.recordId)}?token=${encodeURIComponent(input.reviewToken)}&decision=approve`;
  const rejectUrl = `${baseUrl}/review/offset-approval/${encodeURIComponent(input.recordId)}?token=${encodeURIComponent(input.reviewToken)}&decision=reject`;
  const monthlyCountLines = monthlyRequestCountLines(await getMonthlyRequestCounts(input.employeeId, input.submittedAt));

  const elements: any[] = [
    { tag: "div", text: { tag: "lark_md", content:
      `**${input.employeeName}'s Offset Approval**\nEmployee ID: ${input.employeeId}\nDepartment: ${input.department || "—"}\nApproval Group: ${input.approvalGroup}\n` +
      (monthlyCountLines ? `${monthlyCountLines}\n` : "") +
      `**Date Filed: ${filedText(input.submittedAt)}**`
    }},
    { tag: "div", fields: [
      { is_short: true, text: { tag: "lark_md", content: `**Date Worked**\n${dateText(input.dateWorked)}` }},
      { is_short: true, text: { tag: "lark_md", content: `**Work Type**\n${input.workType}` }},
      { is_short: true, text: { tag: "lark_md", content: `**Requested Offset Date**\n${dateText(input.requestedOffsetDate)}` }},
      { is_short: true, text: { tag: "lark_md", content: `**Hours Worked**\n${input.hoursWorked}` }},
    ]},
    { tag: "div", text: { tag: "lark_md", content: `**Reason / Work Details**\n${input.reason}` }},
  ];

  if (input.attachmentImageKey) elements.push({
    tag: "img", img_key: input.attachmentImageKey,
    alt: { tag: "plain_text", content: input.attachmentName || "Offset Approval attachment" },
    compact_width: true, preview: true,
  });
  else if (input.attachmentName) elements.push({
    tag: "div", text: { tag: "lark_md", content: `**Attachment**\n${input.attachmentName}` },
  });

  elements.push({ tag: "action", actions: [
    { tag: "button", text: { tag: "plain_text", content: "Approve" }, type: "primary", multi_url: multiUrl(approveUrl) },
    { tag: "button", text: { tag: "plain_text", content: "Reject" }, type: "danger", multi_url: multiUrl(rejectUrl) },
  ]});

  await postWebhook(webhookFor(input.approvalGroup), {
    config: { wide_screen_mode: true, enable_forward: true },
    header: { template: "blue", title: { tag: "plain_text", content: `${input.employeeName} — Offset Approval` }},
    elements,
  });
}

export function getGeneralApprovalRecord(recordId: string) { return getRecord(generalTableId(), recordId); }
export function getOffsetApprovalRecord(recordId: string) { return getRecord(offsetTableId(), recordId); }

async function updateMasterDecision(tableId: string, input: {
  recordId: string;
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const fieldsInfo = await listFields(tableId);
  const { fields } = writableFields(fieldsInfo, {
    Status: input.decision,
    "Approved At": input.decision === "Approved" ? Date.now() : undefined,
    "Rejection Reason": input.decision === "Rejected" ? input.rejectionReason : undefined,
    "Approval Comment": input.decision === "Approved" ? input.approvalComment : undefined,
  });
  await updateRecord(tableId, input.recordId, fields);
}
export function updateGeneralApprovalDecision(input: {
  recordId: string; decision: "Approved" | "Rejected"; rejectionReason: string; approvalComment: string;
}) { return updateMasterDecision(generalTableId(), input); }
export function updateOffsetApprovalDecision(input: {
  recordId: string; decision: "Approved" | "Rejected"; rejectionReason: string; approvalComment: string;
}) { return updateMasterDecision(offsetTableId(), input); }
export function updateExtraApprovalGroupDecision(input: {
  approvalGroup: string; mainRecordId: string; requestId: string; decision: "Approved" | "Rejected";
  rejectionReason: string; approvalComment: string;
}) { return syncApprovalGroupDecision(input); }

export async function sendExtraApprovalDecisionCard(input: {
  requestType: "General Approval" | "Offset Approval";
  approvalGroup: string;
  employeeName: string;
  requestId: string;
  summaryLines: string[];
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const approved = input.decision === "Approved";
  const detail = approved && input.approvalComment
    ? `\n**Approval Comment**\n${input.approvalComment}`
    : !approved && input.rejectionReason
      ? `\n**Rejection Reason**\n${input.rejectionReason}`
      : "";
  await postWebhook(webhookFor(input.approvalGroup), {
    config: { wide_screen_mode: true, enable_forward: true },
    header: { template: approved ? "green" : "red", title: { tag: "plain_text", content: `${input.requestType} ${input.decision}` }},
    elements: [{ tag: "div", text: { tag: "lark_md", content:
      `**${input.employeeName}**\nRequest ID: ${input.requestId}\n${input.summaryLines.join("\n")}${detail}`
    }}],
  });
}

export type GeneralApprovalHistoryItem = {
  requestId: string;
  requestType: "General Approval";
  title: string;
  detail: string;
  status: string;
  submittedAt: number;
  rejectionReason?: string;
  approvalComment?: string;
};

export async function listEmployeeGeneralApprovalHistory(employeeId: string): Promise<GeneralApprovalHistoryItem[]> {
  const normalized = text(employeeId);
  if (!normalized) return [];
  try {
    const records = await listRecords(generalTableId());
    const results: GeneralApprovalHistoryItem[] = [];
    for (const record of records) {
      const f = record?.fields ?? {};
      if (text(f["Employee ID"]) !== normalized) continue;
      results.push({
        requestId: text(f["General Approval Request ID"]) || text(f["Request ID"]),
        requestType: "General Approval",
        title: text(f["Request Title"]) || "General Approval",
        detail: text(f["Request Category"]) || "General Approval",
        status: text(f["Status"]) || "Pending",
        submittedAt: Number(f["Submitted At"] ?? 0) || 0,
        rejectionReason: text(f["Rejection Reason"]) || undefined,
        approvalComment: text(f["Approval Comment"]) || undefined,
      });
    }
    return results.sort((a, b) => b.submittedAt - a.submittedAt);
  } catch (error) {
    console.error("General Approval history load failed:", error);
    return [];
  }
}

export type OffsetApprovalHistoryItem = {
  requestId: string;
  requestType: "Offset Approval";
  title: string;
  detail: string;
  status: string;
  submittedAt: number;
  dateWorked?: number;
  requestedOffsetDate?: number;
  rejectionReason?: string;
  approvalComment?: string;
};

export async function listEmployeeOffsetApprovalHistory(employeeId: string): Promise<OffsetApprovalHistoryItem[]> {
  const normalized = text(employeeId);
  if (!normalized) return [];
  try {
    const records = await listRecords(offsetTableId());
    const results: OffsetApprovalHistoryItem[] = [];
    for (const record of records) {
      const f = record?.fields ?? {};
      if (text(f["Employee ID"]) !== normalized) continue;
      const hoursWorked = Number(f["Hours Worked"] ?? 0) || 0;
      const workType = text(f["Work Type"]);
      results.push({
        requestId: text(f["Offset Request ID"]) || text(f["Request ID"]),
        requestType: "Offset Approval",
        title: "Offset Approval",
        detail: `${hoursWorked || "—"} hour(s)${workType ? ` • ${workType}` : ""}`,
        status: text(f["Status"]) || "Pending",
        submittedAt: Number(f["Submitted At"] ?? 0) || 0,
        dateWorked: Number(f["Date Worked"] ?? 0) || undefined,
        requestedOffsetDate: Number(f["Requested Offset Date"] ?? 0) || undefined,
        rejectionReason: text(f["Rejection Reason"]) || undefined,
        approvalComment: text(f["Approval Comment"]) || undefined,
      });
    }
    return results.sort((a, b) => b.submittedAt - a.submittedAt);
  } catch (error) {
    console.error("Offset Approval history load failed:", error);
    return [];
  }
}
