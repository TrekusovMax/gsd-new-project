---
plan: PLAN-2.1
phase: 02-compression-download
title: Compression Engine
goal: Create /api/compress that accepts { blobUrl, preset, filename } and returns { compressedBlobUrl, originalSize, compressedSize }.
wave: 1
requires: none
---

## Goal

Build the server-side compression pipeline that powers Phase 2. This plan delivers three things: extended TypeScript contracts that the rest of Phase 2 builds on, a `pdfCompressor` service with three tunable presets implemented via pdf-lib + sharp, and the `/api/compress` route handler that ties them together. Nothing in PLAN-2.2 or PLAN-2.3 can be written until this plan is complete, because they both depend on the types and the API contract defined here.

## Requirements covered

- COMP-01: Three compression presets — Maximum Compression / Balanced / High Quality
- COMP-02: Balanced selected by default (initialState preset: 'balanced')
- COMP-03: Server-side compression using pdf-lib + sharp
- COMP-04: Compressing stage tracked in state (COMPRESS_START action)
- ERR-03: Server returns structured error codes (ENCRYPTED_PDF, COMPRESSION_FAILED) that the UI layer maps to user-facing messages

## Tasks

### Task 1: Extend types/upload.ts with Phase 2 contracts

**File:** `types/upload.ts`
**Action:** Modify (full rewrite of the file — it is small, 33 lines)

Replace the existing contents with an extended version that adds the Phase 2 stages, action types, error codes, and state fields. Every existing union member and interface field must be preserved exactly; only additions are made.

**Changes:**

- `UploadStage` union: add `'compressing'` and `'compress-complete'` after `'upload-complete'`
- `AppError.code` union: add `'COMPRESSION_FAILED'` and `'ENCRYPTED_PDF'`
- `UploadState` interface: add four new fields after `error`:
  - `preset: 'maximum' | 'balanced' | 'quality'`  — default will be `'balanced'` in initialState
  - `compressedBlobUrl: string | null`
  - `originalSize: number | null`
  - `compressedSize: number | null`
- `UploadAction` union: add four new action variants after `ZONE_CLICK`:
  - `{ type: 'SET_PRESET'; preset: 'maximum' | 'balanced' | 'quality' }`
  - `{ type: 'COMPRESS_START' }`
  - `{ type: 'COMPRESS_DONE'; compressedBlobUrl: string; originalSize: number; compressedSize: number }`
  - `{ type: 'COMPRESS_ERROR'; error: AppError }`

Also export a named alias for the preset union so the service layer can import it without duplicating the literal type:

```
export type CompressionPreset = 'maximum' | 'balanced' | 'quality'
```

**Complete file after changes:**

```typescript
export type UploadStage =
  | 'idle'
  | 'drag-over'
  | 'uploading'
  | 'upload-complete'
  | 'compressing'
  | 'compress-complete'
  | 'error'

export type CompressionPreset = 'maximum' | 'balanced' | 'quality'

export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK' | 'COMPRESSION_FAILED' | 'ENCRYPTED_PDF'
  message: string
  heading: string
}

export interface UploadState {
  stage: UploadStage
  file: File | null
  uploadProgress: number
  blobUrl: string | null
  error: AppError | null
  preset: CompressionPreset
  compressedBlobUrl: string | null
  originalSize: number | null
  compressedSize: number | null
}

export type UploadAction =
  | { type: 'DRAG_ENTER' }
  | { type: 'DRAG_LEAVE' }
  | { type: 'DROP_VALID' }
  | { type: 'DROP_INVALID'; error: AppError }
  | { type: 'FILE_SELECTED'; file: File }
  | { type: 'PROGRESS'; percent: number }
  | { type: 'UPLOAD_DONE'; blobUrl: string; filename: string; size: number }
  | { type: 'UPLOAD_ERROR'; error: AppError }
  | { type: 'RESET' }
  | { type: 'ZONE_CLICK' }
  | { type: 'SET_PRESET'; preset: CompressionPreset }
  | { type: 'COMPRESS_START' }
  | { type: 'COMPRESS_DONE'; compressedBlobUrl: string; originalSize: number; compressedSize: number }
  | { type: 'COMPRESS_ERROR'; error: AppError }
```

**Verify:** `npx tsc --noEmit` exits 0 (existing consumers of `UploadState` and `UploadAction` must still compile — all existing fields are preserved).

**Done:** File exports all types listed above. `npx tsc --noEmit` exits 0.

---

### Task 2: Create services/pdfCompressor.ts

**File:** `services/pdfCompressor.ts`
**Action:** Create

Implement the full compression pipeline. The function signature is:

```typescript
export async function compressPdf(inputBuffer: Buffer, preset: CompressionPreset): Promise<Buffer>
```

Import `CompressionPreset` from `@/types/upload`. Import `PDFDocument`, `PDFRawStream`, `PDFName`, `PDFNumber` from `pdf-lib`. Import `sharp` from `sharp`.

**Preset config table** (record keyed by `CompressionPreset`):

| preset | jpegQuality | maxWidth | maxHeight | convertPngToJpeg |
|--------|-------------|----------|-----------|-----------------|
| maximum | 40 | 1024 | 1024 | true |
| balanced | 65 | 1600 | 1600 | false |
| quality | 85 | 2400 | 2400 | false |

**Pipeline — two passes:**

Pass 1 — Image re-encoding (wrap entire pass in try/catch; if the pass throws as a whole, skip to Pass 2 with the original pdfDoc):

- Call `pdfDoc.context.enumerateIndirectObjects()` to iterate all indirect objects.
- For each entry `[ref, obj]`: skip if `!(obj instanceof PDFRawStream)`.
- Read `Subtype` from `obj.dict` via `PDFName.of('Subtype')`; skip if not `/Image`.
- Read `Filter` string from `obj.dict`; skip if it contains `CCITTFaxDecode` or `JBIG2Decode`.
- Detect format: `isJpeg = filterStr.includes('DCTDecode')`, `isPng = !isJpeg && filterStr.includes('FlateDecode')`. Skip if neither.
- Wrap per-image processing in try/catch — on any error `continue` to preserve the original image.
- Read `Width` and `Height` via `PDFNumber`; default to 0 if not `PDFNumber`.
- Build a sharp pipeline from `Buffer.from(obj.contents)`. If either dimension exceeds the preset max, call `.resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })`.
- If `isJpeg || convertPngToJpeg`: output `.jpeg({ quality: jpegQuality, progressive: false })`; set `newFilter = 'DCTDecode'`.
- Else (PNG): output `.png({ compressionLevel: 9, adaptiveFiltering: true })`; set `newFilter = 'FlateDecode'`.
- If `newImageBytes.length >= obj.contents.length` — skip (result is not smaller; `continue`).
- Get new dimensions from `sharp(newImageBytes).metadata()`.
- Rebuild the image object using `context.obj({...})` with keys: `Type: 'XObject'`, `Subtype: 'Image'`, `Width`, `Height`, `ColorSpace` (use `'DeviceRGB'` for JPEG outputs; preserve original `ColorSpace` for PNG), `BitsPerComponent: 8`, `Filter: PDFName.of(newFilter)`, `Length: newImageBytes.length`.
- Assign back via `context.assign(ref, context.stream(newImageBytes, newDictObj.dict ?? {}))`.

Pass 2 — Structural compression:

```typescript
const compressedBytes = await pdfDoc.save({ useObjectStreams: true, updateFieldAppearances: false })
return Buffer.from(compressedBytes)
```

**Load the PDF at the top of the function:**

```typescript
const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: false })
```

If `PDFDocument.load` throws, let the error propagate — `/api/compress` catches it and classifies it.

**Verify:** `npx tsc --noEmit` exits 0. The file has no TypeScript errors and compiles without the `any` type (use `unknown` for the context.obj return type or cast through the internal type as needed; the only acceptable cast is the `newDictObj.dict` access which is an internal pdf-lib API).

**Done:** `services/pdfCompressor.ts` exists, exports `compressPdf`, compiles with strict TypeScript.

---

### Task 3: Create app/api/compress/route.ts

**File:** `app/api/compress/route.ts`
**Action:** Create

Route configuration exports (must be the first two lines after imports):

```typescript
export const runtime = 'nodejs'
export const maxDuration = 60
```

These are mandatory per CLAUDE.md Architecture Decision #3. `runtime = 'nodejs'` is required because pdf-lib uses Node.js Buffer API; Edge Runtime is incompatible.

**Zod schema:**

```typescript
const schema = z.object({
  blobUrl: z.string().url(),
  preset: z.enum(['maximum', 'balanced', 'quality']),
  filename: z.string().min(1).max(255),
})
```

**Handler logic — POST(request: Request): Promise\<NextResponse\>:**

1. Parse JSON body; return 400 if JSON.parse throws.
2. `schema.safeParse(body)`; return 400 if invalid.
3. SSRF guard: validate that `new URL(blobUrl).hostname` matches `/\.blob\.vercel-storage\.com$/`. Return 400 with `{ error: 'Invalid blob URL' }` if it does not match.
4. `fetch(blobUrl)` server-side; if `!response.ok` return 502 `{ error: 'Could not fetch PDF from storage' }`. On network error catch → 502 `{ error: 'Failed to retrieve file' }`.
5. `pdfBuffer = Buffer.from(await response.arrayBuffer())`. Record `originalSize = pdfBuffer.length`.
6. Call `compressPdf(pdfBuffer, preset)`. Catch errors: if `err.message` contains `encrypt` or `password` → return 422 `{ error: 'ENCRYPTED_PDF', message: 'This PDF is password-protected and cannot be compressed.' }`. All other errors → `console.error('[/api/compress] compression failed:', message)` → return 500 `{ error: 'COMPRESSION_FAILED', message: 'Compression failed. The file may be corrupted.' }`.
7. `compressedSize = compressedBuffer.length`.
8. Build upload filename: `const baseName = filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_')` then `const uploadName = \`compressed/${crypto.randomUUID()}-${baseName}-compressed.pdf\``.
9. `put(uploadName, compressedBuffer, { access: 'private', contentType: 'application/pdf', addRandomSuffix: false })`. On error → 500 `{ error: 'Failed to store compressed file' }`.
10. Return 200 `{ compressedBlobUrl: uploaded.url, originalSize, compressedSize }`.

Import `crypto` from Node's built-in `'crypto'` module (not `webcrypto`). Import `put` from `'@vercel/blob'`. Import `z` from `'zod'`. Import `NextResponse` from `'next/server'`. Import `compressPdf` from `'@/services/pdfCompressor'`.

**Verify:**
- `npx tsc --noEmit` exits 0
- `npm run build` exits 0 and lists `/api/compress` as a dynamic route
- Manual smoke test: `curl -X POST http://localhost:3000/api/compress -H 'Content-Type: application/json' -d '{"blobUrl":"https://bad.example.com/file.pdf","preset":"balanced","filename":"test.pdf"}'` returns 400 (SSRF guard fires)

**Done:** `/api/compress` route exists, compiles, has `runtime = 'nodejs'` and `maxDuration = 60`, rejects non-Vercel-Blob URLs, returns `{ compressedBlobUrl, originalSize, compressedSize }` on success.

## Verification

- [ ] `npx tsc --noEmit` exits 0 after all three tasks
- [ ] `npm run build` exits 0; `/api/compress` listed as dynamic route
- [ ] `types/upload.ts` exports `CompressionPreset`, extended `UploadStage` (6 values + error), extended `UploadAction` (14 variants)
- [ ] `services/pdfCompressor.ts` exports `compressPdf(inputBuffer: Buffer, preset: CompressionPreset): Promise<Buffer>`
- [ ] `app/api/compress/route.ts` has `export const runtime = 'nodejs'` and `export const maxDuration = 60` as first two exports
- [ ] SSRF guard present: hostname must match `blob.vercel-storage.com`
- [ ] Encrypted PDF error path returns 422 with `error: 'ENCRYPTED_PDF'`
- [ ] No `any` types introduced in new files
