"use client";

import { FormEvent, useEffect, useState } from "react";

type Employee = {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveApprovalGroup: string;
};

type WorkType =
  | "Weekend"
  | "Rest Day"
  | "Holiday"
  | "Other";

function pickerDateText(value: string) {
  if (!value) return "Select date";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export default function OffsetApprovalPage() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [dateWorked, setDateWorked] = useState("");
  const [workType, setWorkType] =
    useState<WorkType>("Weekend");
  const [requestedOffsetDate, setRequestedOffsetDate] =
    useState("");
  const [hoursWorked, setHoursWorked] = useState("8");
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] =
    useState<"normal" | "error" | "success">("normal");
  const [submittedId, setSubmittedId] = useState("");
  const [actualApprovalGroup, setActualApprovalGroup] =
    useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.authenticated) setEmployee(data.employee);
      })
      .catch(() => {
        setStatus("Unable to load your signed-in session.");
        setStatusKind("error");
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      if (dateWorked === requestedOffsetDate) {
        throw new Error(
          "Requested Offset Date must be different from Date Worked.",
        );
      }

      const form = new FormData();
      form.set("dateWorked", dateWorked);
      form.set("workType", workType);
      form.set("requestedOffsetDate", requestedOffsetDate);
      form.set("hoursWorked", hoursWorked);
      form.set("reason", reason);
      if (attachment) form.set("attachment", attachment);

      const response = await fetch("/api/offset-approval", {
        method: "POST",
        body: form,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to submit Offset Approval request.",
        );
      }

      setSubmittedId(data.requestId);
      setActualApprovalGroup(
        data.approvalGroup ||
          employee?.leaveApprovalGroup ||
          "",
      );
      setStatus(
        "Offset Approval request submitted for approval.",
      );
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to submit Offset Approval request.",
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
          <div className="card">Loading Offset Approval…</div>
        </div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="shell">
        <div className="wrap">
          <div className="brand">
            <div className="brandMark">A</div>
            <div>
              <h1>Approvals</h1>
              <p>Offset Approval request</p>
            </div>
          </div>

          <div className="card">
            <h2 className="sectionTitle">Sign in first</h2>
            <p className="muted">
              Please verify your identity from the main
              Approvals page before filing an Offset Approval.
            </p>
            <button
              className="btn btnPrimary"
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Go to Approvals
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (submittedId) {
    return (
      <main className="shell">
        <div className="wrap">
          <div className="brand">
            <div className="brandMark">A</div>
            <div>
              <h1>Approvals</h1>
              <p>Offset Approval request</p>
            </div>
          </div>

          <div className="card successPanel">
            <div className="successIcon">✓</div>
            <h2 className="sectionTitle">
              Offset Approval submitted
            </h2>
            <p className="muted">
              Your request has been sent to the{" "}
              <strong>
                {actualApprovalGroup ||
                  employee.leaveApprovalGroup}
              </strong>{" "}
              approval group.
            </p>

            <div
              className="status success"
              style={{ margin: "18px auto", maxWidth: 440 }}
            >
              Request ID: <strong>{submittedId}</strong>
            </div>

            <div
              className="row"
              style={{
                justifyContent: "center",
                marginTop: 18,
              }}
            >
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => {
                  setSubmittedId("");
                  setDateWorked("");
                  setWorkType("Weekend");
                  setRequestedOffsetDate("");
                  setHoursWorked("8");
                  setReason("");
                  setAttachment(null);
                  setStatus("");
                }}
              >
                File another Offset Approval
              </button>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Back to Approvals
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <style jsx global>{`
        .pickerShell {
          position: relative;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          height: 48px;
          box-sizing: border-box;
          border: 1px solid #d0d5dd;
          border-radius: 12px;
          background: #ffffff;
          overflow: hidden;
        }

        .pickerDisplay {
          display: flex;
          align-items: center;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: 0 14px;
          color: #101828;
          font-size: 16px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
        }

        .pickerDisplay.placeholder {
          color: #98a2b3;
        }

        .pickerNativeInput {
          position: absolute !important;
          inset: 0 !important;
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          opacity: 0 !important;
          cursor: pointer !important;
          box-sizing: border-box !important;
          appearance: none !important;
          -webkit-appearance: none !important;
        }

        @media (max-width: 640px) {
          .grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>

      <main className="shell">
        <div className="wrap">
          <div className="brand">
            <div className="brandMark">A</div>
            <div>
              <h1>Approvals</h1>
              <p>Offset Approval request</p>
            </div>
          </div>

          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  New Offset Approval
                </h2>
                <p className="muted">
                  Use this for approved work completed on a
                  weekend, rest day, holiday, or other day.
                </p>
              </div>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  window.location.href = "/";
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
              <div className="small" style={{ marginTop: 10 }}>
                Approval Group:{" "}
                <strong>{employee.leaveApprovalGroup}</strong>
              </div>
            </div>

            <form onSubmit={submit}>
              <div className="grid">
                <label className="field">
                  <span className="label">Date Worked *</span>
                  <div className="pickerShell">
                    <div
                      className={`pickerDisplay ${
                        dateWorked ? "" : "placeholder"
                      }`}
                    >
                      {pickerDateText(dateWorked)}
                    </div>
                    <input
                      className="pickerNativeInput"
                      type="date"
                      value={dateWorked}
                      onClick={(event) => {
                        try {
                          event.currentTarget.showPicker?.();
                        } catch {}
                      }}
                      onChange={(event) =>
                        setDateWorked(event.target.value)
                      }
                      required
                    />
                  </div>
                </label>

                <label className="field">
                  <span className="label">
                    Requested Offset Date *
                  </span>
                  <div className="pickerShell">
                    <div
                      className={`pickerDisplay ${
                        requestedOffsetDate
                          ? ""
                          : "placeholder"
                      }`}
                    >
                      {pickerDateText(requestedOffsetDate)}
                    </div>
                    <input
                      className="pickerNativeInput"
                      type="date"
                      value={requestedOffsetDate}
                      onClick={(event) => {
                        try {
                          event.currentTarget.showPicker?.();
                        } catch {}
                      }}
                      onChange={(event) =>
                        setRequestedOffsetDate(
                          event.target.value,
                        )
                      }
                      required
                    />
                  </div>
                </label>
              </div>

              <label className="field">
                <span className="label">Work Type *</span>
                <select
                  className="select"
                  value={workType}
                  onChange={(event) =>
                    setWorkType(
                      event.target.value as WorkType,
                    )
                  }
                  required
                >
                  <option>Weekend</option>
                  <option>Rest Day</option>
                  <option>Holiday</option>
                  <option>Other</option>
                </select>
              </label>

              <label className="field">
                <span className="label">Hours Worked *</span>
                <input
                  className="input"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={hoursWorked}
                  onChange={(event) =>
                    setHoursWorked(event.target.value)
                  }
                  required
                />
              </label>

              <label className="field">
                <span className="label">
                  Reason / Work Details *
                </span>
                <textarea
                  className="textarea"
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value)
                  }
                  placeholder="Describe the work completed and why you are requesting the offset"
                  required
                />
              </label>

              <label className="field">
                <span className="label">Attachment</span>
                <input
                  className="input"
                  type="file"
                  accept="image/*,.pdf"
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
                  Optional. Image or PDF, maximum 10 MB.
                </div>
              </label>

              <div className="small" style={{ marginTop: 8 }}>
                Requested Offset Date must be different from
                Date Worked.
              </div>

              <div className="divider" />

              <button
                className="btn btnPrimary"
                disabled={busy}
                style={{ width: "100%" }}
              >
                {busy
                  ? "Submitting…"
                  : "Submit Offset Approval"}
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
        </div>
      </main>
    </>
  );
}
