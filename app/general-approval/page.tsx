"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { upload } from "@vercel/blob/client";

type Employee = {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveApprovalGroup: string;
};

type Category =
  | "Item Release"
  | "Equipment"
  | "Purchase"
  | "Budget Request"
  | "Other";

async function readJsonSafely(
  response: Response,
) {
  const text =
    await response.text();

  try {
    return text
      ? JSON.parse(text)
      : {};
  } catch {
    return {
      error:
        response.status === 413
          ? "The request was too large. Please try again."
          : text ||
            "Unexpected server response.",
    };
  }
}

export default function GeneralApprovalPage() {
  const [loading, setLoading] =
    useState(true);
  const [employee, setEmployee] =
    useState<Employee | null>(
      null,
    );
  const [
    requestCategory,
    setRequestCategory,
  ] =
    useState<Category>(
      "Item Release",
    );
  const [
    requestTitle,
    setRequestTitle,
  ] = useState("");
  const [
    requestDetails,
    setRequestDetails,
  ] = useState("");
  const [
    amountBudget,
    setAmountBudget,
  ] = useState("");
  const [
    attachment,
    setAttachment,
  ] =
    useState<File | null>(
      null,
    );
  const [
    uploadProgress,
    setUploadProgress,
  ] = useState(0);
  const [busy, setBusy] =
    useState(false);
  const [status, setStatus] =
    useState("");
  const [
    statusKind,
    setStatusKind,
  ] = useState<
    | "normal"
    | "error"
    | "success"
  >("normal");
  const [
    submittedId,
    setSubmittedId,
  ] = useState("");
  const [
    actualApprovalGroup,
    setActualApprovalGroup,
  ] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", {
      cache: "no-store",
    })
      .then((response) =>
        response.json(),
      )
      .then((data) => {
        if (data.authenticated) {
          setEmployee(
            data.employee,
          );
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
    setUploadProgress(0);

    try {
      if (!employee) {
        throw new Error(
          "Please verify your identity again.",
        );
      }

      if (
        attachment &&
        attachment.size >
          30 * 1024 * 1024
      ) {
        throw new Error(
          "Attachment must be 30 MB or smaller.",
        );
      }

      let blobPathname = "";
      let attachmentName = "";
      let attachmentType = "";

      if (attachment) {
        setStatus(
          "Uploading attachment…",
        );
        setStatusKind(
          "normal",
        );

        const blob =
          await upload(
            `approvals-temp/${employee.employeeId}/${Date.now()}-${attachment.name}`,
            attachment,
            {
              access: "private",
              handleUploadUrl:
                "/api/approval-attachment-upload",
              multipart: true,
              onUploadProgress: (
                progress,
              ) => {
                setUploadProgress(
                  Math.round(
                    progress.percentage,
                  ),
                );
              },
            },
          );

        blobPathname =
          blob.pathname;
        attachmentName =
          attachment.name;
        attachmentType =
          attachment.type ||
          blob.contentType ||
          "application/octet-stream";
      }

      setStatus(
        "Submitting General Approval…",
      );
      setStatusKind("normal");

      const form =
        new FormData();

      form.set(
        "requestCategory",
        requestCategory,
      );
      form.set(
        "requestTitle",
        requestTitle,
      );
      form.set(
        "requestDetails",
        requestDetails,
      );
      form.set(
        "amountBudget",
        amountBudget,
      );

      if (blobPathname) {
        form.set(
          "attachmentBlobPathname",
          blobPathname,
        );
        form.set(
          "attachmentName",
          attachmentName,
        );
        form.set(
          "attachmentType",
          attachmentType,
        );
      }

      const response =
        await fetch(
          "/api/general-approval",
          {
            method: "POST",
            body: form,
          },
        );

      const data =
        await readJsonSafely(
          response,
        );

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to submit General Approval request.",
        );
      }

      setSubmittedId(
        data.requestId,
      );
      setActualApprovalGroup(
        data.approvalGroup ||
          employee.leaveApprovalGroup ||
          "",
      );
      setStatus(
        "General Approval request submitted for approval.",
      );
      setStatusKind(
        "success",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to submit General Approval request.",
      );
      setStatusKind(
        "error",
      );
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="wrap">
          <div className="card">
            Loading General
            Approval…
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
                General Approval
                request
              </p>
            </div>
          </div>

          <div className="card">
            <h2 className="sectionTitle">
              Sign in first
            </h2>
            <p className="muted">
              Please verify your
              identity from the main
              Approvals page before
              filing a General
              Approval.
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
                General Approval
                request
              </p>
            </div>
          </div>

          <div className="card successPanel">
            <div className="successIcon">
              ✓
            </div>

            <h2 className="sectionTitle">
              General Approval
              submitted
            </h2>

            <p className="muted">
              Your request has been
              sent to the{" "}
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
                  setRequestCategory(
                    "Item Release",
                  );
                  setRequestTitle("");
                  setRequestDetails("");
                  setAmountBudget("");
                  setAttachment(null);
                  setStatus("");
                }}
              >
                File another General
                Approval
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
    <main className="shell">
      <div className="wrap">
        <div className="brand">
          <div className="brandMark">
            A
          </div>
          <div>
            <h1>Approvals</h1>
            <p>
              General Approval
              request
            </p>
          </div>
        </div>

        <div className="card">
          <div className="between">
            <div>
              <h2 className="sectionTitle">
                New General Approval
              </h2>
              <p className="muted">
                Your approval group is
                automatically taken
                from your employee
                record.
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
              {
                employee.employeeName
              }
            </strong>
            <div className="small">
              {
                employee.employeeId
              }{" "}
              •{" "}
              {employee.department ||
                "Employee"}
            </div>
            <div
              className="small"
              style={{
                marginTop: 10,
              }}
            >
              Approval Group:{" "}
              <strong>
                {
                  employee.leaveApprovalGroup
                }
              </strong>
            </div>
          </div>

          <form onSubmit={submit}>
            <label className="field">
              <span className="label">
                Request Category *
              </span>
              <select
                className="select"
                value={
                  requestCategory
                }
                onChange={(
                  event,
                ) =>
                  setRequestCategory(
                    event.target
                      .value as Category,
                  )
                }
                required
              >
                <option>
                  Item Release
                </option>
                <option>
                  Equipment
                </option>
                <option>
                  Purchase
                </option>
                <option>
                  Budget Request
                </option>
                <option>
                  Other
                </option>
              </select>
            </label>

            <label className="field">
              <span className="label">
                Request Title *
              </span>
              <input
                className="input"
                value={
                  requestTitle
                }
                onChange={(
                  event,
                ) =>
                  setRequestTitle(
                    event.target
                      .value,
                  )
                }
                placeholder="Enter a short request title"
                required
              />
            </label>

            <label className="field">
              <span className="label">
                Amount / Budget
              </span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={
                  amountBudget
                }
                onChange={(
                  event,
                ) =>
                  setAmountBudget(
                    event.target
                      .value,
                  )
                }
                placeholder="Optional"
              />
              <div
                className="small"
                style={{
                  marginTop: 5,
                }}
              >
                Optional.
              </div>
            </label>

            <label className="field">
              <span className="label">
                Request Details *
              </span>
              <textarea
                className="textarea"
                value={
                  requestDetails
                }
                onChange={(
                  event,
                ) =>
                  setRequestDetails(
                    event.target
                      .value,
                  )
                }
                placeholder="Describe what needs approval, why it is needed, and any important details"
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
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                disabled={busy}
                onChange={(
                  event,
                ) => {
                  const file =
                    event.target
                      .files?.[0] ||
                    null;

                  if (
                    file &&
                    file.size >
                      10 *
                        1024 *
                        1024
                  ) {
                    setAttachment(
                      null,
                    );
                    event.currentTarget.value =
                      "";
                    setStatus(
                      "Attachment must be 30 MB or smaller.",
                    );
                    setStatusKind(
                      "error",
                    );
                    return;
                  }

                  setAttachment(
                    file,
                  );
                  setStatus("");
                }}
              />
              <div
                className="small"
                style={{
                  marginTop: 5,
                }}
              >
                Optional. Image, PDF,
                Word, Excel,
                PowerPoint, or text
                file. Maximum 30 MB.
              </div>
            </label>

            {busy &&
              attachment &&
              uploadProgress >
                0 && (
                <div
                  className="small"
                  style={{
                    marginTop: 8,
                  }}
                >
                  Uploading
                  attachment:{" "}
                  {uploadProgress}%
                </div>
              )}

            <div className="divider" />

            <button
              className="btn btnPrimary"
              disabled={busy}
              style={{
                width: "100%",
              }}
            >
              {busy
                ? status ||
                  "Submitting…"
                : "Submit General Approval"}
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
  );
}
