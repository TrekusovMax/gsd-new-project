# Architecture Patterns: PDF Compression Web App

**Domain:** Browser-based PDF compression utility
**Stack:** Next.js 15 App Router + TypeScript + Ant Design + Vercel (serverless)
**Researched:** 2026-05-14
**Overall confidence:** HIGH — based on official Next.js docs (v16.2.6, 2026-05-13), official Vercel
Functions limits docs (2026-02-24), and Vercel Blob SDK docs (2026-02-19).

---

## The Central Architectural Constraint

**Vercel serverless functions have a hard 4.5 MB request body limit.**
Source: https://vercel.com/docs/functions/limitations — confirmed current as of 2026-02-24.

Any PDF larger than 4.5 MB cannot be sent as a multipart/form-data POST to a Next.js API route.
This is not configurable. It applies to both request and response bodies.

This single constraint determines the entire architecture. The SPEC note about
"local temp file storage" is not viable on Vercel because:
1. Serverless functions have no persistent filesystem (each invocation is isolated)
2. `/tmp` exists per-invocation but disappears when the function cold-restarts
3. The 4.5 MB body limit prevents sending large PDFs through the API layer

**The correct pattern for Vercel: Client-direct-to-Blob upload, then server-to-Blob compression.**

---

## Recommended Architecture

### System Overview

```
Browser
  |
  |-- 1. Client validates file (type, size) locally
  |
  |-- 2. POST /api/upload --> Next.js route handler
  |         generates Vercel Blob client token
  |         returns { uploadUrl, token }
  |
  |-- 3. Direct upload to Vercel Blob CDN (bypasses Vercel function body limit)
  |         PUT https://blob.vercel-storage.com/...
  |         returns { blobUrl, size }
  |
  |-- 4. POST /api/compress { blobUrl, preset, filename }
  |         downloads PDF from Blob (~no body size limit on server-side fetch)
  |         runs pdf-lib compression in Node.js
  |         uploads compressed PDF back to Blob
  |         deletes original Blob
  |         returns { compressedBlobUrl, originalSize, compressedSize }
  |
  |-- 5. GET /api/download?url=... (optional proxy, or direct Blob URL)
  |         streams compressed file as attachment
  |
  |-- 6. Cleanup: del() original + compressed blobs after TTL or on next session
```

### Why This Pattern

- The `upload()` client method from `@vercel/blob/client` uploads directly from
  the browser to Vercel's blob CDN, never through the serverless function.
  There is no body size limit on this path.
- The compress route downloads the PDF from Blob using a server-side `fetch()`,
  which is not subject to the request body limit (it is an outbound request, not inbound).
- Both the original and compressed files live in Vercel Blob.
  Cleanup is explicit via `del()` — no reliance on `/tmp` or ephemeral filesystem.

---

## Component Boundaries

### UI Components (`/components`)

| Component | Responsibility | Props / Output |
|-----------|---------------|----------------|
| `DropZone` | Drag-and-drop + click-to-browse; validates type/size client-side | `onFileSelected(file: File)` |
| `UploadProgress` | Shows upload progress bar (0–100%) from Blob client upload callback | `progress: number, stage: UploadStage` |
| `CompressionPresets` | 3-option selector: Maximum / Balanced / High Quality | `value: Preset, onChange(p: Preset)` |
| `CompressButton` | Disabled until file + preset ready; triggers compression | `onClick`, `disabled`, `loading` |
| `CompressionStats` | Before/after sizes + % saved + bytes saved panel | `original: number, compressed: number` |
| `DownloadButton` | Single large CTA; triggers browser download | `url: string, filename: string` |
| `ResetButton` | "Compress another file" — resets all state | `onClick` |
| `ErrorBanner` | Inline error display for all failure modes | `error: AppError | null` |
| `FileInfo` | Shows filename + original size after upload | `filename: string, size: number` |

### Feature Module (`/features/pdf`)

This is the orchestration layer. Thin components call hooks from here.

| Module | Responsibility |
|--------|---------------|
| `usePdfUpload` | Wraps Vercel Blob `upload()` client call; manages upload progress state |
| `usePdfCompress` | Calls `POST /api/compress`; manages processing state and result |
| `usePdfDownload` | Constructs download anchor; triggers browser download |
| `pdfValidation.ts` | Pure functions: `validateFileType(file)`, `validateFileSize(file, maxMb)` |
| `compressionPresets.ts` | Preset definitions: label, value, description, quality params |

### API Routes (`/app/api`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/upload/route.ts` | `POST` | Token handler for Vercel Blob client upload (calls `handleUpload()`) |
| `/api/compress/route.ts` | `POST` | Fetches blob, runs pdf-lib compression, stores result, returns stats |
| `/api/download/route.ts` | `GET` | Optional: proxy stream with correct Content-Disposition header |
| `/api/history/route.ts` | `GET/DELETE` | Session-scoped compression history (deferred to post-MVP) |

### Services (`/services`)

| Service | Responsibility |
|---------|---------------|
| `blobService.ts` | Wraps `@vercel/blob`: `upload()`, `del()`, `get()` with typed interfaces |
| `pdfCompressionService.ts` | Pure compression logic using pdf-lib; takes `Uint8Array`, returns `Uint8Array` |
| `historyService.ts` | localStorage read/write for session history (post-MVP) |

### Store (`/store`)

React `useState` and `useReducer` in feature hooks — no Zustand/Redux needed for MVP.
See State Management section below.

### Types (`/types`)

```typescript
type UploadStage = 'idle' | 'validating' | 'uploading' | 'uploaded' | 'error'
type CompressionStage = 'idle' | 'processing' | 'done' | 'error'
type Preset = 'maximum' | 'balanced' | 'quality'
type AppStage = UploadStage | CompressionStage  // overall page state machine

interface CompressionResult {
  originalUrl: string
  compressedUrl: string
  originalSize: number      // bytes
  compressedSize: number    // bytes
  reductionPercent: number
  bytesSaved: number
  filename: string
}

interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'COMPRESSION_FAILED' | 'NETWORK'
  message: string
  retryable: boolean
}
```

---

## Data Flow (Step by Step)

```
1. User drops file
   DropZone → pdfValidation.validateFileType/Size()
   → if invalid: set error state, stop
   → if valid: set file state, advance to 'uploaded' stage

2. User selects preset (or default "Balanced" is pre-selected)
   CompressionPresets → setPreset()

3. User clicks "Compress"
   CompressButton → usePdfCompress.start()

   3a. usePdfUpload: calls upload() from @vercel/blob/client
       Browser → POST /api/upload (token handshake, ~1 KB JSON, no file)
       Browser → PUT Vercel Blob CDN (direct, file bytes bypass function body limit)
       onUploadProgress({ percentage }) → UploadProgress component re-renders
       → returns { url: blobUrl }

   3b. usePdfCompress: POST /api/compress { blobUrl, preset, filename }
       API route:
         fetch(blobUrl) → ArrayBuffer (server-side, no inbound body limit)
         pdfCompressionService.compress(bytes, preset) → compressed ArrayBuffer
         put('compressed/[uuid]-[filename]', compressed, { access: 'private' })
         del(originalBlobUrl)  ← clean up original immediately
         return { compressedUrl, originalSize, compressedSize }
       → sets CompressionResult state
       → advances stage to 'done'

4. Results displayed
   CompressionStats renders original/compressed/% from CompressionResult
   DownloadButton renders with compressedUrl

5. User clicks Download
   usePdfDownload: creates <a href=compressedUrl download=filename> and clicks it
   OR: calls /api/download?url=... which streams the blob with Content-Disposition header
   Note: For private blobs, the download must be proxied through the API route.
         For public blobs, direct URL works. Private is recommended for user file privacy.

6. User clicks "Compress another file"
   resetAll() → clears all state, del(compressedBlobUrl) ← explicit cleanup
   → returns to 'idle' stage
```

---

## State Management

**Use React state only. No Zustand, no Redux.**

Rationale:
- The entire app is a linear state machine with 5 stages: idle → uploading → processing → done → error
- State is co-located in a single page / single feature module
- No cross-component shared state that can't be solved with prop drilling or a single context
- The Zustand package in `/store` (from SPEC) should hold one thin context if needed,
  but it is likely unnecessary for MVP

### State Shape (in `usePdfCompressionFlow` hook)

```typescript
interface CompressionFlowState {
  stage: AppStage                      // the overall state machine
  file: File | null                    // selected file
  preset: Preset                       // selected preset (default: 'balanced')
  uploadProgress: number               // 0–100
  result: CompressionResult | null     // set when stage === 'done'
  error: AppError | null               // set when stage === 'error'
}
```

One `useReducer` in a single custom hook (`usePdfCompressionFlow`) manages this.
All UI components receive slices of this state + action dispatchers as props.
No context provider needed — the page component owns the state and drills it down.

### State Transitions

```
idle
  → (file selected + valid) → uploaded
  → (file invalid) → error (retryable: true)

uploaded
  → (compress clicked) → uploading

uploading
  → (upload complete) → processing
  → (upload failed) → error (retryable: true)

processing
  → (compression complete) → done
  → (server error) → error (retryable: true)

done
  → (reset clicked) → idle

error
  → (retry clicked) → idle (or back to last good stage)
```

---

## API Design

### POST /api/upload

**Purpose:** Token handshake for Vercel Blob client upload.
Does NOT receive the file. Called before the file is sent to Blob CDN.

Request body (from `handleUpload()` internal format):
```json
{ "type": "blob.generate-client-token", "payload": { "pathname": "uploads/file.pdf", "callbackUrl": "..." } }
```

Response: client token JSON (handled internally by `handleUpload()`).

Implementation:
```typescript
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody
  return Response.json(await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => ({
      allowedContentTypes: ['application/pdf'],
      maximumSizeInBytes: 20 * 1024 * 1024, // 20 MB
    }),
    onUploadCompleted: async ({ blob }) => {
      // Optional: log to DB; blob.url is available here
    },
  }))
}
```

### POST /api/compress

Request:
```json
{
  "blobUrl": "https://...private.blob.vercel-storage.com/uploads/file.pdf",
  "preset": "balanced",
  "filename": "report.pdf"
}
```

Response (success):
```json
{
  "compressedUrl": "https://...private.blob.vercel-storage.com/compressed/uuid-report.pdf",
  "originalSize": 4200000,
  "compressedSize": 1800000,
  "reductionPercent": 57.1,
  "bytesSaved": 2400000
}
```

Response (error):
```json
{
  "error": "COMPRESSION_FAILED",
  "message": "Could not compress PDF — file may be encrypted or corrupted"
}
```

Route segment config to set:
```typescript
export const maxDuration = 60  // seconds — increase from default for large files
export const runtime = 'nodejs'  // required for pdf-lib (not Edge-compatible)
```

### GET /api/download

**Purpose:** Proxy private Blob file to browser with correct headers.
Private blobs require an authenticated server request to fetch — they cannot be
accessed directly from the browser with a plain URL.

Request: `GET /api/download?url=https%3A%2F%2F...blob.vercel-storage.com%2F...`

Response: streamed PDF bytes with headers:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="report-compressed.pdf"
Cache-Control: no-store
```

Implementation uses `@vercel/blob` `get()` to fetch the private blob server-side,
then streams the result to the browser response.

### GET /api/history

**Deferred to post-MVP.** No implementation needed in initial phases.
If added: returns session-scoped list stored in a cookie or localStorage (client-side only).
No server state — no database required.

---

## File Handling on Vercel (Serverless)

### What Does NOT Work

- Writing to `/tmp` and expecting it to persist: each function invocation is isolated.
  Files written in one invocation are not visible in another invocation (even seconds later).
- Storing files in `node_modules` or public folder: read-only filesystem in production.
- In-memory buffer passed between API routes: each route is a separate Lambda invocation.

### What DOES Work

**Vercel Blob** (`@vercel/blob`) is the correct solution:
- Files are stored in Vercel's S3-backed CDN with explicit TTL control
- `put()` uploads, `get()` fetches, `del()` deletes — all synchronous, awaitable
- Private blobs require server-side token to access (correct security model for user files)
- No cold-start penalty — Blob access is a standard HTTPS call

**Cleanup strategy:**

The app cannot rely on a cron job or background process (serverless has no daemons).
Cleanup must be opportunistic and explicit:

1. **Immediate cleanup after compress:** Delete the original blob (`del(originalUrl)`)
   as soon as the compressed version is created. User no longer needs it.

2. **Explicit cleanup on reset:** When user clicks "Compress another file",
   `del(compressedUrl)` is called before state resets.

3. **TTL via Blob options:** Set `cacheControlMaxAge` to a short value (e.g., 3600 seconds)
   so the CDN expires cached copies quickly, even if explicit `del()` is delayed.

4. **Accept some orphaned blobs:** If the user closes the tab without downloading,
   blobs will remain until manually cleaned. For MVP this is acceptable cost.
   Post-MVP: use Vercel Cron (available on Pro plan) to sweep old blobs periodically.

---

## Processing Pipeline: Sync vs Async

**Use synchronous request-response for MVP. Do not implement a job queue.**

Rationale:
- Vercel Pro plan allows up to 300s function duration (configurable)
- pdf-lib compression of a 20 MB PDF completes in 5–20 seconds in Node.js
- This is well within the 300s hard limit, even with cold start overhead
- A job queue (Bull, Inngest, etc.) adds: a Redis/Postgres instance, polling UI,
  job status API, error recovery logic — all unnecessary for MVP
- Async patterns are needed when: processing takes > 30s, or user needs to navigate
  away and return for the result. Neither applies here.

**The compress route is a single synchronous POST:**
1. Receive `{ blobUrl, preset }`
2. `fetch(blobUrl)` → ArrayBuffer (1–5s for 20 MB depending on region)
3. `pdfCompressionService.compress()` → 2–15s depending on file + preset
4. `put(compressedBlob)` → 1–3s
5. `del(originalBlob)` → < 1s
6. Return JSON response

Total worst case for 20 MB: ~25s. Acceptable.

For a future 50 MB+ scenario, consider streaming compression or async queue.

---

## Suggested Build Order

This order minimizes blocked work — each phase produces something runnable.

### Phase 1: Foundation + Upload Flow

Build these first because everything else depends on file upload working:

1. **Project scaffolding** — Next.js 15 App Router, TypeScript, Ant Design config
2. **`/types`** — `AppStage`, `Preset`, `CompressionResult`, `AppError`
3. **`/features/pdf/pdfValidation.ts`** — pure functions, testable in isolation
4. **`DropZone` component** — drag/drop + click-to-browse, client validation
5. **`/api/upload/route.ts`** — `handleUpload()` token handler (Vercel Blob)
6. **`/features/pdf/usePdfUpload.ts`** — wraps `@vercel/blob/client` `upload()`
7. **`UploadProgress` component** — progress bar
8. **`FileInfo` component** — filename + size display after upload
9. **Page component wiring** — `usePdfCompressionFlow` reducer, connect components

**Checkpoint:** User can drop a PDF, see upload progress, and file appears in Vercel Blob.

### Phase 2: Compression + Download

Build these once upload is verified:

10. **`/features/pdf/compressionPresets.ts`** — preset definitions + quality params
11. **`CompressionPresets` component** — 3-option UI
12. **`/services/pdfCompressionService.ts`** — pdf-lib compress function
13. **`/api/compress/route.ts`** — orchestration: fetch blob → compress → put → del
14. **`/features/pdf/usePdfCompress.ts`** — calls compress API, manages state
15. **`CompressButton` component**
16. **`CompressionStats` component** — stats panel
17. **`/api/download/route.ts`** — proxy stream for private blob
18. **`/features/pdf/usePdfDownload.ts`** — download trigger
19. **`DownloadButton` + `ResetButton` components**
20. **`ErrorBanner` component** — all error codes

**Checkpoint:** Full compress-download loop works end-to-end.

### Phase 3: Polish (post-MVP)

- `GET /api/history` + `historyService.ts` (localStorage)
- PDF preview with PDF.js
- Dark mode theme tokens
- Batch upload mode

---

## Architecture Anti-Patterns to Avoid

### Anti-Pattern 1: Sending PDF bytes through the API route body

**What:** `POST /api/compress` with the raw PDF file bytes in the request body.
**Why bad:** Hits the 4.5 MB Vercel body limit for any real-world PDF. Users get
`413 FUNCTION_PAYLOAD_TOO_LARGE` with no clear error message.
**Instead:** Client uploads directly to Vercel Blob CDN; API route receives only the URL.

### Anti-Pattern 2: Using `/tmp` for inter-route file passing

**What:** Compress route writes to `/tmp/compressed.pdf`, download route reads it.
**Why bad:** Serverless invocations are isolated — `/tmp` from one invocation is
invisible to another. Works locally (single Node.js process) but silently breaks in production.
**Instead:** Use Vercel Blob as the shared persistent store between invocations.

### Anti-Pattern 3: Returning the compressed PDF bytes in the API response

**What:** `POST /api/compress` returns the compressed PDF as binary response body.
**Why bad:** Same 4.5 MB response body limit. A compressed 4 MB file can still exceed this.
**Instead:** Compress route returns a URL; download route streams the file from Blob.

### Anti-Pattern 4: Using Edge Runtime for the compression route

**What:** Adding `export const runtime = 'edge'` to the compress route for performance.
**Why bad:** Edge Runtime does not support all Node.js APIs. pdf-lib uses `Buffer` and
`Uint8Array` operations that work in Node.js but may behave differently in V8 Isolates.
More critically, Edge functions have a 25s response initiation requirement and much lower
memory limits. PDF compression is CPU-intensive — wrong runtime for the job.
**Instead:** `export const runtime = 'nodejs'` — explicit, safe, full Node.js API access.

### Anti-Pattern 5: Zustand/Redux for this state complexity

**What:** Adding a global store because "it might get more complex."
**Why bad:** This is a linear 5-stage state machine with a single active file.
Global state adds indirection without benefit. useReducer in a single hook is simpler,
more testable, and sufficient.
**Instead:** One `useReducer` in `usePdfCompressionFlow`, prop-drilled to children.

### Anti-Pattern 6: Splitting upload and compress into separate user steps with page navigation

**What:** Upload → navigate to /result page → show compress button there.
**Why bad:** State lives in the URL, complicating back-button behavior. The Blob URL
would need to be in the query string (a security exposure). Single-page state machine is correct.
**Instead:** Single page, all stages managed by the state machine, no navigation.

---

## Scalability Considerations

| Concern | At 100 users/day | At 10K users/day | At 1M users/day |
|---------|-----------------|-----------------|----------------|
| Serverless cold starts | Negligible | Occasional; add `export const warmup = true` | Pre-warm instances or migrate to dedicated |
| Blob storage costs | < $1/month | ~$10–50/month depending on file sizes | Dedicated S3 with lifecycle rules |
| Compression CPU time | Fine on Hobby/Pro | Monitor function duration in Vercel dashboard | Consider dedicated compression worker (Fly.io, Railway) |
| Blob cleanup orphans | Tolerable | Implement Vercel Cron cleanup job | Mandatory with TTL indexing |
| Concurrent large compressions | Fine | Fine up to ~30K concurrent (Vercel auto-scales) | Cost-optimize: queue + dedicated workers |

---

## Sources

- Next.js Route Handlers docs: https://nextjs.org/docs/app/api-reference/file-conventions/route
  (version 16.2.6, updated 2026-05-13) — HIGH confidence
- Vercel Functions Limits: https://vercel.com/docs/functions/limitations
  (updated 2026-02-24) — HIGH confidence — 4.5 MB body limit confirmed
- Vercel Blob SDK: https://vercel.com/docs/vercel-blob/using-blob-sdk
  (updated 2026-02-19) — HIGH confidence — `handleUpload()`, `upload()`, `del()` patterns confirmed
- Vercel Blob overview: https://vercel.com/docs/vercel-blob
  (updated 2026-02-19) — HIGH confidence — private/public storage, client upload pattern confirmed
- Next.js `serverExternalPackages` docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
  (version 16.2.6, updated 2026-05-13) — HIGH confidence — `@react-pdf/renderer` auto-opted-out confirmed
- pdf-lib capabilities: Training data (MEDIUM confidence — needs implementation verification)
  Note: pdf-lib can manipulate PDF structure and image compression parameters.
  Actual compression ratio depends on PDF content. Ghostscript (via child_process) achieves
  better compression but is a native binary not deployable to Vercel serverless.
  pdf-lib is the correct choice for Vercel; Ghostscript requires a dedicated server.
