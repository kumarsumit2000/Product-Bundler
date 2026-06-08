import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

// Admin-only: upload an image to Shopify Files and return its CDN URL.
//
// Three-step Shopify flow:
//   1. `stagedUploadsCreate` — Shopify hands us a presigned URL + headers
//      we POST/PUT the binary to (S3-like storage).
//   2. Upload the bytes to that URL using the returned parameters.
//   3. `fileCreate` with `originalSource = stagedTarget.resourceUrl` —
//      Shopify ingests the file and produces a MediaImage record. The
//      CDN URL is populated asynchronously, so we poll for up to ~6s
//      before giving up.

const FILE_CDN_POLL_INTERVAL_MS = 700;
const FILE_CDN_POLL_TIMEOUT_MS = 6000;

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { admin } = await authenticate.admin(request, ctx);

  if (!request.headers.get("content-type")?.startsWith("multipart/")) {
    return json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return json({ ok: false, error: "File is empty." }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return json({ ok: false, error: "File is larger than 20 MB." }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return json({ ok: false, error: "Only image files are supported." }, { status: 400 });
  }

  // Step 1: Ask Shopify where to stage the upload.
  const stagedRes = await admin.graphql(
    `#graphql
    mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename: file.name || "image",
            mimeType: file.type,
            httpMethod: "POST",
            resource: "FILE",
            fileSize: String(file.size),
          },
        ],
      },
    },
  );
  const stagedJson = (await stagedRes.json()) as {
    data?: {
      stagedUploadsCreate?: {
        stagedTargets?: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };
  const target = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
  const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors ?? [];
  if (!target || stagedErrors.length > 0) {
    console.error("[upload-image] stagedUploadsCreate failed:", stagedErrors);
    return json({ ok: false, error: stagedErrors[0]?.message ?? "Couldn't stage upload." }, { status: 502 });
  }

  // Step 2: POST the bytes to the stage URL with the parameters Shopify
  // returned. The parameters include the key, content-type, policy, and
  // signature; they must be sent before the file field.
  const uploadForm = new FormData();
  for (const { name, value } of target.parameters) uploadForm.append(name, value);
  uploadForm.append("file", file, file.name || "image");

  const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    console.error("[upload-image] stage POST failed:", uploadRes.status, text.slice(0, 300));
    return json({ ok: false, error: `Upload failed (${uploadRes.status}).` }, { status: 502 });
  }

  // Step 3: Tell Shopify to ingest the staged file as a Files record.
  const createRes = await admin.graphql(
    `#graphql
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          fileStatus
          ... on MediaImage { image { url } }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        files: [
          {
            contentType: "IMAGE",
            originalSource: target.resourceUrl,
            alt: file.name || "Uploaded image",
          },
        ],
      },
    },
  );
  const createJson = (await createRes.json()) as {
    data?: {
      fileCreate?: {
        files?: Array<{ id: string; fileStatus: string; image?: { url?: string } }>;
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };
  const created = createJson.data?.fileCreate?.files?.[0];
  const createErrors = createJson.data?.fileCreate?.userErrors ?? [];
  if (!created || createErrors.length > 0) {
    console.error("[upload-image] fileCreate failed:", createErrors);
    return json({ ok: false, error: createErrors[0]?.message ?? "Shopify rejected the file." }, { status: 502 });
  }

  // Step 3b: poll until the file finishes processing. Shopify renders
  // the MediaImage.image.url asynchronously, so a fresh fileCreate often
  // returns null for the URL on the first call.
  if (created.image?.url) {
    return json({ ok: true, url: created.image.url });
  }

  const fileId = created.id;
  const deadline = Date.now() + FILE_CDN_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, FILE_CDN_POLL_INTERVAL_MS));
    const pollRes = await admin.graphql(
      `#graphql
      query FileNode($id: ID!) {
        node(id: $id) {
          ... on MediaImage { fileStatus image { url } }
        }
      }`,
      { variables: { id: fileId } },
    );
    const pollJson = (await pollRes.json()) as {
      data?: { node?: { fileStatus?: string; image?: { url?: string } } };
    };
    const url = pollJson.data?.node?.image?.url;
    if (url) return json({ ok: true, url });
    if (pollJson.data?.node?.fileStatus === "FAILED") {
      return json({ ok: false, error: "Shopify failed to process the image." }, { status: 502 });
    }
  }

  // Timed out waiting for the CDN URL — fall back to the resourceUrl so
  // the merchant at least has something to use (it will resolve once
  // Shopify finishes processing). They can re-save later to pick up the
  // permanent CDN URL.
  return json({ ok: true, url: target.resourceUrl, fileId });
}
