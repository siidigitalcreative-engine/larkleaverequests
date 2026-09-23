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

type RequestData = {
  recordId: string;
  requestId: string;
  employeeName: string;
  employeeId: string;
  department: string;
  approvalGroup: string;
  dateWorked: number;
  workType: string;
  requestedOffsetDate: number;
  hoursWorked: number;
  reason: string;
  submittedAt: number;
  attachments: Attachment[];
  status: string;
  rejectionReason: string;
  approvalComment: string;
};

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

function attachmentUrl(
  fileToken: string,
  fileName: string,
  recordId: string,
) {
  return (
    `/api/attachment/${encodeURIComponent(
      fileToken,
    )}` +
    `?source=offset-approval` +
    `&recordId=${encodeURIComponent(
      recordId,
    )}` +
    `&name=${encodeURIComponent(
      fileName || "attachment",
    )}`
  );
}

function likelyImage(item: Attachment) {
  if (
    item.type
      ?.toLowerCase()
      .startsWith("image/")
  ) {
    return true;
  }

  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(
    item.name || "",
  );
}

export default function OffsetApprovalReviewPage() {
  const params =
    useParams<{ recordId: string }>();
  const search = useSearchParams();
  const token =
    search.get("token") || "";

  const preset =
    search.get("decision") === "reject"
      ? "reject"
      : "approve";

  const [requestData, setRequestData] =
    useState<RequestData | null>(null);

  const [decision] =
    useState<"approve" | "reject">(
      preset,
    );

  const [
    rejectionReason,
    setRejectionReason,
  ] = useState("");

  const [
    approvalComment,
    setApprovalComment,
  ] = useState("");

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [done, setDone] =
    useState(false);

  useEffect(() => {
    fetch(
      `/api/review/offset-approval/${encodeURIComponent(
        params.recordId,
      )}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to load request.",
          );
        }

        setRequestData(data.request);
      })
      .catch((error) =>
        setMessage(error.message),
      );
  }, [params.recordId, token]);

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/review/offset-approval/${encodeURIComponent(
          params.recordId,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            token,
            decision,
            rejectionReason,
            approvalComment,
          }),
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to process request.",
        );
      }

      setDone(true);

      setMessage(
        `Offset Approval ${data.decision.toLowerCase()}.`,
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
          <div className="brandMark">
            A
          </div>
          <div>
            <h1>Approvals</h1>
            <p>
              Offset Approval review
            </p>
          </div>
        </div>

        <div className="card">
          {!requestData ? (
            <div>
              {message ||
                "Loading request…"}
            </div>
          ) : (
            <>
              <div className="between">
                <div>
                  <h2 className="sectionTitle">
                    {requestData.employeeName}&apos;s Offset Approval
                  </h2>
                  <div className="small">
                    {
                      requestData.requestId
                    }
                  </div>
                </div>

                <span
                  className={`pill ${requestData.status.toLowerCase()}`}
                >
                  {
                    requestData.status
                  }
                </span>
              </div>

              <div className="divider" />

              <div className="reviewFacts">
                <div className="fact">
                  <strong>Date Worked</strong>
                  <div>
                    {new Intl.DateTimeFormat("en-PH", {
                      timeZone: "Asia/Manila",
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                    }).format(new Date(requestData.dateWorked))}
                  </div>
                </div>

                <div className="fact">
                  <strong>Work Type</strong>
                  <div>{requestData.workType}</div>
                </div>

                <div className="fact">
                  <strong>Requested Offset Date</strong>
                  <div>
                    {new Intl.DateTimeFormat("en-PH", {
                      timeZone: "Asia/Manila",
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                    }).format(
                      new Date(requestData.requestedOffsetDate),
                    )}
                  </div>
                </div>

                <div className="fact">
                  <strong>Hours Worked</strong>
                  <div>{requestData.hoursWorked}</div>
                </div>

                <div className="fact">
                  <strong>Date Filed</strong>
                  <div>{filedText(requestData.submittedAt)}</div>
                </div>

                <div className="fact">
                  <strong>Approval Group</strong>
                  <div>{requestData.approvalGroup}</div>
                </div>
              </div>

              <div className="field">
                <span className="label">
                  Reason / Work Details
                </span>
                <div className="fact">
                  {requestData.reason}
                </div>
              </div>

              {requestData.attachments
                ?.length > 0 && (
                <div className="field">
                  <span className="label">
                    Attachment
                  </span>

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {requestData.attachments.map(
                      (item) => (
                        <div
                          key={
                            item.fileToken
                          }
                          className="fact"
                          style={{
                            overflow:
                              "hidden",
                          }}
                        >
                          {likelyImage(
                            item,
                          ) && (
                            <a
                              href={attachmentUrl(
                                item.fileToken,
                                item.name,
                                params.recordId,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={attachmentUrl(
                                  item.fileToken,
                                  item.name,
                                  params.recordId,
                                )}
                                alt={
                                  item.name
                                }
                                style={{
                                  display:
                                    "block",
                                  width:
                                    "100%",
                                  maxHeight:
                                    520,
                                  objectFit:
                                    "contain",
                                  borderRadius:
                                    10,
                                  background:
                                    "#f8fafc",
                                }}
                              />
                            </a>
                          )}

                          <div
                            className="between"
                            style={{
                              marginTop:
                                likelyImage(
                                  item,
                                )
                                  ? 10
                                  : 0,
                            }}
                          >
                            <div className="small">
                              {item.name ||
                                "Attachment"}
                            </div>

                            <a
                              href={attachmentUrl(
                                item.fileToken,
                                item.name,
                                params.recordId,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btnGhost"
                              style={{
                                textDecoration:
                                  "none",
                              }}
                            >
                              View
                            </a>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {requestData.status !==
                "Pending" || done ? (
                <div
                  className="status success"
                  style={{
                    marginTop: 18,
                  }}
                >
                  {message ||
                    `This request has already been ${requestData.status.toLowerCase()}.`}
                </div>
              ) : (
                <form onSubmit={submit}>
                  <div className="divider" />

                  <h3 className="sectionTitle">
                    {decision ===
                    "approve"
                      ? "Approve Offset Approval"
                      : "Reject Offset Approval"}
                  </h3>

                  {decision ===
                  "approve" ? (
                    <label className="field">
                      <span className="label">
                        Approval
                        Comment
                      </span>

                      <textarea
                        className="textarea"
                        value={
                          approvalComment
                        }
                        onChange={(
                          event,
                        ) =>
                          setApprovalComment(
                            event.target
                              .value,
                          )
                        }
                        placeholder="Add an optional approval comment"
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span className="label">
                        Rejection
                        Reason *
                      </span>

                      <textarea
                        className="textarea"
                        value={
                          rejectionReason
                        }
                        onChange={(
                          event,
                        ) =>
                          setRejectionReason(
                            event.target
                              .value,
                          )
                        }
                        placeholder="Enter rejection reason"
                        required
                      />
                    </label>
                  )}

                  <button
                    className={`btn ${
                      decision ===
                      "approve"
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
                      : decision ===
                          "approve"
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
