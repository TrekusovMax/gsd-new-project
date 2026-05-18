# Research Summary — PDF Compression Web App

## Recommended Stack

| Layer | Library | Version | Rationale |
|-------|---------|---------|-----------|
| PDF processing | pdf-lib | 1.17.1 | Pure JavaScript, zero native deps, runs on Vercel. 10–40% reduction on text-heavy PDFs. |
| Image recompression | sharp | 0.34.5 | Prebuilt Linux x64 binary (~17 MB). Re-encodes JPEG images embedded in PDFs. Must be in `dependencies` + declared in `serverComponentsExternalPackages`. |
| File storage | @vercel/blob | 2.3.3 | Required due to Vercel 4.5 MB body limit — client-upload bypasses it entirely. |
| Upload parsing | Native `request.formData()` | — | App Router Route Handlers are Web API-based. Multer requires Express middleware shims. |
| State management | React `useReducer` | — | 5-stage linear state machine (idle → uploading → processing → done → error). No Zustand needed at MVP complexity. |

**Do NOT use:** Ghostscript, ghostscript4js, compress-pdf, node-qpdf2 — all require system binaries unavailable on Vercel Lambda.

---

## Critical Architectural Constraint

**Vercel enforces a 4.5 MB hard cap on serverless function request bodies.**

This means the SPEC's "local temp file storage" approach (direct POST to `/api/upload`) is non-viable for real PDFs. The correct pattern:

```
Browser → [Vercel Blob client-upload SDK] → Vercel Blob CDN
                                                    ↓
Browser → POST /api/compress { blobUrl } → Server fetches from CDN → Compresses → Returns result
```

Steps:
1. `POST /api/upload` — returns a short-lived upload token (tiny JSON, no file bytes)
2. Browser calls `@vercel/blob/client upload()` with token — file goes direct to CDN
3. `POST /api/compress { blobUrl }` — server fetches blob, compresses, returns buffer
4. `GET /api/download` — proxies private blob to browser with `Content-Disposition: attachment`

**Runtime requirement:** `export const runtime = 'nodejs'` on the compress route. pdf-lib uses Node.js `Buffer` APIs incompatible with Edge Runtime.

---

## Table Stakes Features (MVP)

- **Upload**: Full-page drag & drop + click-to-browse. Client-side validation before upload starts (type: PDF only, size: ≤ 20 MB).
- **Compression presets**: Exactly 3 named tiers — **Maximum Compression / Balanced / High Quality**. Default: Balanced pre-selected.
- **Progress feedback**: Real XHR upload progress events (not fake timers). Spinner during server compression phase.
- **Stats**: Original size, compressed size, percentage saved, absolute MB saved. The "saved X%" number is the emotional core of the tool.
- **Download**: One button. Auto-suggested filename `[original]-compressed.pdf`. Immediately followed by "Compress another file" CTA.
- **Error handling**: Visible errors for all failure modes (file too large, wrong type, compression failed).
- **Responsive**: Mobile-friendly layout.

---

## Architecture Data Flow

```
1. User selects/drops PDF
2. Client validates (type, size ≤ 20 MB)
3. POST /api/upload → server issues Vercel Blob upload token
4. Client uploads directly to Vercel Blob CDN (bypasses 4.5 MB limit)
5. POST /api/compress { blobUrl, preset } → server fetches blob, runs pdf-lib + sharp, returns compressed buffer
6. GET /api/download → server fetches private blob, streams with Content-Disposition: attachment
7. Vercel Blob cleanup via del() after download (or TTL)
```

State machine: `idle → uploading (with %) → processing → done → error`

---

## Top 5 Pitfalls

1. **Vercel 4.5 MB body limit** ← PHASE 1 BLOCKER
   - Warning: Direct POST of PDF to API route works locally, fails in production for any real PDF
   - Prevention: Implement Vercel Blob client-upload pattern from day one

2. **Ghostscript is unavailable on Vercel**
   - Warning: Any library calling `spawn('gs', ...)` throws ENOENT in production
   - Prevention: Use only pdf-lib (pure-JS) + sharp (prebuilt binary)

3. **`/tmp` does not persist between serverless invocations**
   - Warning: File written in upload handler not found in compress handler
   - Prevention: Use Vercel Blob for cross-invocation file sharing; UUID-namespace any /tmp writes

4. **Fake progress bars cause abandonment**
   - Warning: `setInterval` timer-driven progress that doesn't reflect real state
   - Prevention: Use XMLHttpRequest `progress` events for upload; show determinate spinner for compression

5. **Safari download broken with programmatic blob URLs**
   - Warning: `URL.createObjectURL` + `a.click()` redirects to viewer on iOS Safari
   - Prevention: Return `Content-Disposition: attachment` from `/api/download` HTTP response

---

## Open Questions (Empirical Testing Needed)

1. **Actual compression ratios**: pdf-lib alone achieves 10–40% on text PDFs; heavy image PDFs need pdf-lib + sharp. Benchmark on real-world samples before writing UX copy like "reduce by X%".
2. **Vercel Hobby timeout**: 60s max. A 20 MB image-heavy PDF through pdf-lib + sharp may take 15–45s. Load test before production.
3. **Vercel Blob free tier limits**: Confirm current Hobby plan storage + operation limits before launch.
4. **Private vs. public blob**: Private blobs require `/api/download` proxy (recommended for user file privacy).

---

## Phase Implications

**Phase 1** must resolve: Vercel Blob client-upload architecture, file validation, upload progress UI, project scaffolding.
**Phase 2** builds on Phase 1: Compression engine (pdf-lib + sharp), preset selection, stats display, download flow, error handling.
