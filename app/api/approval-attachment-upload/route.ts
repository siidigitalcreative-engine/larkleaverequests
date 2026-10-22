import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const runtime = "nodejs";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const body =
    (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname) => {
        const session = verifySessionToken(
          cookies().get(SESSION_COOKIE_NAME)?.value,
        );

        if (!session) {
          throw new Error(
            "Please verify your identity again.",
          );
        }

        const requiredPrefix =
          `approvals-temp/${session.employeeId}/`;

        if (!pathname.startsWith(requiredPrefix)) {
          throw new Error(
            "Invalid attachment upload path.",
          );
        }

        return {
          allowedContentTypes: [
            "image/*",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
          ],
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            employeeId: session.employeeId,
          }),
        };
      },

      onUploadCompleted: async ({
        blob,
        tokenPayload,
      }) => {
        // The approval submission endpoint will fetch this
        // temporary private blob, upload it to Lark, then
        // delete it from Vercel Blob.
        console.log(
          "Temporary approval attachment uploaded:",
          blob.pathname,
          tokenPayload,
        );
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare attachment upload.",
      },
      { status: 400 },
    );
  }
}
