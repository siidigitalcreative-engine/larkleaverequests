"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import {
  useParams,
  useSearchParams,
} from "next/navigation";

type Attachment = {
  fileToken: string;
  name: string;
  type?: string;
  size?: number;
};

type OvertimeRequest = {
  recordId: string;
  requestId: string;
  employeeName: string;
  employeeId: string;
  department: string;
  approvalGroup: string;
  overtimeDate: number;
  startTime: number;
  endTime: number;
  durationHours: number;
  publicHoliday: string;
  compensationMethod: string;
  reason: string;
  submittedAt: number;
  attachments: Attachment[];
  status: string;
  rejectionReason: string;
  approvalComment: string;
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

function timeText(value: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}


function filedText(value: number) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function attachmentUrl(fileToken: string) {
  return `/api/attachment/${encodeURIComponent(fileToken)}`;
}

function likelyImage(item: Attachment) {
  if (item.type?.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(item.name || "");
}

export default function OvertimeReviewPage() {
  const params = useParams<{ recordId: string }>();
  const search = useSearchParams();
  const token = search.get("token") || "";
  const preset =
    search.get("decision") === "reject"
      ? "reject"
      : "approve";

  const [requestData, setRequestData] =
    useState<OvertimeRequest | null>(null);
  const [decision] =
    useState<"approve" | "reject">(preset);
  const [rejectionReason, setRejectionReason] =
    useState("");
  const [approvalComment, setApprovalComment] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(
      `/api/review/overtime/${encodeURIComponent(
        params.recordId,
      )}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to load request.",
          );
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
        `/api/review/overtime/${encodeURIComponent(
          params.recordId,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            decision,
            rejectionReason,
            approvalComment,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to process request.",
        );
      }

      setDone(true);
      setMessage(
        `Overtime request ${data.decision.toLowerCase()}.`,
      );

      setRequestData((previous) =>
        previous
          ? {
              ...previous,
              status: data.decision,
              rejectionReason,
              approvalComment,
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
            <p>Overtime review</p>
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
                    {requestData.employeeName}&apos;s Overtime
                  </h2>
                  <div className="small">
                    {requestData.requestId}
                  </div>
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
                  <strong>Overtime Date</strong>
                  <div>
                    {dateText(requestData.overtimeDate)}
                  </div>
                </div>

                <div className="fact">
                  <strong>Date Filed</strong>
                  <div>{filedText(requestData.submittedAt)}</div>
                </div>

                <div className="fact">
                  <strong>Start Time</strong>
                  <div>
                    {timeText(requestData.startTime)}
                  </div>
                </div>

                <div className="fact">
                  <strong>End Time</strong>
                  <div>
                    {timeText(requestData.endTime)}
                  </div>
                </div>

                <div className="fact">
                  <strong>Duration</strong>
                  <div>
                    {requestData.durationHours} hour(s)
                  </div>
                </div>

                <div className="fact">
                  <strong>Public Holiday?</strong>
                  <div>
                    {requestData.publicHoliday || "—"}
                  </div>
                </div>

                <div className="fact">
                  <strong>Compensation Method</strong>
                  <div>
                    {requestData.compensationMethod || "—"}
                  </div>
                </div>

                <div className="fact">
                  <strong>Department</strong>
                  <div>
                    {requestData.department || "—"}
                  </div>
                </div>

                <div className="fact">
                  <strong>Approval Group</strong>
                  <div>{requestData.approvalGroup}</div>
                </div>
              </div>

              <div className="field">
                <span className="label">Reason</span>
                <div className="fact">
                  <div
                    style={{
                      fontWeight: 500,
                      lineHeight: 1.55,
                    }}
                  >
                    {requestData.reason}
                  </div>
                </div>
              </div>


              {requestData.attachments?.length > 0 && (
                <div className="field">
                  <span className="label">Attachment</span>
                  <div style={{ display: "grid", gap: 12 }}>
                    {requestData.attachments.map((item) => (
                      <div
                        key={item.fileToken}
                        className="fact"
                        style={{ overflow: "hidden" }}
                      >
                        {likelyImage(item) && (
                          <a
                            href={attachmentUrl(item.fileToken)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={attachmentUrl(item.fileToken)}
                              alt={item.name}
                              style={{
                                display: "block",
                                width: "100%",
                                maxHeight: 520,
                                objectFit: "contain",
                                borderRadius: 10,
                                background: "#f8fafc",
                              }}
                            />
                          </a>
                        )}
                        <div
                          className="between"
                          style={{
                            marginTop: likelyImage(item) ? 10 : 0,
                          }}
                        >
                          <div
                            className="small"
                            style={{
                              fontWeight: 700,
                              wordBreak: "break-word",
                            }}
                          >
                            {item.name || "Attachment"}
                          </div>
                          <a
                            href={attachmentUrl(item.fileToken)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btnGhost"
                            style={{ textDecoration: "none" }}
                          >
                            View
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {requestData.status !== "Pending" || done ? (
                <div
                  className="status success"
                  style={{ marginTop: 18 }}
                >
                  {message ||
                    `This request has already been ${requestData.status.toLowerCase()}.`}
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="divider" />

                  <h3 className="sectionTitle">
                    {decision === "approve"
                      ? "Approve Overtime"
                      : "Reject Overtime"}
                  </h3>

                  <p className="muted">
                    {decision === "approve"
                      ? "Confirm that you want to approve this Overtime request."
                      : "Enter the reason for rejecting this Overtime request."}
                  </p>

                  {decision === "approve" && (
                    <label className="field">
                      <span className="label">
                        Approval Comment
                      </span>
                      <textarea
                        className="textarea"
                        value={approvalComment}
                        onChange={(event) =>
                          setApprovalComment(
                            event.target.value,
                          )
                        }
                        placeholder="Add an optional approval comment"
                      />
                    </label>
                  )}

                  {decision === "reject" && (
                    <label className="field">
                      <span className="label">
                        Rejection Reason *
                      </span>
                      <textarea
                        className="textarea"
                        value={rejectionReason}
                        onChange={(event) =>
                          setRejectionReason(
                            event.target.value,
                          )
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
                    style={{
                      width: "100%",
                      marginTop: 18,
                    }}
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
                <div className="status error">
                  {message}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
