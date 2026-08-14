"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Employee = {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveApprovalGroup: string;
};

type PublicEmployee = { employeeName: string; department: string };
type NotifyContact = { name: string };

const LEAVE_TYPES = [
  "Vacation Leave",
  "Sick Leave",
  "Emergency Leave",
  "Bereavement Leave",
  "Maternity / Paternity Leave",
  "Solo Parent Leave",
  "Service Incentive Leave",
  "Other",
];

function mobileDisplay(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)]
    .filter(Boolean)
    .join(" ");
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [contacts, setContacts] = useState<NotifyContact[]>([]);

  const [employeeName, setEmployeeName] = useState("");
  const [mobile, setMobile] = useState("");

  const [leaveType, setLeaveType] = useState("Vacation Leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayType, setDayType] = useState<"Full Day" | "Partial Day">("Full Day");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"normal" | "error" | "success">("normal");
  const [submittedId, setSubmittedId] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json()),
      fetch("/api/notify-contacts").then((r) => r.json()),
    ])
      .then(([session, employeeData, contactData]) => {
        if (session.authenticated) setEmployee(session.employee);
        setEmployees(employeeData.employees || []);
        setContacts(contactData.contacts || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = employeeName.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((x) => x.employeeName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [employeeName, employees]);

  async function verify(e: FormEvent) {
    e.preventDefault();
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
      if (!response.ok) throw new Error(data.error || "Verification failed.");

      setEmployee(data.employee);
      setStatus("Identity verified.");
      setStatusKind("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
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
    setSubmittedId("");
    setStatus("");
  }

  async function submitLeave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      const form = new FormData();
      form.set("leaveType", leaveType);
      form.set("startDate", startDate);
      form.set("endDate", endDate);
      form.set("dayType", dayType);
      form.set("reason", reason);

      if (dayType === "Partial Day") {
        form.set("startTime", startTime);
        form.set("endTime", endTime);
      }

      notify.forEach((name) => form.append("notify", name));
      if (attachment) form.set("attachment", attachment);

      const response = await fetch("/api/leave", {
        method: "POST",
        body: form,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to submit leave.");

      setSubmittedId(data.requestId);

      if (data.notifyFailures?.length) {
        setStatus(
          `Leave submitted. Direct notification could not be delivered to: ${data.notifyFailures.join(", ")}.`,
        );
        setStatusKind("normal");
      } else {
        setStatus("Leave request submitted for approval.");
        setStatusKind("success");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to submit leave.");
      setStatusKind("error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="wrap">
          <div className="card">Loading Leave Requests…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="wrap">
        <div className="brand">
          <div className="brandMark">LR</div>
          <div>
            <h1>Leave Requests</h1>
            <p>Submit and route leave requests for approval.</p>
          </div>
        </div>

        {!employee ? (
          <div className="card">
            <h2 className="sectionTitle">Verify your identity</h2>
            <p className="muted">
              Use the same employee record and registered mobile number used for attendance.
            </p>

            <form onSubmit={verify}>
              <label className="field">
                <span className="label">Employee Name</span>
                <input
                  className="input"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Search your name"
                  required
                />
              </label>

              {filteredEmployees.length > 0 && (
                <div className="checklist">
                  {filteredEmployees.map((x) => (
                    <button
                      key={x.employeeName}
                      type="button"
                      className="check"
                      onClick={() => setEmployeeName(x.employeeName)}
                      style={{ textAlign: "left", background: "#fff", cursor: "pointer" }}
                    >
                      <div>
                        <strong>{x.employeeName}</strong>
                        <div className="small">{x.department || "Employee"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <label className="field">
                <span className="label">Registered Mobile Number</span>
                <div className="row" style={{ alignItems: "stretch", flexWrap: "nowrap" }}>
                  <div
                    className="input"
                    style={{ width: 70, background: "#f8fafc", color: "#475467" }}
                  >
                    +63
                  </div>
                  <input
                    className="input"
                    value={mobileDisplay(mobile)}
                    onChange={(e) =>
                      setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
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
            <h2 className="sectionTitle">Leave request submitted</h2>
            <p className="muted">
              Your request has been sent to the{" "}
              <strong>{employee.leaveApprovalGroup}</strong> approval group.
            </p>

            <div className="status success" style={{ margin: "18px auto", maxWidth: 440 }}>
              Request ID: <strong>{submittedId}</strong>
            </div>

            {status && <div className="status">{status}</div>}

            <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
              <button
                className="btn btnPrimary"
                onClick={() => {
                  setSubmittedId("");
                  setReason("");
                  setNotify([]);
                  setAttachment(null);
                }}
              >
                File another leave
              </button>
              <button className="btn btnGhost" onClick={logout}>
                Change employee
              </button>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">New Leave Request</h2>
                <p className="muted">
                  Your approval group is automatically taken from your employee record.
                </p>
              </div>
              <span className="pill pending">Pending</span>
            </div>

            <div className="employeeBox">
              <div className="between">
                <div>
                  <strong>{employee.employeeName}</strong>
                  <div className="small">
                    {employee.employeeId} • {employee.department || "Employee"}
                  </div>
                </div>
                <button className="btn btnGhost" type="button" onClick={logout}>
                  Not you?
                </button>
              </div>
              <div className="small" style={{ marginTop: 10 }}>
                Approval Group: <strong>{employee.leaveApprovalGroup}</strong>
              </div>
            </div>

            <form onSubmit={submitLeave}>
              <label className="field">
                <span className="label">Leave Type *</span>
                <select
                  className="select"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                >
                  {LEAVE_TYPES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>

              <div className="grid">
                <label className="field">
                  <span className="label">Start Date *</span>
                  <input
                    className="input"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span className="label">End Date *</span>
                  <input
                    className="input"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="field">
                <span className="label">Day Type *</span>
                <select
                  className="select"
                  value={dayType}
                  onChange={(e) =>
                    setDayType(e.target.value as "Full Day" | "Partial Day")
                  }
                >
                  <option>Full Day</option>
                  <option>Partial Day</option>
                </select>
              </label>

              {dayType === "Partial Day" && (
                <div className="grid">
                  <label className="field">
                    <span className="label">Start Time *</span>
                    <input
                      className="input"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </label>

                  <label className="field">
                    <span className="label">End Time *</span>
                    <input
                      className="input"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </label>
                </div>
              )}

              <label className="field">
                <span className="label">Reason for Leave *</span>
                <textarea
                  className="textarea"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter the reason for your leave request"
                  required
                />
              </label>

              <label className="field">
                <span className="label">Attachment</span>
                <input
                  className="input"
                  type="file"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                />
                <div className="small" style={{ marginTop: 5 }}>
                  Optional. Maximum 10 MB.
                </div>
              </label>

              {contacts.length > 0 && (
                <div className="field">
                  <span className="label">Notify</span>
                  <div className="small">
                    Optional. Selected people receive a direct Lark notification only.
                  </div>

                  <div className="checklist">
                    {contacts.map((contact) => (
                      <label className="check" key={contact.name}>
                        <input
                          type="checkbox"
                          checked={notify.includes(contact.name)}
                          onChange={(e) =>
                            setNotify((prev) =>
                              e.target.checked
                                ? [...prev, contact.name]
                                : prev.filter((x) => x !== contact.name),
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
                {busy ? "Submitting…" : "Submit Leave Request"}
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
