import { getTenantAccessToken } from "@/lib/lark";
import { getMonthlyRequestCounts, monthlyRequestCountLines } from "@/lib/monthly-request-counts";

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

type GeneralApprovalInput = BaseInput & {
  requestType: "General Approval";
  requestCategory: string;
  requestTitle: string;
  requestDetails: string;
  amountBudget?: number;
  reason: string;
};

type OffsetApprovalInput = BaseInput & {
  requestType: "Offset Approval";
  dateWorked: string;
  workType: string;
  requestedOffsetDate: string;
  hoursWorked: number;
  reason: string;
};

export type CentralRequestNotificationInput =
  | LeaveInput
  | ChangeOffInput
  | OvertimeInput
  | UndertimeInput
  | GeneralApprovalInput
  | OffsetApprovalInput;

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

type AttachmentLookupConfig = {
  tableId?: string;
  source:
    | "leave"
    | "change-off"
    | "overtime"
    | "undertime"
    | "general-approval"
    | "offset-approval";
  requestIdFields: string[];
};

function attachmentLookupConfig(
  requestType: CentralRequestNotificationInput["requestType"],
): AttachmentLookupConfig {
  if (requestType === "Leave") {
    return {
      tableId: process.env.LARK_LEAVE_TABLE_ID,
      source: "leave",
      requestIdFields: [
        "Leave Request ID",
        "Request ID",
      ],
    };
  }

  if (requestType === "Change Day-Off") {
    return {
      tableId: process.env.LARK_CHANGE_OFF_TABLE_ID,
      source: "change-off",
      requestIdFields: [
        "Change Off Request ID",
        "Request ID",
      ],
    };
  }

  if (requestType === "Overtime") {
    return {
      tableId: process.env.LARK_OVERTIME_TABLE_ID,
      source: "overtime",
      requestIdFields: [
        "Overtime Request ID",
        "Request ID",
      ],
    };
  }

  if (requestType === "Undertime") {
    return {
      tableId: process.env.LARK_UNDERTIME_TABLE_ID,
      source: "undertime",
      requestIdFields: [
        "Undertime Request ID",
        "Request ID",
      ],
    };
  }

  if (requestType === "General Approval") {
    return {
      tableId: process.env.LARK_GENERAL_APPROVAL_TABLE_ID,
      source: "general-approval",
      requestIdFields: [
        "General Approval Request ID",
        "Request ID",
      ],
    };
  }

  return {
    tableId: process.env.LARK_OFFSET_APPROVAL_TABLE_ID,
    source: "offset-approval",
    requestIdFields: [
      "Offset Request ID",
      "Request ID",
    ],
  };
}

function firstAttachmentToken(value: unknown) {
  if (!Array.isArray(value)) return "";

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const token = text(
      (item as any).file_token ??
        (item as any).fileToken ??
        (item as any).token,
    );

    if (token) return token;
  }

  return "";
}

async function resolveCentralAttachmentUrl(
  input: CentralRequestNotificationInput,
) {
  if (!input.attachmentName) return "";

  const baseUrl = process.env.APP_PUBLIC_URL;
  if (!baseUrl) return "";

  const config =
    attachmentLookupConfig(
      input.requestType,
    );

  if (!config.tableId) return "";

  const token =
    await getTenantAccessToken();

  let pageToken = "";

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${config.tableId}/records`,
    );

    url.searchParams.set(
      "page_size",
      "500",
    );

    if (pageToken) {
      url.searchParams.set(
        "page_token",
        pageToken,
      );
    }

    const response =
      await fetch(url, {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
        cache: "no-store",
      });

    const data =
      await response.json();

    if (
      !response.ok ||
      data.code !== 0
    ) {
      console.error(
        "Unable to resolve centralized request attachment:",
        data.msg ||
          response.statusText,
      );
      return "";
    }

    for (
      const record of
        data.data?.items ?? []
    ) {
      const fields =
        record?.fields ?? {};

      const matchesRequest =
        config.requestIdFields.some(
          (fieldName) =>
            text(
              fields[fieldName],
            ) ===
            input.requestId,
        );

      if (!matchesRequest) {
        continue;
      }

      const fileToken =
        firstAttachmentToken(
          fields["Attachment"],
        );

      const recordId =
        text(record?.record_id);

      if (
        !fileToken ||
        !recordId
      ) {
        return "";
      }

      return (
        `${baseUrl}/api/attachment/${encodeURIComponent(fileToken)}` +
        `?source=${encodeURIComponent(config.source)}` +
        `&recordId=${encodeURIComponent(recordId)}` +
        `&name=${encodeURIComponent(input.attachmentName)}`
      );
    }

    pageToken =
      data.data?.has_more
        ? text(
            data.data?.page_token,
          )
        : "";
  } while (pageToken);

  return "";
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

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return time;
  }

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
    return [
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

  if (input.requestType === "Undertime") {
    return [
      `**Undertime Date**\n${dateText(input.undertimeDate)}`,
      `**Requested Early Time Out**\n${timeText(input.requestedEarlyTimeOut)}`,
      `**Regular Time Out**\n${timeText(input.regularTimeOut)}`,
      `**Duration**\n${input.durationHours} hour${input.durationHours === 1 ? "" : "s"}`,
    ];
  }

  if (input.requestType === "General Approval") {
    return [
      `**Category**\n${input.requestCategory}`,
      `**Request Title**\n${input.requestTitle}`,
      ...(input.amountBudget && input.amountBudget > 0
        ? [
            `**Amount / Budget**\n₱${input.amountBudget.toLocaleString(
              "en-PH",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}`,
          ]
        : []),
    ];
  }

  return [
    `**Date Worked**\n${dateText(input.dateWorked)}`,
    `**Work Type**\n${input.workType}`,
    `**Requested Offset Date**\n${dateText(input.requestedOffsetDate)}`,
    `**Hours Worked**\n${input.hoursWorked}`,
  ];
}

function reasonHeading(input: CentralRequestNotificationInput) {
  return input.requestType === "General Approval"
    ? "Request Details"
    : input.requestType === "Offset Approval"
      ? "Reason / Work Details"
      : "Reason";
}

function attachmentLabel(
  input: CentralRequestNotificationInput,
  attachmentUrl: string,
) {
  if (!input.attachmentName) return "";

  if (attachmentUrl) {
    return `[📎 ${input.attachmentName}](${attachmentUrl})`;
  }

  return input.attachmentName;
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

  const monthlyCounts =
    await getMonthlyRequestCounts(
      input.employeeId,
      input.submittedAt,
    );
  const monthlyCountLines =
    monthlyRequestCountLines(monthlyCounts);

  const attachmentUrl =
    await resolveCentralAttachmentUrl(
      input,
    );

  const elements: any[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**${input.employeeName}**\n` +
          `Employee ID: ${input.employeeId}\n` +
          `Department: ${input.department || "—"}\n` +
          `Approval Group: ${input.approvalGroup}\n` +
          (monthlyCountLines
            ? `${monthlyCountLines}\n`
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
        content: `**${reasonHeading(input)}**\n${input.reason}`,
      },
    },
  ];

  if (input.attachmentImageKey) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**Attachment**\n` +
          attachmentLabel(input, attachmentUrl),
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
        content:
          `**Attachment**\n` +
          attachmentLabel(input, attachmentUrl),
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
    headers: {
      "Content-Type": "application/json; charset=utf-8",
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
            content: `${input.employeeName} — ${input.requestType} Request`,
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
