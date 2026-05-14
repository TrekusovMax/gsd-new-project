# Domain Pitfalls: PDF Compression Web App

**Domain:** PDF processing web app — Next.js App Router + TypeScript on Vercel serverless
**Researched:** 2026-05-14
**Sources:** Vercel official docs (last updated 2026-02-27), Next.js official docs (last updated 2026-05-13)

---

## Critical Pitfalls

Mistakes that cause silent failures, broken deployments, or full rewrites.

---

### Pitfall 1: Routing the PDF Upload Through a Serverless Function

**What goes wrong:** The file bytes are sent as a multipart POST body to a Next.js Route Handler (`/api/compress`). Vercel hard-caps the request body at **4.5 MB** regardless of plan or `maxDuration` setting. Any PDF larger than 4.5 MB returns HTTP 413 `FUNCTION_PAYLOAD_TOO_LARGE` before your code even runs.

**Why it happens:** Developers assume "big memory = big request". The 4.5 MB cap is a Vercel infrastructure limit, not a Node.js or Next.js limit. It applies to the HTTP request body arriving at the function, before any user code executes. Increasing `maxDuration` or memory tier does not change it.

**Consequences:** The upload silently fails (or gives a generic error) for the majority of real-world PDFs. Scanned documents and presentation PDFs routinely exceed 20–100 MB. The app is unusable for its core purpose.

**Prevention:** Use Vercel Blob's client-upload pattern. The browser uploads directly to Vercel Blob object storage using a short-lived token issued by a lightweight server endpoint. The file never passes through the function body. After the upload, a second function call references the Blob URL, downloads the file within the function, compresses it, and returns or stores the result. This is Vercel's documented recommended pattern for file uploads.

**Warning sign:** Testing only with small "test.pdf" files (< 1 MB) during development masks this entirely.

**Phase:** Must be addressed in Phase 1 (upload infrastructure). Retrofitting this later requires changing the entire upload flow.

---

### Pitfall 2: Ghostscript Binary Dependency on Vercel

**What goes wrong:** Many PDF compression tutorials (and several npm packages) rely on Ghostscript (`gs` binary) for high-quality compression, calling it via `child_process.spawn` or a wrapper like `ghostscript4js`. Vercel's Node.js runtime runs in a read-only microVM filesystem. No system binaries (`gs`, `imagemagick`, etc.) are available. The binary call fails at runtime with `ENOENT` or `spawn error`.

**Why it happens:** The pattern works on traditional Linux servers or Docker containers where `apt-get install ghostscript` is possible. Developers copy examples written for those environments without checking the Vercel filesystem model.

**Consequences:** The entire compression function crashes at runtime. The error only appears in production (Vercel) because local development has the system binary installed. This is a deployment-time surprise.

**Prevention:** Use only pure-JavaScript or WASM PDF libraries. `pdf-lib` (pure JS, runs in any Node.js environment with no native deps) is the correct choice for structural compression (removing redundant objects, downsampling metadata). For image recompression within PDFs, `sharp` is safe — Vercel's official documentation auto-opts it out of webpack bundling via `serverExternalPackages`. Do not attempt to bundle a Ghostscript binary into the function; at 250 MB max bundle size (gzipped), the binary would likely breach the limit and cause a build failure.

**Warning sign:** Running `which gs` returns a path on your dev machine. If it does, you have an implicit binary dependency.

**Phase:** Must be validated in Phase 1 (library selection). Discovered after deployment, it requires a library swap.

---

### Pitfall 3: Server Action Body Limit for File Uploads

**What goes wrong:** Using a Next.js Server Action (with `'use server'`) to handle the file upload instead of a Route Handler. The Server Actions `bodySizeLimit` defaults to **1 MB**. This is separate from, and stricter than, the 4.5 MB Vercel function body limit. A 2 MB PDF triggers a silent failure before the action runs.

**Why it happens:** Server Actions look ergonomic for form submissions. Developers don't notice the 1 MB default because it isn't surfaced as an obvious error — the form just fails.

**Consequences:** Even small PDFs (2–5 MB) fail upload. Can be partially worked around with `serverActions.bodySizeLimit` in `next.config.js`, but the 4.5 MB Vercel hard cap still applies above that. Server Actions are the wrong tool for binary file uploads regardless of the limit setting.

**Prevention:** Use a Route Handler (`POST` in `app/api/compress/route.ts`) or the Vercel Blob client-upload pattern for all file ingestion. Never funnel binary files through a Server Action.

**Warning sign:** The upload form uses `action={serverAction}` rather than `onSubmit` with a fetch to a Route Handler.

**Phase:** Phase 1 architecture decision. Lock down the upload method before building anything else.

---

### Pitfall 4: PDF Fully Loaded Into Memory (No Streaming)

**What goes wrong:** `pdf-lib` (and virtually every pure-JS PDF library) loads the entire PDF into a `Uint8Array` in memory to parse and manipulate it. A 50 MB PDF expands to 3–5x that size in the parsed object tree. On a 2 GB Vercel function (default for all plans), processing three concurrent 50 MB PDFs could exhaust available memory and cause the function to be killed with no user-facing error.

**Why it happens:** PDF manipulation libraries are not designed for streaming — the format requires random access to cross-reference tables and object streams. There is no incremental/streaming processing model for full-document operations.

**Consequences:** OOM kills are silent. Vercel returns a 500 with no useful message. The user sees a generic error with no indication the file was too large. Repeated OOM can cause cascading cold starts.

**Prevention:**
- Enforce a hard file size limit at upload time (recommended: 50 MB for Hobby plan, 100 MB for Pro) with a clear user error message.
- For Hobby (2 GB RAM, non-configurable): do not allow files above ~40 MB without upgrading the plan.
- For Pro/Enterprise: upgrade to 4 GB / 2 vCPU via the dashboard (not configurable in `vercel.json`).
- Track memory usage in observability dashboards and set alerts at 80% memory.

**Warning sign:** No file size validation exists before the PDF is passed to the processing library.

**Phase:** Phase 1 (upload validation). Phase 2 (processing) must respect the enforced limit.

---

### Pitfall 5: /tmp Is Shared and Not Guaranteed to Persist

**What goes wrong:** Writing temp files to `/tmp` during processing and assuming they persist between function invocations. Vercel's `/tmp` scratch space is **500 MB** and is tied to a single function instance. Two concurrent compression jobs from different users may share the same instance and `/tmp` namespace. A job that writes `output.pdf` to `/tmp/output.pdf` can collide with another job writing the same filename.

**Why it happens:** Developers write temp files without namespacing them, following patterns from monolithic server examples where each request gets an isolated thread/process.

**Consequences:** File corruption (one user's compressed PDF is overwritten by another's), incorrect outputs returned to the wrong user, or `/tmp` filling up (500 MB total) and causing `ENOSPC` errors.

**Prevention:**
- Always namespace temp files: `path.join(os.tmpdir(), crypto.randomUUID() + '-output.pdf')`.
- Delete temp files explicitly at the end of every request, including error paths, using `try/finally`.
- Prefer in-memory processing (return `Buffer` directly) over writing to `/tmp` where possible — avoids the shared filesystem problem entirely.
- Never use fixed filenames like `input.pdf` or `output.pdf` in `/tmp`.

**Warning sign:** Any occurrence of `fs.writeFile('/tmp/output.pdf', ...)` or similar fixed-path writes.

**Phase:** Phase 2 (compression processing). Every function that touches `/tmp` must use UUIDs.

---

## Moderate Pitfalls

---

### Pitfall 6: maxDuration Not Set on the Compression Route

**What goes wrong:** The compression Route Handler runs with the default `maxDuration` of 300 seconds (5 minutes). This seems generous, but the default isn't the problem — the problem is not setting it at all. Without an explicit `export const maxDuration`, the function's duration is opaque during code review, and future developers don't know the expected processing window.

More critically: if the project ever moves to a different infrastructure or the Vercel defaults change, there is no explicit contract.

**Why it happens:** `maxDuration` is optional and the default is currently permissive (300s with Fluid Compute on all plans).

**Prevention:** Explicitly declare `export const maxDuration = 60` (or whatever is appropriate for the expected file size limit) in every Route Handler that does CPU-bound work. This documents intent, prevents silent extension if a future change resets defaults, and allows the Vercel dashboard to alert on timeouts correctly.

**Warning sign:** No `maxDuration` export in `app/api/compress/route.ts`.

**Phase:** Phase 2 (compression route implementation).

---

### Pitfall 7: WASM Module Not Excluded from Next.js Webpack Bundling

**What goes wrong:** Some PDF processing libraries ship with WASM components (e.g., `pdfium-render`, `@cantoo/pdf-lib`). Next.js App Router bundles server-side code with webpack by default. Webpack does not handle `.wasm` files or native `.node` binaries correctly without additional configuration. The result is a build error or a silent runtime failure where the WASM module is missing.

**Why it happens:** The library's npm page works fine in a plain Node.js script but fails in a webpack-bundled Next.js environment.

**Prevention:**
- Check if the library is in Next.js's built-in `serverExternalPackages` auto-list (verified: `sharp` is included; most PDF libraries are not).
- Add any PDF library that uses WASM or native bindings to `serverExternalPackages` in `next.config.ts`.
- Test in a production build (`next build && next start`) before committing to a library, not just in `next dev` (dev mode uses a different module resolution path that can mask this).

**Warning sign:** `next dev` works but `next build` fails with webpack errors mentioning `.wasm` or `.node` files.

**Phase:** Phase 1 (library integration spike). Run a production build test before locking in the stack.

---

### Pitfall 8: Missing Content-Type Validation on the Upload Endpoint

**What goes wrong:** The upload endpoint accepts any file, not just PDFs. Users (or attackers) can upload executable scripts, HTML files, or malformed data. If the processing library tries to parse a non-PDF as a PDF, the error cascade can be unpredictable (crash, hang, or partial output returned as a "compressed PDF").

**Why it happens:** MIME type validation feels like polish, so it gets deferred or forgotten.

**Consequences:**
- Security: an SVG with embedded script tags uploaded as a "PDF" and served back to users creates an XSS vector if served with `Content-Type: application/pdf` (browsers may sniff the type).
- Stability: malformed input causes unhandled exceptions in the compression library.
- Abuse: without file type gates, the endpoint can be used to run arbitrary processing workloads (CPU/memory exhaustion).

**Prevention:**
- Validate MIME type from the `Content-Type` field of the FormData part (not the file extension, which is user-controlled).
- Additionally, check the PDF magic bytes (`%PDF-`) in the first 4 bytes of the uploaded buffer before passing to the processing library.
- Return HTTP 400 immediately on invalid type.

**Warning sign:** No MIME type check exists in the upload route handler before passing the buffer to the compression library.

**Phase:** Phase 1 (upload endpoint). Non-negotiable before any public exposure.

---

### Pitfall 9: Path Traversal via Filename

**What goes wrong:** If the original filename from the upload (e.g., `../../etc/passwd.pdf`) is used anywhere in a file path — including for naming output files in `/tmp` — a path traversal attack is possible.

**Why it happens:** Taking `file.name` from FormData and using it directly in `path.join('/tmp', file.name)` is the first instinct when naming output files.

**Prevention:**
- Never use user-supplied filenames in filesystem paths. Always generate a UUID for the temp file path.
- If you need to preserve the original filename for the download response, return it only in the `Content-Disposition` header after sanitizing it (strip all `../`, `/`, and non-ASCII characters).
- Sanitization: `filename.replace(/[^a-zA-Z0-9._-]/g, '_')`.

**Warning sign:** `path.join('/tmp', req.body.filename)` or `path.join('/tmp', file.name)` anywhere in the codebase.

**Phase:** Phase 1 (upload) and Phase 2 (compression output). Security review checklist item.

---

### Pitfall 10: Progress Bar That Lies

**What goes wrong:** A progress bar is shown during upload/compression that advances on a timer or in fixed increments, not based on actual progress. The bar reaches 95% and then stalls for 10–30 seconds while the server finishes compression. Users assume the app has crashed and close the tab, abandoning successful operations.

**Why it happens:** Real progress reporting for server-side PDF compression is hard. There is no streaming feedback from `pdf-lib`'s synchronous compression pass. Developers show a fake progress bar rather than explain the wait.

**Consequences:** High bounce rates during compression. Users close the tab, then re-upload and re-compress, wasting server resources.

**Prevention:**
- For the upload phase, use the `XMLHttpRequest.upload.onprogress` event (or the `fetch` `ReadableStream` approach) to report real byte-transfer progress.
- For the compression phase on the server (where real progress is unavailable): use a two-phase UI: "Uploading... [real progress]" then "Compressing... [spinner, not a bar]". Never show a fake percentage for the server-side step.
- Display estimated processing time based on file size (e.g., "Large files may take up to 30 seconds").

**Warning sign:** `setInterval(() => setProgress(p => p + 5), 200)` or any timer-driven progress increment in the client code.

**Phase:** Phase 3 (UI/UX). Catches most user-trust failures.

---

### Pitfall 11: Download Trigger Broken in Safari / Mobile

**What goes wrong:** Triggering the download of the compressed PDF by creating a blob URL and programmatically clicking an `<a>` element with `download` attribute works in Chrome and Firefox but fails in Safari (desktop) or is unreliable on iOS. Safari blocks programmatic click-triggered downloads on blob URLs in certain contexts.

**Why it happens:** The blob URL download pattern is treated as a popup in Safari and may be blocked. On iOS, the browser opens the PDF in a viewer instead of downloading it.

**Consequences:** Safari users (significant share on mobile) cannot get their compressed file. They see either nothing happening or the PDF opening in a new tab without a download prompt.

**Prevention:**
- Return the compressed PDF as a direct HTTP response from the compression Route Handler with `Content-Disposition: attachment; filename="compressed.pdf"` and `Content-Type: application/pdf`. Let the browser handle download natively rather than constructing a blob URL on the client.
- Test the download flow on iOS Safari and Safari on macOS as part of the definition of done.
- If a blob URL is unavoidable (e.g., client-side processing result), use `<a href={blobUrl} download="compressed.pdf">` with a visible button rather than a programmatic `.click()` call.

**Warning sign:** Download logic uses `document.createElement('a'); a.href = URL.createObjectURL(blob); a.click()` without a fallback.

**Phase:** Phase 3 (download UX). Test on real devices, not just desktop Chrome.

---

### Pitfall 12: No Cleanup of Temp Files on Error Paths

**What goes wrong:** The compression function writes to `/tmp`, succeeds on the happy path, and deletes the temp file after returning the response. But if an exception is thrown mid-processing, the `finally` block is missing, and temp files accumulate. Since `/tmp` is shared across the instance's lifetime, repeated failures can fill the 500 MB scratch space, causing `ENOSPC` errors on subsequent requests.

**Why it happens:** Error handling is added after the happy path works. The cleanup line gets added inside the `try` block, not in `finally`.

**Prevention:**
- Always use `try/finally` for temp file cleanup:
  ```ts
  const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.pdf`);
  try {
    await fs.writeFile(tmpPath, inputBuffer);
    // ... processing ...
  } finally {
    await fs.unlink(tmpPath).catch(() => {}); // swallow unlink errors
  }
  ```
- Prefer in-memory processing (Buffer → Buffer) to avoid `/tmp` entirely where the library supports it.

**Warning sign:** `fs.unlink` calls appear only in the success path, not in a `finally` block.

**Phase:** Phase 2 (compression processing).

---

### Pitfall 13: Browser Memory Exhaustion on Large Files (Client-Side Preview)

**What goes wrong:** If the app renders a PDF preview in the browser (using PDF.js or similar) before or after compression, loading a 100 MB PDF into `ArrayBuffer` in the browser tab can exhaust mobile browser memory and crash the tab. Chrome on mobile typically allows 512 MB–1 GB per tab; a 100 MB PDF can expand to 500 MB+ in the parsed representation.

**Why it happens:** Desktop testing on high-RAM machines never triggers the problem. Mobile devices have much tighter browser memory limits.

**Prevention:**
- For PDF preview: render only the first page at reduced resolution as a preview thumbnail, not the full document.
- If showing a full preview is a product requirement, use PDF.js's range request feature to load pages on demand rather than the full document at once.
- After compression completes, release the original ArrayBuffer with `buffer = null` before creating the compressed blob to avoid holding both in memory simultaneously.

**Warning sign:** `new Uint8Array(await file.arrayBuffer())` followed immediately by a PDF preview render using the same data.

**Phase:** Phase 3 (UI/UX and client-side rendering).

---

## Minor Pitfalls

---

### Pitfall 14: Exposing the BLOB_READ_WRITE_TOKEN in Client Components

**What goes wrong:** The Vercel Blob `BLOB_READ_WRITE_TOKEN` environment variable (which grants full write access to the Blob store) is accidentally included in a `NEXT_PUBLIC_` variable or referenced in a Client Component. This leaks the token to the browser.

**Prevention:** Only reference `BLOB_READ_WRITE_TOKEN` in server-side code (Route Handlers, Server Actions). Never prefix it with `NEXT_PUBLIC_`. The client-upload pattern uses a short-lived token generated by the `handleUpload` SDK — the read-write token never leaves the server.

**Phase:** Phase 1 (upload infrastructure). Reviewed in security checklist.

---

### Pitfall 15: Vercel Hobby Plan Function Limit (12 Functions)

**What goes wrong:** On Hobby plan, when not using a bundling framework, each API route becomes a separate Vercel Function, capped at 12 per deployment. Next.js on Vercel bundles routes aggressively to avoid this, but adding many Route Handlers can still hit limits in edge cases.

**Prevention:** Use Next.js App Router (which bundles into the fewest functions possible) rather than bare `api/` files. This is already the plan — just be aware of it if switching patterns.

**Phase:** Architecture decision confirmed in Phase 1.

---

## Phase-Specific Warnings Summary

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | Upload architecture | 4.5 MB body limit (Pitfall 1) | Vercel Blob client-upload pattern |
| Phase 1 | Library selection | Ghostscript binary unavailable (Pitfall 2) | Pure-JS/WASM libraries only |
| Phase 1 | Upload form | Server Action body limit 1 MB (Pitfall 3) | Use Route Handler, not Server Action |
| Phase 1 | Security | MIME type not validated (Pitfall 8) | Magic byte check + MIME type check |
| Phase 1 | Security | Path traversal via filename (Pitfall 9) | UUID temp paths only |
| Phase 2 | Processing | OOM on large PDFs (Pitfall 4) | File size limit + memory monitoring |
| Phase 2 | Processing | /tmp filename collisions (Pitfall 5) | UUID-namespaced temp files |
| Phase 2 | Processing | Missing maxDuration declaration (Pitfall 6) | Explicit `export const maxDuration` |
| Phase 2 | Processing | Temp file leak on errors (Pitfall 12) | try/finally cleanup |
| Phase 2 | Library integration | WASM not excluded from webpack (Pitfall 7) | serverExternalPackages in next.config.ts |
| Phase 3 | UX | Fake progress bar (Pitfall 10) | Real XHR upload progress + spinner for server phase |
| Phase 3 | UX | Safari download failure (Pitfall 11) | Content-Disposition response header |
| Phase 3 | UX | Browser OOM on preview (Pitfall 13) | First-page-only preview, lazy page loading |

---

## Sources

- Vercel Functions Limits (official, last updated 2026-02-24): https://vercel.com/docs/functions/limitations
- Vercel Function Duration Configuration (official, last updated 2026-02-27): https://vercel.com/docs/functions/configuring-functions/duration
- Vercel Memory/CPU Configuration (official, last updated 2026-02-27): https://vercel.com/docs/functions/configuring-functions/memory
- Vercel Runtimes — File System Support (official, last updated 2026-02-18): https://vercel.com/docs/functions/runtimes#file-system-support
- Vercel FUNCTION_PAYLOAD_TOO_LARGE (413) error: https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE
- Vercel Blob Client Uploads (official, last updated 2026-02-26): https://vercel.com/docs/vercel-blob/client-upload
- Vercel Blob Server Uploads (official, last updated 2026-02-26): https://vercel.com/docs/vercel-blob/server-upload
- Next.js serverActions.bodySizeLimit (official, last updated 2026-05-13): https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions
- Next.js serverExternalPackages (official, last updated 2026-05-13): https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
- Next.js Route Handlers (official, last updated 2026-05-13): https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js Forms Guide (official, last updated 2026-05-13): https://nextjs.org/docs/app/guides/forms
