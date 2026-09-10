import { getTenantAccessToken } from "@/lib/lark";

type BaseInput = {
  employeeId: string;
  employeeName: string;
  department?: string;
  approvalGroup: string;
  submittedAt: number;
  requestId: string;
  attachmentImageKey?: string;
  attachmentName?: string;
};

type LeaveInput = BaseInput & {
  requestType: "Leave";
  leaveType: string;
  startDate: string;
  endDate: string;
  dayType: "Full Day" | "Partial Day";
  startTime?: string;
  endTime?: string;
  reason: string;
};

type ChangeOffInput = BaseInput & {
  requestType: "Change Day-Off";
  currentOffDate: string;
  requestedNewOffDate: string;
  reason: string;
};

type OvertimeInput = BaseInput & {
  requestType: "Overtime";
  overtimeDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  publicHoliday: "Yes" | "No";
  compensationMethod: string;
  reason: string;
};

type UndertimeInput = BaseInput & {
  requestType: "Undertime";
  undertimeDate: string;
  requestedEarlyTimeOut: string;
  regularTimeOut: string;
  durationHours: number;
  reason: string;
};

export type CentralRequestNotificationInput =
  | LeaveInput
  | ChangeOffInput
  | OvertimeInput
  | UndertimeInput;

function baseAppToken() {
  const value = process.env.LARK_BASE_APP_TOKEN;
  if (!value) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return value;
}

function employeesTableId() {
  const value = process.env.LARK_EMPLOYEES_TABLE_ID;
  if (!value) throw new Error("Missing LARK_EMPLOYEES_TABLE_ID");
  return value;
}

function webhook() {
  const value =
    process.env.LARK_REQUEST_NOTIFICATION_WEBHOOK ||
    process.env.LARK_REQUEST_FEED_WEBHOOK;

  if (!value) {
    throw new Error(
      "Missing LARK_REQUEST_NOTIFICATION_WEBHOOK (or legacy LARK_REQUEST_FEED_WEBHOOK)",
    );
  }

  return value;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function attendanceGroups(value: unknown): string[] {
  const results: string[] = [];

  function collect(item: unknown) {
    if (item === null || item === undefined) return;

    if (typeof item === "string") {
      const cleaned = item.trim();
      if (cleaned) {
        cleaned
          .split(/[,;/|]+/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => results.push(part));
      }
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(collect);
      return;
    }

    if (typeof item === "object") {
      const obj = item as any;
      collect(
        obj.name ??
          obj.text ??
          obj.value ??
          obj.label ??
          obj.option_name ??
          obj.optionName,
      );
    }
  }

  collect(value);
  return Array.from(new Set(results));
}


async function leaveFiledThisMonth(employeeId: string, submittedAt: number) {
  const tableId = process.env.LARK_LEAVE_TABLE_ID;
  if (!tableId) {
    throw new Error("Missing LARK_LEAVE_TABLE_ID");
  }

  const token = await getTenantAccessToken();
  const appToken = baseAppToken();

  const submittedDate = new Date(submittedAt);

  const monthText = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).format(submittedDate);

  let pageToken = "";
  let count = 0;

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
        `Unable to count monthly leave requests: ${data.msg || response.statusText}`,
      );
    }

    for (const item of data.data?.items ?? []) {
      const fields = item?.fields ?? {};

      if (text(fields["Employee ID"]) !== employeeId) {
        continue;
      }

      const submittedValue = Number(fields["Submitted At"] ?? 0);
      if (!submittedValue) {
        continue;
      }

      const recordMonth = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
      }).format(new Date(submittedValue));

      if (recordMonth === monthText) {
        count += 1;
      }
    }

    pageToken = data.data?.has_more
      ? text(data.data?.page_token)
      : "";
  } while (pageToken);

  return count;
}

async function employeeAttendanceGroups(employeeId: string) {
  const token = await getTenantAccessToken();
  const appToken = baseAppToken();
  const tableId = employeesTableId();
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
        `Unable to read employee Attendance Group: ${data.msg || response.statusText}`,
      );
    }

    for (const item of data.data?.items ?? []) {
      const fields = item?.fields ?? {};
      if (text(fields["Employee ID"]) === employeeId) {
        return attendanceGroups(fields["Attendance Group"]);
      }
    }

    pageToken = data.data?.has_more
      ? text(data.data?.page_token)
      : "";
  } while (pageToken);

  return [];
}

function shouldSend(groups: string[], approvalGroup: string) {
  const attendanceMatch = groups.some((group) => {
    const normalized = group.trim().toLowerCase();
    return (
      normalized === "office" ||
      normalized === "warehouse" ||
      normalized.includes("office") ||
      normalized.includes("warehouse")
    );
  });

  if (attendanceMatch) return true;

  // Fallback for Employees tables where Attendance Group is a linked/lookup
  // field and Lark returns record IDs instead of the visible option text.
  // These are the current Office approval groups, plus Warehouse.
  const allowedApprovalGroups = new Set([
    "digital creative",
    "sales",
    "finance",
    "e-commerce",
    "ecommerce",
    "logistics",
    "marketing",
    "hr",
    "creative",
    "hod",
    "purchasing",
    "warehouse",
  ]);

  return allowedApprovalGroups.has(
    approvalGroup.trim().toLowerCase(),
  );
}

function dateText(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function filedText(timestamp: number) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestamp));
}

function timeText(time?: string) {
  if (!time) return "—";
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;

  const d = new Date(Date.UTC(2026, 0, 1, hour, minute));
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function detailText(input: CentralRequestNotificationInput) {
  if (input.requestType === "Leave") {
    const lines = [
      `**Leave Type**\n${input.leaveType}`,
      `**Day Type**\n${input.dayType}`,
      `**Start**\n${dateText(input.startDate)}${
        input.dayType === "Partial Day" && input.startTime
          ? ` ${timeText(input.startTime)}`
          : ""
      }`,
      `**End**\n${dateText(input.endDate)}${
        input.dayType === "Partial Day" && input.endTime
          ? ` ${timeText(input.endTime)}`
          : ""
      }`,
    ];
    return lines;
  }

  if (input.requestType === "Change Day-Off") {
    return [
      `**Current Off-Date**\n${dateText(input.currentOffDate)}`,
      `**Requested New Off-Date**\n${dateText(input.requestedNewOffDate)}`,
    ];
  }

  if (input.requestType === "Overtime") {
    return [
      `**Overtime Date**\n${dateText(input.overtimeDate)}`,
      `**Start Time**\n${timeText(input.startTime)}`,
      `**End Time**\n${timeText(input.endTime)}`,
      `**Duration**\n${input.durationHours} hour${input.durationHours === 1 ? "" : "s"}`,
      `**Public Holiday?**\n${input.publicHoliday}`,
      `**Compensation Method**\n${input.compensationMethod}`,
    ];
  }

  return [
    `**Undertime Date**\n${dateText(input.undertimeDate)}`,
    `**Requested Early Time Out**\n${timeText(input.requestedEarlyTimeOut)}`,
    `**Regular Time Out**\n${timeText(input.regularTimeOut)}`,
    `**Duration**\n${input.durationHours} hour${input.durationHours === 1 ? "" : "s"}`,
  ];
}

export async function sendCentralRequestNotification(
  input: CentralRequestNotificationInput,
) {
  const groups = await employeeAttendanceGroups(input.employeeId);

  if (!shouldSend(groups, input.approvalGroup)) {
    return {
      sent: false as const,
      reason:
        "Employee is not in an Office/Warehouse attendance or approval group.",
    };
  }

  const monthlyLeaveCount =
    input.requestType === "Leave"
      ? await leaveFiledThisMonth(
          input.employeeId,
          input.submittedAt,
        )
      : null;

  const elements: any[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**${input.employeeName}**\n` +
          `Employee ID: ${input.employeeId}\n` +
          `Department: ${input.department || "—"}\n` +
          `Attendance Group: ${groups.join(", ") || "—"}\n` +
          `Approval Group: ${input.approvalGroup}\n` +
          (monthlyLeaveCount !== null
            ? `**Leave Filed This Month: ${monthlyLeaveCount}**\n`
            : "") +
          `**Date Filed: ${filedText(input.submittedAt)}**`,
      },
    },
    {
      tag: "div",
      fields: detailText(input).map((content) => ({
        is_short: true,
        text: { tag: "lark_md", content },
      })),
    },
    { tag: "hr" },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**Reason**\n${input.reason}`,
      },
    },
  ];

  if (input.attachmentImageKey) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**Attachment${input.attachmentName ? ` — ${input.attachmentName}` : ""}**`,
      },
    });

    elements.push({
      tag: "img",
      img_key: input.attachmentImageKey,
      alt: {
        tag: "plain_text",
        content: input.attachmentName || "Request attachment",
      },
      compact_width: true,
      preview: true,
    });
  } else if (input.attachmentName) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**Attachment**\n${input.attachmentName}`,
      },
    });
  }

  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `Request ID: ${input.requestId}`,
      },
    ],
  });

  const response = await fetch(webhook(), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
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
            content: `New ${input.requestType} Request`,
          },
        },
        elements,
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || (data && data.code && data.code !== 0)) {
    throw new Error(
      `Approvals Notifications webhook error: ${data?.msg || response.statusText}`,
    );
  }

  return { sent: true as const };
}
