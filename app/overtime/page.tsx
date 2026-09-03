"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type Employee = {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveApprovalGroup: string;
};

function calculateDuration(
  startTime: string,
  endTime: string,
) {
  if (!startTime || !endTime) return 0;

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  let start = sh * 60 + sm;
  let end = eh * 60 + em;

  if (end <= start) end += 24 * 60;

  return Math.round(((end - start) / 60) * 100) / 100;
}

export default function OvertimePage() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] =
    useState<Employee | null>(null);

  const [overtimeDate, setOvertimeDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [publicHoliday, setPublicHoliday] =
    useState<"Yes" | "No">("No");
  const [compensationMethod, setCompensationMethod] =
    useState<
      | "Apply for days off"
      | "Apply for overtimes payment"
    >("Apply for days off");
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] =
    useState<"normal" | "error" | "success">("normal");
  const [submittedId, setSubmittedId] = useState("");
  const [actualApprovalGroup, setActualApprovalGroup] =
    useState("");

  const durationHours = useMemo(
    () => calculateDuration(startTime, endTime),
    [startTime, endTime],
  );

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.authenticated) {
          setEmployee(data.employee);
        }
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
      const form = new FormData();

      form.set("overtimeDate", overtimeDate);
      form.set("startTime", startTime);
      form.set("endTime", endTime);
      form.set("publicHoliday", publicHoliday);
      form.set("compensationMethod", compensationMethod);
      form.set("reason", reason);

      if (attachment) {
        form.set("attachment", attachment);
      }

      const response = await fetch("/api/overtime", {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to submit Overtime request.",
        );
      }

      setSubmittedId(data.requestId);
      setActualApprovalGroup(
        data.approvalGroup ||
          employee?.leaveApprovalGroup ||
          "",
      );
      setStatus("Overtime request submitted for approval.");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to submit Overtime request.",
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
          <div className="card">Loading Overtime…</div>
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
              <p>Overtime request</p>
            </div>
          </div>

          <div className="card">
            <h2 className="sectionTitle">
              Sign in first
            </h2>
            <p className="muted">
              Please verify your identity from the main
              Approvals page before filing Overtime.
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
              <p>Overtime request</p>
            </div>
          </div>

          <div className="card successPanel">
            <div className="successIcon">✓</div>
            <h2 className="sectionTitle">
              Overtime request submitted
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
              style={{
                margin: "18px auto",
                maxWidth: 440,
              }}
            >
              Request ID: <strong>{submittedId}</strong>
            </div>

            {status && (
              <div className="status success">
                {status}
              </div>
            )}

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
                  setOvertimeDate("");
                  setStartTime("");
                  setEndTime("");
                  setPublicHoliday("No");
                  setCompensationMethod(
                    "Apply for days off",
                  );
                  setReason("");
                  setAttachment(null);
                  setStatus("");
                }}
              >
                File another Overtime
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
        .overtimeDateShell {
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

        .overtimeDateInput {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          height: 100% !important;
          min-height: 48px !important;
          box-sizing: border-box !important;
          border: 0 !important;
          margin: 0 !important;
          padding: 0 14px !important;
          background: transparent !important;
          color: #101828 !important;
          font-size: 16px !important;
        }
      `}</style>

      <main className="shell">
        <div className="wrap">
          <div className="brand">
            <div className="brandMark">A</div>
            <div>
              <h1>Approvals</h1>
              <p>Overtime request</p>
            </div>
          </div>

          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  New Overtime Request
                </h2>
                <p className="muted">
                  Your latest Approval Group is checked from
                  your employee record when you submit.
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
              <div
                className="small"
                style={{ marginTop: 10 }}
              >
                Current Session Approval Group:{" "}
                <strong>
                  {employee.leaveApprovalGroup}
                </strong>
              </div>
            </div>

            <form onSubmit={submit}>
              <label
                className="field"
                style={{ minWidth: 0 }}
              >
                <span className="label">
                  Overtime Date *
                </span>
                <div className="overtimeDateShell">
                  <input
                    className="overtimeDateInput"
                    type="date"
                    value={overtimeDate}
                    onChange={(event) =>
                      setOvertimeDate(event.target.value)
                    }
                    required
                  />
                </div>
              </label>

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

              <div className="field">
                <span className="label">
                  Duration (Hours)
                </span>
                <div
                  className="employeeBox"
                  style={{ margin: 0 }}
                >
                  <strong>
                    {durationHours
                      ? `${durationHours} hour${
                          durationHours === 1 ? "" : "s"
                        }`
                      : "Select Start Time and End Time"}
                  </strong>
                  {startTime &&
                    endTime &&
                    endTime <= startTime && (
                      <div
                        className="small"
                        style={{ marginTop: 4 }}
                      >
                        End Time is treated as the next day.
                      </div>
                    )}
                </div>
              </div>

              <label className="field">
                <span className="label">
                  Public Holiday? *
                </span>
                <select
                  className="select"
                  value={publicHoliday}
                  onChange={(event) =>
                    setPublicHoliday(
                      event.target.value as
                        | "Yes"
                        | "No",
                    )
                  }
                  required
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </label>

              <label className="field">
                <span className="label">
                  Compensation Method *
                </span>
                <select
                  className="select"
                  value={compensationMethod}
                  onChange={(event) =>
                    setCompensationMethod(
                      event.target.value as
                        | "Apply for days off"
                        | "Apply for overtimes payment",
                    )
                  }
                  required
                >
                  <option value="Apply for days off">
                    Apply for days off
                  </option>
                  <option value="Apply for overtimes payment">
                    Apply for overtimes payment
                  </option>
                </select>
              </label>

              <label className="field">
                <span className="label">Reason *</span>
                <textarea
                  className="textarea"
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value)
                  }
                  placeholder="Enter the reason for your Overtime request"
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

              <div className="divider" />

              <button
                className="btn btnPrimary"
                disabled={
                  busy ||
                  !overtimeDate ||
                  !startTime ||
                  !endTime ||
                  durationHours <= 0
                }
                style={{ width: "100%" }}
              >
                {busy
                  ? "Submitting…"
                  : "Submit Overtime Request"}
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
