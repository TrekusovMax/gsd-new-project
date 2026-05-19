---
plan: PLAN-2.3
phase: 02-compression-download
title: Download Flow + Error Handling
goal: Create /api/download proxy route, extend /api/cleanup for dual-URL deletion, and add the compress-error state to FileInfoCard.
wave: 2
requires: PLAN-2.1
---

## Goal

Complete the end-to-end flow. This plan delivers the private-blob download proxy (`/api/download`) that streams the compressed PDF to the browser and deletes both blobs afterward, extends `/api/cleanup` to accept an optional second URL for the "Сжать другой файл" reset flow, and adds the error render branch to `FileInfoCard` that PLAN-2.2 left as a comment placeholder.

This plan runs in Wave 2 alongside PLAN-2.2. They are independent: PLAN-2.3 does not read files that PLAN-2.2 writes (except `FileInfoCard.tsx`, where PLAN-2.2 inserts `{/* PLAN-2.3: add compress-error state here */}` as the insertion point). Execute PLAN-2.2 first if running sequentially, or coordinate the `FileInfoCard.tsx` edit carefully if running in parallel.

## Requirements covered

- RES-02: Download button triggers actual file download via `/api/download` (per D-08, D-14)
- RES-03: Downloaded file name is `[original]-compressed.pdf` (per D-10)
- RES-04: "Сжать другой файл" CTA visible after compress-complete — implemented in PLAN-2.2; this plan adds the cleanup side (per D-09, D-15)
- ERR-03: Compress-error state displayed in FileInfoCard with retry and reset options (per D-11, D-12)
- INFRA-02: Both blobs deleted after download — completes the INFRA-02 requirement deferred from Phase 1 (per D-13)
- UX-03: `Content-Disposition: attachment` ensures correct save behavior in Safari/iOS

## Context: interfaces from PLAN-2.1

```typescript
// types/upload.ts — written by PLAN-2.1
export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK' | 'COMPRESSION_FAILED' | 'ENCRYPTED_PDF'
  message: string
  heading: string
}
```

```typescript
// services/blobService.ts — exists from Phase 1
export async function deleteBlobSafe(url: string): Promise<void>
// del() from @vercel/blob also supports array: del([url1, url2])
```

## Tasks

### Task 1: Create app/api/download/route.ts

**File:** `app/api/download/route.ts`
**Action:** Create

Route configuration (must appear before the handler):

```typescript
export const runtime = 'nodejs'
export const maxDuration = 30
```

`runtime = 'nodejs'` is set explicitly for consistency with other heavy routes (CLAUDE.md Architecture #3). `maxDuration = 30` is sufficient for streaming — download is much faster than compression.

**Imports:**

```typescript
import { NextResponse } from 'next/server'
import { head, del } from '@vercel/blob'
import { z } from 'zod'
```

Do not import `deleteBlobSafe` — use `del([url1, url2])` directly here to batch both deletions in one SDK call (cleaner than two separate `deleteBlobSafe` calls).

Note: `@vercel/blob` `get()` returns metadata (`BlobMetadataWithDownloadUrl`), not a stream. Use `head()` to verify the blob exists and get metadata, then `fetch(blobResult.downloadUrl)` to stream the actual file content.

**Zod schema:**

```typescript
const schema = z.object({
  blobUrl: z.string().url(),
  compressedBlobUrl: z.string().url(),
  filename: z.string().min(1).max(255),
})
```

**Handler — `POST(request: Request): Promise<Response>`:**

Return type is `Response` (not `NextResponse`) because the streaming response uses the native `Response` constructor directly.

1. Parse JSON body; return `NextResponse.json({ error: 'Invalid request body' }, { status: 400 })` on parse failure.
2. `schema.safeParse(body)` — return 400 on validation failure.
3. Sanitize the download filename:
   ```typescript
   const safeName = filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_')
   const downloadFilename = `${safeName}-compressed.pdf`
   ```
4. Verify the blob exists and get its metadata using `head(compressedBlobUrl)`, then stream via `fetch(blobResult.downloadUrl)`. The `@vercel/blob` `head()` returns `null` for missing blobs. Handle both:
   ```typescript
   let blobMeta: Awaited<ReturnType<typeof head>>
   try {
     blobMeta = await head(compressedBlobUrl)
   } catch {
     return NextResponse.json({ error: 'File not found or expired' }, { status: 404 })
   }
   if (!blobMeta) {
     return NextResponse.json({ error: 'File not found' }, { status: 404 })
   }
   const fileResponse = await fetch(blobMeta.downloadUrl)
   if (!fileResponse.ok || !fileResponse.body) {
     return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 })
   }
   ```
5. Construct the streaming response. Pipe `fileResponse.body` (a Web `ReadableStream`) directly in the `Response` constructor. Include `Content-Length` from `blobMeta.size`:
   ```typescript
   const response = new Response(fileResponse.body, {
     headers: {
       'Content-Type': 'application/pdf',
       'Content-Disposition': `attachment; filename="${downloadFilename}"`,
       'Content-Length': String(blobMeta.size),
       'Cache-Control': 'no-store',
     },
   })
   ```
6. Fire-and-forget cleanup of both blobs using `del()` with an array. This MUST come after `new Response(...)` is constructed, not before — to avoid a race condition where the blob is deleted before the stream is fully consumed by the client:
   ```typescript
   void del([compressedBlobUrl, blobUrl]).catch((err: unknown) => {
     console.warn('[/api/download] blob cleanup failed:', err)
   })
   ```
7. Return the response: `return response`

The `del([url1, url2])` batch call uses the SDK's built-in array support (confirmed in 02-RESEARCH.md "Don't Hand-Roll" table). The `.catch()` ensures cleanup failures are logged but never crash the route after the response is already constructed.

**Verify:**
- `npx tsc --noEmit` exits 0
- `npm run build` exits 0; `/api/download` listed as dynamic route
- File includes `export const runtime = 'nodejs'` and `export const maxDuration = 30`
- Response headers include `Content-Disposition: attachment` (required for UX-03 / Safari)
- `del([...])` is called after `new Response(stream)`, not before

**Done:** `/api/download` exists, compiles, streams private Vercel Blob with correct Content-Disposition header, and fires cleanup for both URLs after response construction.

---

### Task 2: Extend app/api/cleanup/route.ts

**File:** `app/api/cleanup/route.ts`
**Action:** Modify

**Why:** Per D-15, "Сжать другой файл" must clean up both the original blob and the compressed blob (if it exists). The current `handleReset` in `usePdfUpload` makes two separate `fetch('/api/cleanup', ...)` calls when `compressedBlobUrl` is present (pattern from RESEARCH.md Section 7). To allow a single network request and clean server-side batching, extend the schema to accept an optional `compressedUrl`.

**Current schema:**

```typescript
const schema = z.object({ url: z.string().url() })
```

**Replace with:**

```typescript
const schema = z.object({
  url: z.string().url(),
  compressedUrl: z.string().url().optional(),
})
```

**Current handler body (after validation):**

```typescript
await deleteBlobSafe(result.data.url)
return NextResponse.json({ ok: true })
```

**Replace with:**

```typescript
const { url, compressedUrl } = result.data
await deleteBlobSafe(url)
if (compressedUrl) {
  await deleteBlobSafe(compressedUrl)
}
return NextResponse.json({ ok: true })
```

The two `await` calls are sequential (not `Promise.all`) to keep the error surface simple — `deleteBlobSafe` already swallows individual failures with a `console.warn`. Using `Promise.all` would also work but offers no meaningful benefit for a fire-and-forget cleanup endpoint.

**Update `handleReset` in `features/pdf/usePdfUpload.ts`:**

The existing `handleReset` already calls `/api/cleanup` with `{ url: state.blobUrl }`. Extend it to include `compressedUrl` when available:

```typescript
const handleReset = useCallback(() => {
  if (state.blobUrl) {
    fetch('/api/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: state.blobUrl,
        ...(state.compressedBlobUrl ? { compressedUrl: state.compressedBlobUrl } : {}),
      }),
    }).catch(() => {})
  }
  dispatch({ type: 'RESET' })
}, [state.blobUrl, state.compressedBlobUrl])
```

This satisfies D-15 with a single HTTP request regardless of how many URLs need cleanup.

**Verify:**
- `npx tsc --noEmit` exits 0
- Existing behavior preserved: `POST /api/cleanup { url }` still returns `{ ok: true }`
- New behavior: `POST /api/cleanup { url, compressedUrl }` deletes both and returns `{ ok: true }`
- `POST /api/cleanup { url, compressedUrl: "not-a-url" }` returns 400

**Done:** `/api/cleanup` accepts optional `compressedUrl` and deletes both blobs. `handleReset` sends both URLs in one request when `compressedBlobUrl` is set.

---

### Task 3: Add error state to components/FileInfoCard.tsx

**File:** `components/FileInfoCard.tsx`
**Action:** Modify (insert error branch at the comment marker left by PLAN-2.2)

**Coordination with PLAN-2.2:** PLAN-2.2 leaves this comment at the error branch insertion point:

```tsx
{/* PLAN-2.3: add compress-error state here */}
```

Replace that comment with the full error state render branch.

**Error state design** (per D-11, D-12):

- Outer wrapper: red border `#ff4d4f`, borderRadius 4, padding 16, marginBottom 16
- Heading: `AppError.heading` in red `#ff4d4f`, fontSize 14, fontWeight 600, marginBottom 4
- Message: `AppError.message` in secondary text `#8888a8`, fontSize 13, marginBottom 16
- Two buttons in a `flex` row with `gap: 8`:
  - "Повторить" — `type="primary"` — calls `onRetry`
  - "Загрузить другой" — `type="default"` — calls `onReset`

The `error` prop on `FileInfoCard` is currently not part of the props interface. It needs to be added. Update the `FileInfoCardProps` interface (which was extended by PLAN-2.2) to add:

```typescript
error?: AppError | null
```

Import `AppError` from `@/types/upload`. It is already imported if PLAN-2.2 imported `CompressionPreset` from the same file; if not, add the import.

**Full error branch JSX to replace the comment:**

```tsx
{stage === 'error' && (
  <div
    style={{
      border: '1px solid #ff4d4f',
      borderRadius: 4,
      padding: 16,
      marginBottom: 16,
    }}
  >
    {error && (
      <>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#ff4d4f',
            marginBottom: 4,
          }}
        >
          {error.heading}
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#8888a8',
            marginBottom: 16,
          }}
        >
          {error.message}
        </div>
      </>
    )}
    <div style={{ display: 'flex', gap: 8 }}>
      <Button
        type="primary"
        onClick={onRetry}
        style={{ flex: 1, minHeight: 40 }}
      >
        Повторить
      </Button>
      <Button
        type="default"
        onClick={onReset}
        style={{ flex: 1, minHeight: 40 }}
      >
        Загрузить другой
      </Button>
    </div>
  </div>
)}
```

The outer card wrapper remains unchanged (no red border on the outer card — the inner error box provides the red border per D-11, which specifies "red border" for the error area, not the entire card).

**Verify:**
- `npx tsc --noEmit` exits 0
- `FileInfoCardProps` now includes `error?: AppError | null`
- Error branch renders only when `stage === 'error'`
- Two buttons present: "Повторить" and "Загрузить другой"
- The `{/* PLAN-2.3: add compress-error state here */}` comment is gone (replaced by real JSX)

**Done:** `FileInfoCard` renders the compress-error state with heading, message, and two action buttons. TypeScript compiles cleanly.

## Verification

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0; `/api/download` and updated `/api/cleanup` registered as dynamic routes
- [ ] `app/api/download/route.ts` has `export const runtime = 'nodejs'` and `export const maxDuration = 30`
- [ ] `Content-Disposition: attachment` header present in `/api/download` response
- [ ] `del([compressedBlobUrl, blobUrl])` called after `new Response(stream)` (fire-and-forget, not awaited)
- [ ] `/api/cleanup` accepts `{ url, compressedUrl? }` — both variants return `{ ok: true }`
- [ ] `handleReset` in `usePdfUpload` sends `compressedUrl` when `state.compressedBlobUrl` is non-null
- [ ] `FileInfoCard` renders error state when `stage === 'error'`: red-bordered box, heading, message, two buttons
- [ ] PLAN-2.2 comment marker `{/* PLAN-2.3: add compress-error state here */}` has been replaced with real JSX
- [ ] Full phase end-to-end: upload → select preset → compress → see stats → download triggers file save with name `[original]-compressed.pdf` → "Сжать другой файл" resets to idle and cleans up both blobs
