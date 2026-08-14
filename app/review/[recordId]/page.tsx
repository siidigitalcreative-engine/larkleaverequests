"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type LeaveRequest = {
  requestId: string;
  employeeName: string;
  employeeId: string;
  department: string;
  approvalGroup: string;
  leaveType: string;
  startDate: number;
  endDate: number;
  dayType: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: string;
  approvedBy: string;
  rejectionReason: string;
};

function dateText(value: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function ReviewPage() {
  const params = useParams<{ recordId: string }>();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const preset = search.get("decision") === "reject" ? "reject" : "approve";

  const [requestData, setRequestData] = useState<LeaveRequest | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">(preset);
  const [approverName, setApproverName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(
      `/api/review/${encodeURIComponent(params.recordId)}?token=${encodeURIComponent(token)}`,
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load request.");
        setRequestData(data.request);
      })
      .catch((e) => setMessage(e.message));
  }, [params.recordId, token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/review/${encodeURIComponent(params.recordId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            decision,
            approverName,
            mobileNumber,
            rejectionReason,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to process request.");

      setDone(true);
      setMessage(
        `Leave request ${data.decision.toLowerCase()} by ${data.approverName}.`,
      );
      setRequestData((prev) =>
        prev
          ? {
              ...prev,
              status: data.decision,
              approvedBy: data.approverName,
            }
          : prev,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to process request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="wrap">
        <div className="brand">
          <div className="brandMark">LR</div>
          <div>
            <h1>Leave Requests</h1>
            <p>Approval review</p>
          </div>
        </div>

        <div className="card">
          {!requestData ? (
            <div>{message || "Loading request…"}</div>
          ) : (
            <>
              <div className="between">
                <div>
                  <h2 className="sectionTitle">
                    {requestData.employeeName}&apos;s Leave
                  </h2>
                  <div className="small">{requestData.requestId}</div>
                </div>
                <span
                  className={`pill ${requestData.status.toLowerCase()}`}
                >
                  {requestData.status}
                </span>
              </div>

              <div className="divider" />

              <div className="reviewFacts">
                <div className="fact">
                  <strong>Leave Type</strong>
                  <div>{requestData.leaveType}</div>
                </div>
                <div className="fact">
                  <strong>Approval Group</strong>
                  <div>{requestData.approvalGroup}</div>
                </div>
                <div className="fact">
                  <strong>Start</strong>
                  <div>
                    {dateText(requestData.startDate)} {requestData.startTime}
                  </div>
                </div>
                <div className="fact">
                  <strong>End</strong>
                  <div>
                    {dateText(requestData.endDate)} {requestData.endTime}
                  </div>
                </div>
              </div>

              <div className="field">
                <span className="label">Reason for Leave</span>
                <div className="fact">
                  <div style={{ fontWeight: 500, lineHeight: 1.55 }}>
                    {requestData.reason}
                  </div>
                </div>
              </div>

              {requestData.status !== "Pending" || done ? (
                <div className="status success" style={{ marginTop: 18 }}>
                  {message ||
                    `This request has already been ${requestData.status.toLowerCase()}.`}
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="divider" />

                  <h3 className="sectionTitle">Approver Verification</h3>
                  <p className="muted">
                    Enter the name and mobile number registered in the Leave
                    Approvers table for the {requestData.approvalGroup} group.
                  </p>

                  <div className="grid">
                    <label className="field">
                      <span className="label">Approver Name *</span>
                      <input
                        className="input"
                        value={approverName}
                        onChange={(e) => setApproverName(e.target.value)}
                        required
                      />
                    </label>

                    <label className="field">
                      <span className="label">Registered Mobile *</span>
                      <input
                        className="input"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        required
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span className="label">Decision *</span>
                    <select
                      className="select"
                      value={decision}
                      onChange={(e) =>
                        setDecision(e.target.value as "approve" | "reject")
                      }
                    >
                      <option value="approve">Approve</option>
                      <option value="reject">Reject</option>
                    </select>
                  </label>

                  {decision === "reject" && (
                    <label className="field">
                      <span className="label">Rejection Reason *</span>
                      <textarea
                        className="textarea"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        required
                      />
                    </label>
                  )}

                  <button
                    className={`btn ${
                      decision === "approve" ? "btnPrimary" : "btnDanger"
                    }`}
                    disabled={busy}
                    style={{ width: "100%", marginTop: 18 }}
                  >
                    {busy
                      ? "Processing…"
                      : decision === "approve"
                        ? "Approve Leave"
                        : "Reject Leave"}
                  </button>
                </form>
              )}

              {message && !done && (
                <div className="status error">{message}</div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
