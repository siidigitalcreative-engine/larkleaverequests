"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type ChangeOffRequest = {
  recordId: string;
  requestId: string;
  employeeName: string;
  employeeId: string;
  department: string;
  approvalGroup: string;
  currentOffDate: number;
  requestedNewOffDate: number;
  reason: string;
  status: string;
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

export default function ChangeDayOffReviewPage() {
  const params = useParams<{ recordId: string }>();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const preset =
    search.get("decision") === "reject" ? "reject" : "approve";

  const [requestData, setRequestData] =
    useState<ChangeOffRequest | null>(null);
  const [decision] = useState<"approve" | "reject">(preset);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(
      `/api/review/change-day-off/${encodeURIComponent(
        params.recordId,
      )}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load request.");
        }
        setRequestData(data.request);
      })
      .catch((error) => setMessage(error.message));
  }, [params.recordId, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/review/change-day-off/${encodeURIComponent(
          params.recordId,
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            decision,
            rejectionReason,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to process request.");
      }

      setDone(true);
      setMessage(`Change Day-Off request ${data.decision.toLowerCase()}.`);

      setRequestData((previous) =>
        previous
          ? {
              ...previous,
              status: data.decision,
              rejectionReason,
            }
          : previous,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to process request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="wrap">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <h1>Approvals</h1>
            <p>Request review</p>
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
                    {requestData.employeeName}&apos;s Change Day-Off
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
                  <strong>Current Off-Date</strong>
                  <div>{dateText(requestData.currentOffDate)}</div>
                </div>

                <div className="fact">
                  <strong>Requested New Off-Date</strong>
                  <div>{dateText(requestData.requestedNewOffDate)}</div>
                </div>

                <div className="fact">
                  <strong>Department</strong>
                  <div>{requestData.department || "—"}</div>
                </div>

                <div className="fact">
                  <strong>Approval Group</strong>
                  <div>{requestData.approvalGroup}</div>
                </div>
              </div>

              <div className="field">
                <span className="label">Reason for Change</span>
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

                  <h3 className="sectionTitle">
                    {decision === "approve"
                      ? "Approve Change Day-Off"
                      : "Reject Change Day-Off"}
                  </h3>

                  <p className="muted">
                    {decision === "approve"
                      ? "Confirm that you want to approve this request."
                      : "Enter the reason for rejecting this request."}
                  </p>

                  {decision === "reject" && (
                    <label className="field">
                      <span className="label">Rejection Reason *</span>
                      <textarea
                        className="textarea"
                        value={rejectionReason}
                        onChange={(event) =>
                          setRejectionReason(event.target.value)
                        }
                        placeholder="Enter rejection reason"
                        required
                      />
                    </label>
                  )}

                  <button
                    className={`btn ${
                      decision === "approve"
                        ? "btnPrimary"
                        : "btnDanger"
                    }`}
                    disabled={busy}
                    style={{ width: "100%", marginTop: 18 }}
                  >
                    {busy
                      ? "Processing…"
                      : decision === "approve"
                        ? "Confirm Approval"
                        : "Confirm Rejection"}
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
