import { getTenantAccessToken } from "@/lib/lark";

export type MonthlyRequestCounts = {
  leave: number;
  overtime: number;
  undertime: number;
  changeDayOff: number;
};

function appToken() {
  const value = process.env.LARK_BASE_APP_TOKEN;
  if (!value) throw new Error("Missing LARK_BASE_APP_TOKEN");
  return value;
}

function monthKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(timestamp));
}

async function countInTable(
  tableId: string | undefined,
  employeeId: string,
  submittedAt: number,
) {
  if (!tableId) return 0;

  const token = await getTenantAccessToken();
  const targetMonth = monthKey(submittedAt);
  let pageToken = "";
  let count = 0;

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${appToken()}/tables/${tableId}/records`,
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
        `Unable to count monthly requests: ${
          data.msg || response.statusText
        }`,
      );
    }

    for (const item of data.data?.items ?? []) {
      const fields = item?.fields ?? {};

      if (
        String(fields["Employee ID"] ?? "").trim() !==
        employeeId
      ) {
        continue;
      }

      const filedAt = Number(fields["Submitted At"] ?? 0);
      if (!filedAt) continue;

      if (monthKey(filedAt) === targetMonth) {
        count += 1;
      }
    }

    pageToken = data.data?.has_more
      ? String(data.data?.page_token ?? "")
      : "";
  } while (pageToken);

  return count;
}

export async function getMonthlyRequestCounts(
  employeeId: string,
  submittedAt: number,
): Promise<MonthlyRequestCounts> {
  const [leave, overtime, undertime, changeDayOff] =
    await Promise.all([
      countInTable(
        process.env.LARK_LEAVE_TABLE_ID,
        employeeId,
        submittedAt,
      ),
      countInTable(
        process.env.LARK_OVERTIME_TABLE_ID,
        employeeId,
        submittedAt,
      ),
      countInTable(
        process.env.LARK_UNDERTIME_TABLE_ID,
        employeeId,
        submittedAt,
      ),
      countInTable(
        process.env.LARK_CHANGE_OFF_TABLE_ID,
        employeeId,
        submittedAt,
      ),
    ]);

  return {
    leave,
    overtime,
    undertime,
    changeDayOff,
  };
}

export function monthlyRequestCountLines(
  counts: MonthlyRequestCounts,
) {
  return [
    counts.leave > 0
      ? `**Leave Filed This Month: ${counts.leave}**`
      : "",
    counts.overtime > 0
      ? `**Overtime Filed This Month: ${counts.overtime}**`
      : "",
    counts.undertime > 0
      ? `**Undertime Filed This Month: ${counts.undertime}**`
      : "",
    counts.changeDayOff > 0
      ? `**Change Day-Off Filed This Month: ${counts.changeDayOff}**`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
