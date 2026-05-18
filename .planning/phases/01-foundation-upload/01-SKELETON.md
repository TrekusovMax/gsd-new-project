# Walking Skeleton — PDF Compression App

**Phase:** 1
**Generated:** 2026-05-18

## Capability Proven End-to-End

User drags or selects a PDF file, sees a real XHR upload progress bar (0–100%), the file is stored in Vercel Blob, and user receives a File info card with filename, size, and a placeholder "Compress PDF" button.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.6 App Router | Locked in project decisions; serverless-native, Vercel-optimized |
| File storage | Vercel Blob (@vercel/blob 2.3.3) client-upload pattern | Vercel enforces 4.5 MB body limit on serverless functions; client-upload bypasses this by having the browser PUT directly to CDN using a short-lived token |
| Upload token | /api/upload route — handleUpload() server-side only | BLOB_READ_WRITE_TOKEN must never reach the browser; token generation is server-only |
| Auth | None (anonymous upload) | MVP requirement: no registration, max 3 clicks to result |
| Deployment target | Vercel (serverless + CDN) | Blob store, preview deployments, and zero-config Next.js support |
| Component library | Ant Design 6.4.2 with darkAlgorithm | Locked; dark theme via ConfigProvider with token overrides in layout.tsx |
| State management | useReducer (5-state machine) | Linear upload flow (idle → drag-over → uploading → complete → error); Zustand would be overengineering |
| Directory layout | app/, components/, features/pdf/, hooks/, services/, types/ | Per D-08; CLAUDE.md convention (components/ for reusable, features/pdf/ for domain logic) |
| TypeScript | Strict mode ("strict": true) | Per D-09 and CLAUDE.md |
| PDF processing | NOT installed in Phase 1 | pdf-lib + sharp needed only for Phase 2 compression route |
| Blob cleanup | del() on reset + cacheControlMaxAge TTL | Serverless has no daemon; opportunistic cleanup on "Upload another file" + TTL fallback |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16.2.6, TypeScript strict, Ant Design 6.4.2, @vercel/blob 2.3.3)
- [x] Routing — app/page.tsx (upload page) + app/api/upload/route.ts + app/api/cleanup/route.ts
- [x] File storage — Vercel Blob client-upload (real write to CDN via browser PUT)
- [x] UI — DropZone (5 states), FileInfoCard, UploadProgress, AppHeader — all wired to usePdfUpload hook
- [x] Deployment — Vercel preview deployment with BLOB_READ_WRITE_TOKEN configured

## Key Constraints Established

1. **Never POST file bytes to an API route** — 413 FUNCTION_PAYLOAD_TOO_LARGE on Vercel for any real PDF
2. **No `export const runtime = 'edge'`** on any route touching Blob SDK — use default nodejs
3. **`BLOB_READ_WRITE_TOKEN` server-only** — no NEXT_PUBLIC_ prefix, never in client bundles
4. **ConfigProvider wraps body as 'use client'** — required to avoid Ant Design CSS-in-JS hydration mismatch
5. **`serverExternalPackages: ['sharp']`** in next.config.ts — prepares for Phase 2 without needing change

## Out of Scope (Deferred to Later Slices)

- PDF compression (pdf-lib + sharp), preset selector, statistics display — Phase 2
- /api/compress and /api/download routes — Phase 2
- "Compress PDF" button functionality (placeholder only in Phase 1)
- Dashboard, auth, history — v2 backlog
- Batch processing — v2 backlog

## Subsequent Slice Plan

- **Phase 2:** User selects compression preset (Balanced default), clicks "Compress PDF", sees original size / compressed size / savings stats, downloads compressed file as `[filename]-compressed.pdf`. Routes: /api/compress (pdf-lib + sharp, nodejs runtime) + /api/download (private blob proxy with Content-Disposition: attachment). Error handling for compression failure and timeout.
