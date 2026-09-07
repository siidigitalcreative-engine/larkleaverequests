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
  requestedEarlyTimeOut: string,
  regularTimeOut: string,
) {
  if (
    !requestedEarlyTimeOut ||
    !regularTimeOut
  ) {
    return 0;
  }

  const [rh, rm] =
    requestedEarlyTimeOut
      .split(":")
      .map(Number);

  const [sh, sm] =
    regularTimeOut
      .split(":")
      .map(Number);

  const requested =
    rh * 60 + rm;
  const scheduled =
    sh * 60 + sm;

  if (requested >= scheduled) {
    return 0;
  }

  return (
    Math.round(
      ((scheduled - requested) /
        60) *
        100,
    ) / 100
  );
}

export default function UndertimePage() {
  const [loading, setLoading] =
    useState(true);

  const [employee, setEmployee] =
    useState<Employee | null>(null);

  const [
    undertimeDate,
    setUndertimeDate,
  ] = useState("");

  const [
    requestedEarlyTimeOut,
    setRequestedTimeOut,
  ] = useState("");

  const [
    regularTimeOut,
    setScheduledTimeOut,
  ] = useState("");

  const [reason, setReason] =
    useState("");

  const [
    attachment,
    setAttachment,
  ] = useState<File | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [status, setStatus] =
    useState("");

  const [
    statusKind,
    setStatusKind,
  ] = useState<
    "normal" | "error" | "success"
  >("normal");

  const [
    submittedId,
    setSubmittedId,
  ] = useState("");

  const [
    actualApprovalGroup,
    setActualApprovalGroup,
  ] = useState("");

  const durationHours =
    useMemo(
      () =>
        calculateDuration(
          requestedEarlyTimeOut,
          regularTimeOut,
        ),
      [
        requestedEarlyTimeOut,
        regularTimeOut,
      ],
    );

  useEffect(() => {
    fetch("/api/auth/session", {
      cache: "no-store",
    })
      .then((response) =>
        response.json(),
      )
      .then((data) => {
        if (data.authenticated) {
          setEmployee(data.employee);
        }
      })
      .catch(() => {
        setStatus(
          "Unable to load your signed-in session.",
        );
        setStatusKind("error");
      })
      .finally(() =>
        setLoading(false),
      );
  }, []);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();
    setBusy(true);
    setStatus("");

    try {
      if (
        requestedEarlyTimeOut >=
        regularTimeOut
      ) {
        throw new Error(
          "Requested Early Time Out must be earlier than Regular Time Out.",
        );
      }

      const form =
        new FormData();

      form.set(
        "undertimeDate",
        undertimeDate,
      );

      form.set(
        "requestedEarlyTimeOut",
        requestedEarlyTimeOut,
      );

      form.set(
        "regularTimeOut",
        regularTimeOut,
      );

      form.set("reason", reason);

      if (attachment) {
        form.set(
          "attachment",
          attachment,
        );
      }

      const response =
        await fetch(
          "/api/undertime",
          {
            method: "POST",
            body: form,
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to submit Undertime request.",
        );
      }

      setSubmittedId(
        data.requestId,
      );

      setActualApprovalGroup(
        data.approvalGroup ||
          employee
            ?.leaveApprovalGroup ||
          "",
      );

      setStatus(
        "Undertime request submitted for approval.",
      );

      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to submit Undertime request.",
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
          <div className="card">
            Loading Undertime…
          </div>
        </div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="shell">
        <div className="wrap">
          <div className="brand">
            <div className="brandMark">
              A
            </div>
            <div>
              <h1>Approvals</h1>
              <p>
                Undertime request
              </p>
            </div>
          </div>

          <div className="card">
            <h2 className="sectionTitle">
              Sign in first
            </h2>

            <p className="muted">
              Please verify your identity
              from the main Approvals page
              before filing Undertime.
            </p>

            <button
              className="btn btnPrimary"
              type="button"
              onClick={() => {
                window.location.href =
                  "/";
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
            <div className="brandMark">
              A
            </div>
            <div>
              <h1>Approvals</h1>
              <p>
                Undertime request
              </p>
            </div>
          </div>

          <div className="card successPanel">
            <div className="successIcon">
              ✓
            </div>

            <h2 className="sectionTitle">
              Undertime request submitted
            </h2>

            <p className="muted">
              Your request has been sent
              to the{" "}
              <strong>
                {actualApprovalGroup ||
                  employee.leaveApprovalGroup}
              </strong>{" "}
              approval group.
            </p>

            <div
              className="status success"
              style={{
                margin:
                  "18px auto",
                maxWidth: 440,
              }}
            >
              Request ID:{" "}
              <strong>
                {submittedId}
              </strong>
            </div>

            {status && (
              <div className="status success">
                {status}
              </div>
            )}

            <div
              className="row"
              style={{
                justifyContent:
                  "center",
                marginTop: 18,
              }}
            >
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => {
                  setSubmittedId("");
                  setUndertimeDate("");
                  setRequestedTimeOut("");
                  setScheduledTimeOut("");
                  setReason("");
                  setAttachment(null);
                  setStatus("");
                }}
              >
                File another Undertime
              </button>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  window.location.href =
                    "/";
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
        .undertimeDateShell {
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

        .undertimeDateInput {
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
            <div className="brandMark">
              A
            </div>
            <div>
              <h1>Approvals</h1>
              <p>
                Undertime request
              </p>
            </div>
          </div>

          <div className="card">
            <div className="between">
              <div>
                <h2 className="sectionTitle">
                  New Undertime Request
                </h2>

                <p className="muted">
                  Your latest Approval
                  Group is checked from
                  your employee record
                  when you submit.
                </p>
              </div>

              <button
                className="btn btnGhost"
                type="button"
                onClick={() => {
                  window.location.href =
                    "/";
                }}
              >
                Back
              </button>
            </div>

            <div className="employeeBox">
              <strong>
                {employee.employeeName}
              </strong>

              <div className="small">
                {employee.employeeId} •{" "}
                {employee.department ||
                  "Employee"}
              </div>

              <div
                className="small"
                style={{
                  marginTop: 10,
                }}
              >
                Current Session Approval
                Group:{" "}
                <strong>
                  {
                    employee.leaveApprovalGroup
                  }
                </strong>
              </div>
            </div>

            <form onSubmit={submit}>
              <label
                className="field"
                style={{
                  minWidth: 0,
                }}
              >
                <span className="label">
                  Undertime Date *
                </span>

                <div className="undertimeDateShell">
                  <input
                    className="undertimeDateInput"
                    type="date"
                    value={undertimeDate}
                    onChange={(event) =>
                      setUndertimeDate(
                        event.target
                          .value,
                      )
                    }
                    required
                  />
                </div>
              </label>

              <div className="grid">
                <label className="field">
                  <span className="label">
                    Requested Early Time Out *
                  </span>

                  <input
                    className="input"
                    type="time"
                    value={
                      requestedEarlyTimeOut
                    }
                    onChange={(event) =>
                      setRequestedTimeOut(
                        event.target
                          .value,
                      )
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span className="label">
                    Regular Time Out *
                  </span>

                  <input
                    className="input"
                    type="time"
                    value={
                      regularTimeOut
                    }
                    onChange={(event) =>
                      setScheduledTimeOut(
                        event.target
                          .value,
                      )
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
                  style={{
                    margin: 0,
                  }}
                >
                  <strong>
                    {durationHours
                      ? `${durationHours} hour${
                          durationHours ===
                          1
                            ? ""
                            : "s"
                        }`
                      : "Select Requested and Regular Time Out"}
                  </strong>

                  {requestedEarlyTimeOut &&
                    regularTimeOut &&
                    requestedEarlyTimeOut >=
                      regularTimeOut && (
                      <div
                        className="small"
                        style={{
                          marginTop: 4,
                          color:
                            "#b42318",
                        }}
                      >
                        Requested Early Time Out
                        must be earlier than
                        Regular Time Out.
                      </div>
                    )}
                </div>
              </div>

              <label className="field">
                <span className="label">
                  Reason *
                </span>

                <textarea
                  className="textarea"
                  value={reason}
                  onChange={(event) =>
                    setReason(
                      event.target.value,
                    )
                  }
                  placeholder="Enter the reason for your Undertime request"
                  required
                />
              </label>

              <label className="field">
                <span className="label">
                  Attachment
                </span>

                <input
                  className="input"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) =>
                    setAttachment(
                      event.target
                        .files?.[0] ||
                        null,
                    )
                  }
                />

                <div
                  className="small"
                  style={{
                    marginTop: 5,
                  }}
                >
                  Optional. Image or PDF,
                  maximum 10 MB.
                </div>
              </label>

              <div className="divider" />

              <button
                className="btn btnPrimary"
                disabled={
                  busy ||
                  !undertimeDate ||
                  !requestedEarlyTimeOut ||
                  !regularTimeOut ||
                  durationHours <= 0
                }
                style={{
                  width: "100%",
                }}
              >
                {busy
                  ? "Submitting…"
                  : "Submit Undertime Request"}
              </button>
            </form>

            {status && (
              <div
                className={`status ${
                  statusKind ===
                  "error"
                    ? "error"
                    : statusKind ===
                        "success"
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
