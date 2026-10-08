import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { sendMessage } from "@/server/assistant";
import { readUploads, UploadError } from "@/server/storage";

export const dynamic = "force-dynamic";

const jsonBody = z.object({ text: z.string().max(10_000).default("") });

/**
 * Post a message to a chat. JSON { text } for plain messages; multipart with a `text` field
 * and up to 3 `file` parts when pictures are attached. The answer and any proposals come back
 * in the same response.
 */
export const POST = handler<{ id: string }>({ permission: "assistant:use" }, async ({ principal, request, params }) => {
  let text = "";
  let files: File[] = [];
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    let upload;
    try {
      upload = await readUploads(request, 3);
    } catch (e) {
      if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
      throw e;
    }
    text = upload.fields.text ?? "";
    files = upload.files;
  } else {
    text = (await parseBody(request, jsonBody)).text;
  }
  try {
    return await sendMessage(principal, params.id, text, files, request);
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
});
