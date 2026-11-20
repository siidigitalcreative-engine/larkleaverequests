import { extractApprovalAttachments } from "@/lib/approval-attachments";
import {
  getChangeOffRecord,
  getLeaveRecord,
} from "@/lib/lark";
import { getOvertimeRecord } from "@/lib/overtime";
import { getUndertimeRecord } from "@/lib/undertime";
import {
  getGeneralApprovalRecord,
  getOffsetApprovalRecord,
} from "@/lib/general-offset-approvals";

export type RequestViewType =
  | "leave"
  | "change-day-off"
  | "overtime"
  | "undertime"
  | "general-approval"
  | "offset-approval";

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

function dateTimeText(value: unknown) {
  const n = numberValue(value);
  if (!n) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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

function moneyText(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function durationHours(start: number, end: number, fallback: unknown) {
  if (start > 0 && end > start) {
    return Math.round(((end - start) / 3_600_000) * 100) / 100;
  }
  const n = Number(fallback ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function row(label: string, value: unknown) {
  return {
    label,
    value: text(value) || "—",
  };
}

async function recordFor(type: RequestViewType, recordId: string) {
  if (type === "leave") return getLeaveRecord(recordId);
  if (type === "change-day-off") return getChangeOffRecord(recordId);
  if (type === "overtime") return getOvertimeRecord(recordId);
  if (type === "undertime") return getUndertimeRecord(recordId);
  if (type === "general-approval") return getGeneralApprovalRecord(recordId);
  return getOffsetApprovalRecord(recordId);
}

export function isRequestViewType(value: string): value is RequestViewType {
  return [
    "leave",
    "change-day-off",
    "overtime",
    "undertime",
    "general-approval",
    "offset-approval",
  ].includes(value);
}

export async function getRequestView(type: RequestViewType, recordId: string) {
  const record = await recordFor(type, recordId);
  const f = record?.fields ?? {};

  const common = {
    recordId,
    requestType: type,
    employeeName: text(f["Employee Name"]) || "Employee",
    employeeId: text(f["Employee ID"]),
    department: text(f["Department"]),
    approvalGroup: text(f["Approval Group"]),
    status: text(f["Status"]) || "Pending",
    submittedAt: numberValue(f["Submitted At"]),
    submittedAtText: dateTimeText(f["Submitted At"]),
    approvalComment: text(f["Approval Comment"]),
    rejectionReason: text(f["Rejection Reason"]),
    comments: text(f["Comments"]),
    attachments: extractApprovalAttachments(f["Attachment"]),
  };

  if (type === "leave") {
    return {
      ...common,
      source: "leave",
      requestId: text(f["Leave Request ID"]) || text(f["Request ID"]),
      title: text(f["Leave Type"]) || "Leave Request",
      details: [
        row("Leave Type", f["Leave Type"]),
        row("Day Type", f["Day Type"]),
        row("Start Date", dateText(f["Start Date"])),
        row("End Date", dateText(f["End Date"])),
        ...(numberValue(f["Start Time"])
          ? [row("Start Time", timeText(f["Start Time"]))]
          : []),
        ...(numberValue(f["End Time"])
          ? [row("End Time", timeText(f["End Time"]))]
          : []),
      ],
      descriptionLabel: "Reason for Leave",
      description: text(f["Reason"]),
    };
  }

  if (type === "change-day-off") {
    return {
      ...common,
      source: "change-off",
      requestId: text(f["Change Off Request ID"]) || text(f["Request ID"]),
      title: "Change Day-Off",
      details: [
        row("Current Off-Date", dateText(f["Current Off-Date"])),
        row("Requested New Off-Date", dateText(f["Requested New Off-Date"])),
      ],
      descriptionLabel: "Reason for Change",
      description: text(f["Reason"]),
    };
  }

  if (type === "overtime") {
    const start = numberValue(f["Start Time"]);
    const end = numberValue(f["End Time"]);
    const hours = durationHours(start, end, f["Duration (Hours)"]);

    return {
      ...common,
      source: "overtime",
      requestId: text(f["Overtime Request ID"]) || text(f["Request ID"]),
      title: "Overtime",
      details: [
        row("Overtime Date", dateText(f["Overtime Date"])),
        row("Start Time", timeText(start)),
        row("End Time", timeText(end)),
        row("Duration", `${hours || "—"} hour(s)`),
        row("Compensation Method", f["Compensation Method"]),
        ...(text(f["Public Holiday?"])
          ? [row("Public Holiday?", f["Public Holiday?"])]
          : []),
      ],
      descriptionLabel: "Reason",
      description: text(f["Reason"]),
    };
  }

  if (type === "undertime") {
    const requested = numberValue(f["Requested Early Time Out"]);
    const regular = numberValue(f["Regular Time Out"]);
    const hours = durationHours(requested, regular, f["Duration (Hours)"]);

    return {
      ...common,
      source: "undertime",
      requestId: text(f["Undertime Request ID"]) || text(f["Request ID"]),
      title: "Undertime",
      details: [
        row("Undertime Date", dateText(f["Undertime Date"])),
        row("Requested Early Time Out", timeText(requested)),
        row("Regular Time Out", timeText(regular)),
        row("Duration", `${hours || "—"} hour(s)`),
      ],
      descriptionLabel: "Reason",
      description: text(f["Reason"]),
    };
  }

  if (type === "general-approval") {
    return {
      ...common,
      source: "general-approval",
      requestId:
        text(f["General Approval Request ID"]) || text(f["Request ID"]),
      title: text(f["Request Title"]) || "General Approval",
      details: [
        row("Request Category", f["Request Category"]),
        ...(Number(f["Amount/Budget"] ?? 0) > 0
          ? [row("Amount / Budget", moneyText(f["Amount/Budget"]))]
          : []),
      ],
      descriptionLabel: "Request Details",
      description: text(f["Request Details"]),
    };
  }

  return {
    ...common,
    source: "offset-approval",
    requestId: text(f["Offset Request ID"]) || text(f["Request ID"]),
    title: "Offset Approval",
    details: [
      row("Date Worked", dateText(f["Date Worked"])),
      row("Work Type", f["Work Type"]),
      row("Requested Offset Date", dateText(f["Requested Offset Date"])),
      row("Hours Worked", `${Number(f["Hours Worked"] ?? 0) || "—"}`),
    ],
    descriptionLabel: "Reason / Work Details",
    description: text(f["Reason / Work Details"]),
  };
}
