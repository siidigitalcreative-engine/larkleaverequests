function webhookFor(group: string) {
  const key = group.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const value = process.env[`LARK_APPROVAL_WEBHOOK_${key}`] || process.env[`LARK_LEAVE_WEBHOOK_${key}`];
  if (!value) throw new Error(`Missing approval webhook for group: ${group}`);
  return value;
}

async function postWebhook(group: string, card: Record<string, unknown>) {
  const response = await fetch(webhookFor(group), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ msg_type: "interactive", card }),
    cache: "no-store",
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Approval decision webhook error: ${response.status} ${responseText}`);
  try {
    const data = JSON.parse(responseText) as { code?: number; msg?: string };
    if (typeof data.code === "number" && data.code !== 0) {
      throw new Error(`Approval decision webhook error: ${data.msg || data.code}`);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
}

function filedText(value: number) {
  if (!value) return "—";
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

function dateText(value: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function timeText(value: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export async function sendLeaveDecisionCardEnhanced(input: {
  approvalGroup: string;
  employeeName: string;
  requestId: string;
  leaveType: string;
  startDate?: string;
  endDate?: string;
  submittedAt: number;
  decision: "Approved" | "Rejected";
  rejectionReason?: string;
  approvalComment?: string;
}) {
  const approved = input.decision === "Approved";
  const content =
    `**${input.employeeName}'s Leave**\n` +
    `Leave Type: ${input.leaveType}\n` +
    (input.startDate && input.endDate
      ? `Date: ${input.startDate}${input.startDate !== input.endDate ? ` to ${input.endDate}` : ""}\n`
      : "") +
    `Date Filed: **${filedText(input.submittedAt)}**\n` +
    `Status: **${input.decision}**` +
    (approved && input.approvalComment ? `\nApproval Comment: ${input.approvalComment}` : "") +
    (!approved && input.rejectionReason ? `\nRejection Reason: ${input.rejectionReason}` : "");

  await postWebhook(input.approvalGroup, {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      template: approved ? "green" : "red",
      title: { tag: "plain_text", content: `${input.employeeName} — Leave ${input.decision}` },
    },
    elements: [
      { tag: "div", text: { tag: "lark_md", content } },
      { tag: "note", elements: [{ tag: "plain_text", content: `Request ${input.requestId} • ${input.decision}` }] },
    ],
  });
}

export async function sendChangeOffDecisionCardEnhanced(input: {
  approvalGroup: string;
  employeeName: string;
  requestId: string;
  currentOffDate: string;
  requestedNewOffDate: string;
  submittedAt: number;
  decision: "Approved" | "Rejected";
  rejectionReason?: string;
  approvalComment?: string;
}) {
  const approved = input.decision === "Approved";
  const content =
    `**${input.employeeName}'s Change Day-Off Request**\n` +
    `Current Off-Date: ${input.currentOffDate}\n` +
    `Requested New Off-Date: ${input.requestedNewOffDate}\n` +
    `Date Filed: **${filedText(input.submittedAt)}**\n` +
    `Status: **${input.decision}**` +
    (approved && input.approvalComment ? `\nApproval Comment: ${input.approvalComment}` : "") +
    (!approved && input.rejectionReason ? `\nRejection Reason: ${input.rejectionReason}` : "");

  await postWebhook(input.approvalGroup, {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      template: approved ? "green" : "red",
      title: { tag: "plain_text", content: `${input.employeeName} — Change Day-Off ${input.decision}` },
    },
    elements: [
      { tag: "div", text: { tag: "lark_md", content } },
      { tag: "note", elements: [{ tag: "plain_text", content: `Request ${input.requestId} • ${input.decision}` }] },
    ],
  });
}

export async function sendOvertimeDecisionCardEnhanced(input: {
  approvalGroup: string;
  employeeName: string;
  requestId: string;
  overtimeDate: number;
  startTime: number;
  endTime: number;
  durationHours: number;
  compensationMethod: string;
  submittedAt: number;
  decision: "Approved" | "Rejected";
  rejectionReason: string;
  approvalComment: string;
}) {
  const approved = input.decision === "Approved";
  const detail = approved && input.approvalComment
    ? `\nApproval Comment: ${input.approvalComment}`
    : !approved && input.rejectionReason
      ? `\nRejection Reason: ${input.rejectionReason}`
      : "";

  const content =
    `**${input.employeeName}'s Overtime**\n` +
    `Overtime Date: ${dateText(input.overtimeDate)}\n` +
    `Time: ${timeText(input.startTime)} – ${timeText(input.endTime)}\n` +
    `Duration: ${input.durationHours} hour(s)\n` +
    `Compensation: ${input.compensationMethod}\n` +
    `Date Filed: **${filedText(input.submittedAt)}**\n` +
    `Status: **${input.decision}**` + detail;

  await postWebhook(input.approvalGroup, {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      template: approved ? "green" : "red",
      title: { tag: "plain_text", content: `${input.employeeName} — Overtime ${input.decision}` },
    },
    elements: [
      { tag: "div", text: { tag: "lark_md", content } },
      { tag: "note", elements: [{ tag: "plain_text", content: `Request ${input.requestId} • ${input.decision}` }] },
    ],
  });
}
