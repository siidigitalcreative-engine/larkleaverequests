type LeaveCardInput = {
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
  submittedAt: number;
  recordId: string;
  requestId: string;
  reviewToken: string;
  attachmentImageKey?: string;
  attachmentName?: string;
};

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
  if (!time) return "";

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

export async function sendLeaveApprovalCardEnhanced(
  input: LeaveCardInput,
) {
  const baseUrl = process.env.APP_PUBLIC_URL;

  if (!baseUrl) {
    throw new Error("Missing APP_PUBLIC_URL");
  }

  const approveUrl =
    `${baseUrl}/review/${encodeURIComponent(input.recordId)}` +
    `?token=${encodeURIComponent(input.reviewToken)}` +
    `&decision=approve`;

  const rejectUrl =
    `${baseUrl}/review/${encodeURIComponent(input.recordId)}` +
    `?token=${encodeURIComponent(input.reviewToken)}` +
    `&decision=reject`;

  const start =
    input.dayType === "Partial Day" && input.startTime
      ? `${dateText(input.startDate)} ${timeText(input.startTime)}`
      : dateText(input.startDate);

  const end =
    input.dayType === "Partial Day" && input.endTime
      ? `${dateText(input.endDate)} ${timeText(input.endTime)}`
      : dateText(input.endDate);

  const elements: any[] = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**${input.employeeName}'s Leave**\n` +
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
            content: `**Leave Type**\n${input.leaveType}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content: `**Day Type**\n${input.dayType}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content: `**Start**\n${start}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content: `**End**\n${end}`,
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
        content: `**Reason for leave**\n${input.reason}`,
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
        content: input.attachmentName || "Leave attachment",
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

  const response = await fetch(webhookFor(input.approvalGroup), {
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
            content: `${input.employeeName} — Leave Request`,
          },
        },
        elements,
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

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
