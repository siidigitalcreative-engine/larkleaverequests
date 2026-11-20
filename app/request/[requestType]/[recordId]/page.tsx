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

type Detail = {
  label: string;
  value: string;
};

type RequestView = {
  recordId: string;
  requestType: string;
  source: string;
  requestId: string;
  title: string;
  employeeName: string;
  employeeId: string;
  department: string;
  approvalGroup: string;
  status: string;
  submittedAtText: string;
  approvalComment: string;
  rejectionReason: string;
  comments: string;
  attachments: Attachment[];
  details: Detail[];
  descriptionLabel: string;
  description: string;
};

function likelyImage(item: Attachment) {
  if (item.type?.toLowerCase().startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(
    item.name || "",
  );
}

function attachmentUrl(
  item: Attachment,
  requestData: RequestView,
) {
  return (
    `/api/attachment/${encodeURIComponent(item.fileToken)}` +
    `?source=${encodeURIComponent(requestData.source)}` +
    `&recordId=${encodeURIComponent(requestData.recordId)}` +
    `&name=${encodeURIComponent(item.name || "attachment")}`
  );
}

export default function SharedRequestPage() {
  const params = useParams<{
    requestType: string;
    recordId: string;
  }>();

  const search = useSearchParams();
  const token = search.get("token") || "";

  const [requestData, setRequestData] =
    useState<RequestView | null>(null);

  const [message, setMessage] =
    useState("Loading request…");

  const [copied, setCopied] =
    useState(false);

  const [commenterName, setCommenterName] =
    useState("");

  const [comment, setComment] =
    useState("");

  const [commentBusy, setCommentBusy] =
    useState(false);

  const [commentMessage, setCommentMessage] =
    useState("");

  async function loadRequest() {
    try {
      const response = await fetch(
        `/api/request-view/${encodeURIComponent(
          params.requestType,
        )}/${encodeURIComponent(
          params.recordId,
        )}?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load request.",
        );
      }

      setRequestData(data.request);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load request.",
      );
    }
  }

  useEffect(() => {
    void loadRequest();
  }, [
    params.recordId,
    params.requestType,
    token,
  ]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        window.location.href,
      );

      setCopied(true);

      window.setTimeout(
        () => setCopied(false),
        1800,
      );
    } catch {
      window.prompt(
        "Copy this request link:",
        window.location.href,
      );
    }
  }

  async function submitComment(
    event: FormEvent,
  ) {
    event.preventDefault();

    const name =
      commenterName.trim();

    const body =
      comment.trim();

    if (name.length < 2) {
      setCommentMessage(
        "Please enter your name.",
      );
      return;
    }

    if (!body) {
      setCommentMessage(
        "Please enter a comment.",
      );
      return;
    }

    setCommentBusy(true);
    setCommentMessage("");

    try {
      const response = await fetch(
        `/api/request-view/${encodeURIComponent(
          params.requestType,
        )}/${encodeURIComponent(
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
            commenterName: name,
            comment: body,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to add comment.",
        );
      }

      setComment("");

      setCommentMessage(
        "Comment added successfully.",
      );

      setRequestData(
        (current) =>
          current
            ? {
                ...current,
                comments:
                  typeof data.comments === "string"
                    ? data.comments
                    : current.comments,
              }
            : current,
      );
    } catch (error) {
      setCommentMessage(
        error instanceof Error
          ? error.message
          : "Unable to add comment.",
      );
    } finally {
      setCommentBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="wrap">
        <div className="brand">
          <div className="brandMark">A</div>

          <div>
            <h1>Approvals</h1>
            <p>Shared request view</p>
          </div>
        </div>

        <div className="card">
          {!requestData ? (
            <div
              className={
                message &&
                message !== "Loading request…"
                  ? "status error"
                  : "muted"
              }
            >
              {message}
            </div>
          ) : (
            <>
              <div
                className="between"
                style={{
                  alignItems: "flex-start",
                  gap: 14,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    className="small"
                    style={{ marginBottom: 5 }}
                  >
                    {requestData.requestId}
                  </div>

                  <h2
                    className="sectionTitle"
                    style={{ marginBottom: 4 }}
                  >
                    {requestData.title}
                  </h2>

                  <div className="small">
                    {requestData.employeeName}
                    {requestData.employeeId
                      ? ` • ${requestData.employeeId}`
                      : ""}
                  </div>
                </div>

                <span
                  className={`pill ${requestData.status.toLowerCase()}`}
                >
                  {requestData.status}
                </span>
              </div>

              <div
                className="row"
                style={{
                  marginTop: 16,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn btnGhost"
                  type="button"
                  onClick={copyLink}
                >
                  {copied
                    ? "Link Copied"
                    : "Copy Link"}
                </button>
              </div>

              <div className="divider" />

              <div className="reviewFacts">
                <div className="fact">
                  <strong>Date Filed</strong>
                  <div>
                    {requestData.submittedAtText}
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
                  <div>
                    {requestData.approvalGroup || "—"}
                  </div>
                </div>

                {requestData.details.map(
                  (detail) => (
                    <div
                      className="fact"
                      key={detail.label}
                    >
                      <strong>
                        {detail.label}
                      </strong>
                      <div>
                        {detail.value}
                      </div>
                    </div>
                  ),
                )}
              </div>

              {requestData.description && (
                <div className="field">
                  <span className="label">
                    {requestData.descriptionLabel}
                  </span>

                  <div
                    className="fact"
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.55,
                    }}
                  >
                    {requestData.description}
                  </div>
                </div>
              )}

              {requestData.attachments?.length > 0 && (
                <div className="field">
                  <span className="label">
                    Attachments
                  </span>

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {requestData.attachments.map(
                      (item) => {
                        const url =
                          attachmentUrl(
                            item,
                            requestData,
                          );

                        return (
                          <div
                            className="fact"
                            key={item.fileToken}
                            style={{
                              overflow: "hidden",
                            }}
                          >
                            {likelyImage(item) && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
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
                                marginTop:
                                  likelyImage(item)
                                    ? 10
                                    : 0,
                              }}
                            >
                              <div
                                className="small"
                                style={{
                                  fontWeight: 700,
                                  wordBreak: "break-word",
                                }}
                              >
                                {item.name ||
                                  "Attachment"}
                              </div>

                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btnGhost"
                                style={{
                                  textDecoration: "none",
                                }}
                              >
                                View
                              </a>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              )}

              {requestData.status === "Approved" &&
                requestData.approvalComment && (
                  <div
                    className="status success"
                    style={{
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <strong>
                      Approval Comment
                    </strong>
                    <br />
                    {requestData.approvalComment}
                  </div>
                )}

              {requestData.status === "Rejected" &&
                requestData.rejectionReason && (
                  <div
                    className="status error"
                    style={{
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <strong>
                      Rejection Reason
                    </strong>
                    <br />
                    {requestData.rejectionReason}
                  </div>
                )}

              <div className="divider" />

              <div className="field">
                <span className="label">
                  Comments
                </span>

                <div
                  className="fact"
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {requestData.comments ||
                    "No comments yet."}
                </div>
              </div>

              <form
                onSubmit={submitComment}
                style={{
                  marginTop: 18,
                }}
              >
                <h3 className="sectionTitle">
                  Add Comment
                </h3>

                <p className="muted">
                  Anyone with this shared
                  request link can add a
                  comment. Approval and
                  rejection actions remain
                  disabled.
                </p>

                <label className="field">
                  <span className="label">
                    Your Name *
                  </span>

                  <input
                    className="input"
                    value={commenterName}
                    onChange={(event) =>
                      setCommenterName(
                        event.target.value,
                      )
                    }
                    placeholder="Enter your name"
                    maxLength={100}
                    required
                  />
                </label>

                <label className="field">
                  <span className="label">
                    Comment *
                  </span>

                  <textarea
                    className="textarea"
                    value={comment}
                    onChange={(event) =>
                      setComment(
                        event.target.value,
                      )
                    }
                    placeholder="Write a comment..."
                    maxLength={4000}
                    required
                  />
                </label>

                <button
                  className="btn btnPrimary"
                  type="submit"
                  disabled={commentBusy}
                  style={{
                    width: "100%",
                  }}
                >
                  {commentBusy
                    ? "Sending…"
                    : "Add Comment"}
                </button>
              </form>

              {commentMessage && (
                <div
                  className={`status ${
                    commentMessage ===
                    "Comment added successfully."
                      ? "success"
                      : "error"
                  }`}
                  style={{
                    marginTop: 12,
                  }}
                >
                  {commentMessage}
                </div>
              )}

              <div
                className="small"
                style={{
                  marginTop: 18,
                  color: "#667085",
                }}
              >
                This shared request does
                not allow approval or
                rejection actions.
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
