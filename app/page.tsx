"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Employee = {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveApprovalGroup: string;
};

type PublicEmployee = {
  employeeName: string;
  department: string;
};

type NotifyContact = {
  name: string;
};

type RequestType = "leave" | "changeOff" | "history";


type ApprovalHistoryItem = {
  requestId: string;
  requestType: "Leave Request" | "Change Day-Off";
  title: string;
  detail: string;
  status: string;
  submittedAt: number;
  startDate?: number;
  endDate?: number;
  currentOffDate?: number;
  requestedNewOffDate?: number;
  rejectionReason?: string;
};

type HistoryFilter = "All" | "Pending" | "Approved" | "Rejected";

function mobileDisplay(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);

  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 10),
  ]
    .filter(Boolean)
    .join(" ");
}

function ymdLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentWeekBounds() {
  const today = new Date();
  const day = today.getDay();
  const daysSinceMonday = (day + 6) % 7;

  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: ymdLocal(monday),
    end: ymdLocal(sunday),
  };
}


function historyDate(value?: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [contacts, setContacts] = useState<NotifyContact[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);

  const [employeeName, setEmployeeName] = useState("");
  const [mobile, setMobile] = useState("");

  const [requestType, setRequestType] = useState<RequestType | null>(
    null,
  );

  // Leave
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayType, setDayType] = useState<
    "Full Day" | "Partial Day"
  >("Full Day");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [notify, setNotify] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);

  // Change Day-Off
  const [currentOffDate, setCurrentOffDate] = useState("");
  const [requestedNewOffDate, setRequestedNewOffDate] = useState("");
  const [changeOffReason, setChangeOffReason] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<
    "normal" | "error" | "success"
  >("normal");
  const [submittedId, setSubmittedId] = useState("");
  const [submittedType, setSubmittedType] =
    useState<RequestType | null>(null);

  const [historyItems, setHistoryItems] = useState<
    ApprovalHistoryItem[]
  >([]);
  const [historyFilter, setHistoryFilter] =
    useState<HistoryFilter>("All");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const week = useMemo(() => currentWeekBounds(), []);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
      fetch("/api/employees", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
      fetch("/api/notify-contacts", { cache: "no-store" }).then(
        (r) => r.json(),
      ),
      fetch("/api/leave-options", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
    ])
      .then(
        ([
          session,
          employeeData,
          contactData,
          leaveOptionsData,
        ]) => {
          if (session.authenticated) {
            setEmployee(session.employee);
          }

          setEmployees(employeeData.employees || []);
          setContacts(contactData.contacts || []);

          const options = Array.isArray(
            leaveOptionsData.leaveTypes,
          )
            ? leaveOptionsData.leaveTypes.filter(
                (value: unknown): value is string =>
                  typeof value === "string" &&
                  value.trim().length > 0,
              )
            : [];

          setLeaveTypes(options);
          setLeaveType((current) =>
            current && options.includes(current)
              ? current
              : options[0] || "",
          );
        },
      )
      .finally(() => setLoading(false));
  }, []);

  const filteredEmployees = useMemo(() => {
    const query = employeeName.trim().toLowerCase();

    if (!query) return [];

    return employees
      .filter((item) =>
        item.employeeName.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [employeeName, employees]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "All") return historyItems;

    return historyItems.filter(
      (item) => item.status === historyFilter,
    );
  }, [historyFilter, historyItems]);

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await fetch("/api/approval-history", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load approval history.",
        );
      }

      setHistoryItems(
        Array.isArray(data.items) ? data.items : [],
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Unable to load approval history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName,
          mobileNumber: `+63${mobile.replace(/\D/g, "")}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed.");
      }

      setEmployee(data.employee);
      setStatus("");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Verification failed.",
      );
      setStatusKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });

    setEmployee(null);
    setEmployeeName("");
    setMobile("");
    setRequestType(null);
    setSubmittedId("");
    setSubmittedType(null);
    setHistoryItems([]);
    setHistoryFilter("All");
    setHistoryError("");
    setStatus("");
  }

  function resetForAnotherRequest() {
    setSubmittedId("");
    setSubmittedType(null);
    setRequestType(null);
    setStatus("");

    setLeaveReason("");
    setNotify([]);
    setAttachment(null);

    setCurrentOffDate("");
    setRequestedNewOffDate("");
    setChangeOffReason("");
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      if (!leaveType) {
        throw new Error(
          "No Leave Type options are currently available in Lark Base.",
        );
      }

      const form = new FormData();

      form.set("leaveType", leaveType);
      form.set("startDate", startDate);
      form.set("endDate", endDate);
      form.set("dayType", dayType);
      form.set("reason", leaveReason);

      if (dayType === "Partial Day") {
        form.set("startTime", startTime);
        form.set("endTime", endTime);
      }

      notify.forEach((name) => form.append("notify", name));

      if (attachment) {
        form.set("attachment", attachment);
      }

      const response = await fetch("/api/leave", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to submit leave request.",
        );
      }

      setSubmittedId(data.requestId);
      setSubmittedType("leave");
      setStatus("Leave request submitted for approval.");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to submit leave request.",
      );
      setStatusKind("error");
    } finally {
      setBusy(false);
    }
  }

  async function submitChangeOff(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      if (
        requestedNewOffDate < week.start ||
        requestedNewOffDate > week.end
      ) {
        throw new Error(
          `Requested New Off-Date must be within this week (${week.start} to ${week.end}).`,
        );
      }

      const response = await fetch("/api/change-day-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentOffDate,
          requestedNewOffDate,
          reason: changeOffReason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to submit Change Day-Off request.",
        );
      }

      setSubmittedId(data.requestId);
      setSubmittedType("changeOff");
      setStatus("Change Day-Off request submitted for approval.");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to submit Change Day-Off request.",
      );
      setStatusKind("error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="wrap">
          <div className="card">Loading Approvals…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="wrap">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <h1>Approvals</h1>
            <p>Submit and track employee requests for approval.</p>
          </div>
        </div>

        {!employee ? (
          <div className="card">
            <h2 className="sectionTitle">Verify your identity</h2>
            <p className="muted">
              Use your employee record and registered mobile number.
            </p>

            <form onSubmit={verify}>
              <label className="field">
                <span className="label">Employee Name</span>
                <input
                  className="input"
                  value={employeeName}
                  onChange={(event) =>
                    setEmployeeName(event.target.value)
                  }
                  placeholder="Search your name"
                  required
                />
              </label>

              {filteredEmployees.length > 0 && (
                <div className="checklist">
                  {filteredEmployees.map((item) => (
                    <button
                      key={item.employeeName}
                      type="button"
                      className="check"
                      onClick={() =>
                        setEmployeeName(item.employeeName)
                      }
                      style={{
                        textAlign: "left",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div>
                        <strong>{item.employeeName}</strong>
                        <div className="small">
                          {item.department || "Employee"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <label className="field">
                <span className="label">
                  Registered Mobile Number
                </span>

                <div
                  className="row"
                  style={{
                    alignItems: "stretch",
                    flexWrap: "nowrap",
                  }}
                >
                  <div
                    className="input"
                    style={{
                      width: 70,
                      background: "#f8fafc",
                      color: "#475467",
                    }}
                  >
                    +63
                  </div>

                  <input
                    className="input"
                    value={mobileDisplay(mobile)}
                    onChange={(event) =>
                      setMobile(
                        event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10),
                      )
                    }
                    placeholder="917 123 4567"
                    inputMode="numeric"
                    required
                  />
                </div>
              </label>

              <button
                className="btn btnPrimary"
                disabled={busy}
                style={{ width: "100%", marginTop: 18 }}
              >
                {busy ? "Verifying…" : "Continue"}
              </button>
            </form>

            {status && (
              <div
                className={`status ${
                  statusKind === "error"
                    ? "error"
                    : statusKind === "success"
                      ? "success"
                      : ""
                }`}
              >
                {status}
              </div>
            )}
          </div>
        ) : submittedId ? (
          <div className="card successPanel">
            <div className="successIcon">✓</div>

            <h2 className="sectionTitle">
              {submittedType === "changeOff"
                ? "Change Day-Off request submitted"
                : "Leave request submitted"}
            </h2>

            <p className="muted">
              Your request has been sent to the{" "}
              <strong>{employee.leaveApprovalGroup}</strong>{" "}
              approval group.
            </p>

            <div
              className="status success"
              style={{
                margin: "18px auto",
                maxWidth: 440,
              }}
            >
              Request ID: <strong>{submittedId}</strong>
            </div>

            {status && <div className="status">{status}</div>}

            <div
              className="row"
              style={{
                justifyContent: "center",
                marginTop: 18,
              }}
            >
              <button
                className="btn btnPrimary"
                onClick={resetForAnotherRequest}
              >
                File another request
              </button>

              <button
                className="btn btnGhost"
                onClick={logout}
              >
                Change employee
              </button>
            </div>
          </div>
        ) : !requestType ? (
          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  What would you like to request?
                </h2>
                <p className="muted">
                  Choose a request type below. Your approval group
                  is taken automatically from your employee record.
                </p>
              </div>
            </div>

            <div className="employeeBox">
              <div className="between">
                <div>
                  <strong>{employee.employeeName}</strong>
                  <div className="small">
                    {employee.employeeId} •{" "}
                    {employee.department || "Employee"}
                  </div>
                </div>

                <button
                  className="btn btnGhost"
                  type="button"
                  onClick={logout}
                >
                  Not you?
                </button>
              </div>

              <div
                className="small"
                style={{ marginTop: 10 }}
              >
                Approval Group:{" "}
                <strong>{employee.leaveApprovalGroup}</strong>
              </div>
            </div>

            <div
              className="grid"
              style={{ marginTop: 18 }}
            >
              <button
                className="btn btnGhost"
                type="button"
                onClick={() => setRequestType("leave")}
                style={{
                  minHeight: 110,
                  textAlign: "left",
                  padding: 20,
                }}
              >
                <span>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 18,
                      marginBottom: 6,
                    }}
                  >
                    Leave Request
                  </strong>
                  <span className="small">
                    File vacation, sick, emergency, and other
                    available leave types.
                  </span>
                </span>
              </button>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() =>
                  setRequestType("changeOff")
                }
                style={{
                  minHeight: 110,
                  textAlign: "left",
                  padding: 20,
                }}
              >
                <span>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 18,
                      marginBottom: 6,
                    }}
                  >
                    Change Day-Off
                  </strong>
                  <span className="small">
                    Request a different off-date for the current
                    week.
                  </span>
                </span>
              </button>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  setRequestType("history");
                  setHistoryFilter("All");
                  void loadHistory();
                }}
                style={{
                  minHeight: 110,
                  textAlign: "left",
                  padding: 20,
                }}
              >
                <span>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 18,
                      marginBottom: 6,
                    }}
                  >
                    My Approval History
                  </strong>
                  <span className="small">
                    View your previously filed requests and their
                    current approval status.
                  </span>
                </span>
              </button>
            </div>
          </div>
        ) : requestType === "history" ? (
          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  My Approval History
                </h2>
                <p className="muted">
                  Only requests filed under your Employee ID are
                  shown here.
                </p>
              </div>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  setRequestType(null);
                  setHistoryError("");
                }}
              >
                Back
              </button>
            </div>

            <div className="employeeBox">
              <strong>{employee.employeeName}</strong>
              <div className="small">
                {employee.employeeId} •{" "}
                {employee.department || "Employee"}
              </div>
            </div>

            <div
              className="row"
              style={{
                marginTop: 18,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {(
                [
                  "All",
                  "Pending",
                  "Approved",
                  "Rejected",
                ] as HistoryFilter[]
              ).map((filter) => (
                <button
                  key={filter}
                  className={`btn ${
                    historyFilter === filter
                      ? "btnPrimary"
                      : "btnGhost"
                  }`}
                  type="button"
                  onClick={() => setHistoryFilter(filter)}
                >
                  {filter}
                </button>
              ))}

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => void loadHistory()}
                disabled={historyLoading}
              >
                {historyLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="divider" />

            {historyLoading && historyItems.length === 0 ? (
              <div className="muted">
                Loading your approval history…
              </div>
            ) : historyError ? (
              <div className="status error">{historyError}</div>
            ) : filteredHistory.length === 0 ? (
              <div className="muted">
                No {historyFilter === "All"
                  ? ""
                  : historyFilter.toLowerCase() + " "}
                requests found.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 12,
                }}
              >
                {filteredHistory.map((item) => (
                  <div
                    key={`${item.requestType}-${item.requestId}`}
                    className="employeeBox"
                    style={{ margin: 0 }}
                  >
                    <div className="between">
                      <div>
                        <strong>{item.title}</strong>
                        <div
                          className="small"
                          style={{ marginTop: 4 }}
                        >
                          {item.requestType}
                        </div>
                      </div>

                      <span
                        className={`pill ${item.status.toLowerCase()}`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div
                      className="small"
                      style={{ marginTop: 12 }}
                    >
                      {item.requestType === "Leave Request" ? (
                        <>
                          {historyDate(item.startDate)} →{" "}
                          {historyDate(item.endDate)}
                        </>
                      ) : (
                        <>
                          {historyDate(item.currentOffDate)} →{" "}
                          {historyDate(
                            item.requestedNewOffDate,
                          )}
                        </>
                      )}
                    </div>

                    <div
                      className="small"
                      style={{ marginTop: 6 }}
                    >
                      Filed: {historyDate(item.submittedAt)}
                    </div>

                    <div
                      className="small"
                      style={{ marginTop: 6 }}
                    >
                      Request ID:{" "}
                      <strong>
                        {item.requestId || "—"}
                      </strong>
                    </div>

                    {item.status === "Rejected" &&
                      item.rejectionReason && (
                        <div
                          className="status error"
                          style={{ marginTop: 12 }}
                        >
                          Rejection Reason:{" "}
                          {item.rejectionReason}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : requestType === "leave" ? (
          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  New Leave Request
                </h2>
                <p className="muted">
                  Your approval group is automatically taken from
                  your employee record.
                </p>
              </div>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  setRequestType(null);
                  setStatus("");
                }}
              >
                Back
              </button>
            </div>

            <div className="employeeBox">
              <strong>{employee.employeeName}</strong>
              <div className="small">
                {employee.employeeId} •{" "}
                {employee.department || "Employee"}
              </div>
              <div
                className="small"
                style={{ marginTop: 10 }}
              >
                Approval Group:{" "}
                <strong>{employee.leaveApprovalGroup}</strong>
              </div>
            </div>

            <form onSubmit={submitLeave}>
              <label className="field">
                <span className="label">Leave Type *</span>
                <select
                  className="select"
                  value={leaveType}
                  onChange={(event) =>
                    setLeaveType(event.target.value)
                  }
                  required
                  disabled={leaveTypes.length === 0}
                >
                  {leaveTypes.length === 0 ? (
                    <option value="">
                      No leave types available
                    </option>
                  ) : (
                    leaveTypes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div className="grid">
                <label className="field">
                  <span className="label">Start Date *</span>
                  <input
                    className="input"
                    type="date"
                    value={startDate}
                    onChange={(event) =>
                      setStartDate(event.target.value)
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span className="label">End Date *</span>
                  <input
                    className="input"
                    type="date"
                    value={endDate}
                    onChange={(event) =>
                      setEndDate(event.target.value)
                    }
                    required
                  />
                </label>
              </div>

              <label className="field">
                <span className="label">Day Type *</span>
                <select
                  className="select"
                  value={dayType}
                  onChange={(event) =>
                    setDayType(
                      event.target.value as
                        | "Full Day"
                        | "Partial Day",
                    )
                  }
                >
                  <option>Full Day</option>
                  <option>Partial Day</option>
                </select>
              </label>

              {dayType === "Partial Day" && (
                <div className="grid">
                  <label className="field">
                    <span className="label">
                      Start Time *
                    </span>
                    <input
                      className="input"
                      type="time"
                      value={startTime}
                      onChange={(event) =>
                        setStartTime(event.target.value)
                      }
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="label">
                      End Time *
                    </span>
                    <input
                      className="input"
                      type="time"
                      value={endTime}
                      onChange={(event) =>
                        setEndTime(event.target.value)
                      }
                      required
                    />
                  </label>
                </div>
              )}

              <label className="field">
                <span className="label">
                  Reason for Leave *
                </span>
                <textarea
                  className="textarea"
                  value={leaveReason}
                  onChange={(event) =>
                    setLeaveReason(event.target.value)
                  }
                  placeholder="Enter the reason for your leave request"
                  required
                />
              </label>

              <label className="field">
                <span className="label">Attachment</span>
                <input
                  className="input"
                  type="file"
                  onChange={(event) =>
                    setAttachment(
                      event.target.files?.[0] || null,
                    )
                  }
                />
                <div
                  className="small"
                  style={{ marginTop: 5 }}
                >
                  Optional. Maximum 10 MB.
                </div>
              </label>

              {contacts.length > 0 && (
                <div className="field">
                  <span className="label">Notify</span>
                  <div className="small">
                    Optional. Selected people receive a direct
                    Lark notification only.
                  </div>

                  <div className="checklist">
                    {contacts.map((contact) => (
                      <label
                        className="check"
                        key={contact.name}
                      >
                        <input
                          type="checkbox"
                          checked={notify.includes(
                            contact.name,
                          )}
                          onChange={(event) =>
                            setNotify((previous) =>
                              event.target.checked
                                ? [
                                    ...previous,
                                    contact.name,
                                  ]
                                : previous.filter(
                                    (item) =>
                                      item !== contact.name,
                                  ),
                            )
                          }
                        />
                        <span>{contact.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="divider" />

              <button
                className="btn btnPrimary"
                disabled={busy}
                style={{ width: "100%" }}
              >
                {busy
                  ? "Submitting…"
                  : "Submit Leave Request"}
              </button>
            </form>

            {status && (
              <div
                className={`status ${
                  statusKind === "error"
                    ? "error"
                    : statusKind === "success"
                      ? "success"
                      : ""
                }`}
              >
                {status}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  Change Off-Date Request
                </h2>
                <p className="muted">
                  Requested new off-date must be within this week.
                </p>
              </div>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  setRequestType(null);
                  setStatus("");
                }}
              >
                Back
              </button>
            </div>

            <div className="employeeBox">
              <strong>{employee.employeeName}</strong>
              <div className="small">
                {employee.employeeId} •{" "}
                {employee.department || "Employee"}
              </div>
              <div
                className="small"
                style={{ marginTop: 10 }}
              >
                Approval Group:{" "}
                <strong>{employee.leaveApprovalGroup}</strong>
              </div>
            </div>

            <form onSubmit={submitChangeOff}>
              <label className="field">
                <span className="label">Employee Name</span>
                <input
                  className="input"
                  value={employee.employeeName}
                  disabled
                />
              </label>

              <div className="grid">
                <label className="field">
                  <span className="label">
                    Current Off-Date *
                  </span>
                  <input
                    className="input"
                    type="date"
                    value={currentOffDate}
                    onChange={(event) =>
                      setCurrentOffDate(event.target.value)
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span className="label">
                    Requested New Off-Date *
                  </span>
                  <input
                    className="input"
                    type="date"
                    min={week.start}
                    max={week.end}
                    value={requestedNewOffDate}
                    onChange={(event) =>
                      setRequestedNewOffDate(
                        event.target.value,
                      )
                    }
                    required
                  />
                  <div
                    className="small"
                    style={{ marginTop: 5 }}
                  >
                    For this week only: {week.start} to{" "}
                    {week.end}
                  </div>
                </label>
              </div>

              <label className="field">
                <span className="label">
                  Reason for Change *
                </span>
                <textarea
                  className="textarea"
                  value={changeOffReason}
                  onChange={(event) =>
                    setChangeOffReason(event.target.value)
                  }
                  placeholder="Enter the reason for changing your off-date"
                  required
                />
              </label>

              <div className="divider" />

              <button
                className="btn btnPrimary"
                disabled={busy}
                style={{ width: "100%" }}
              >
                {busy
                  ? "Submitting…"
                  : "Submit Change Day-Off Request"}
              </button>
            </form>

            {status && (
              <div
                className={`status ${
                  statusKind === "error"
                    ? "error"
                    : statusKind === "success"
                      ? "success"
                      : ""
                }`}
              >
                {status}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
