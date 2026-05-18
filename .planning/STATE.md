# Project State — PDF Compression App

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-18)

**Core value:** Пользователь загружает PDF, сжимает и скачивает — максимум 3 клика, без регистрации.
**Current focus:** Phase 1 — Foundation & Upload

---

## Current Status

**Phase:** 1 of 2
**Stage:** Phase 1 complete — all 3 plans done
**Milestone:** MVP v1.0
**Current Plan:** Phase 1 complete → ready for Phase 2

---

## Phase Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation & Upload | Complete — 3/3 plans done | PLAN-1.3 done (commit 0633945 + human-verified) |
| Phase 2: Compression & Download | Not started | Blocked on Phase 1 |

## Plan Progress — Phase 1

| Plan | Status | Commit |
|------|--------|--------|
| PLAN-1.1: Next.js scaffold + dark theme + type contracts | Complete | 90f1153 |
| PLAN-1.2: Upload UI (DropZone + pdfValidation + usePdfUpload + FileInfoCard) | Complete | 1cad99a |
| PLAN-1.3: API routes (/api/upload + /api/cleanup + Vercel deploy) | Complete | 0633945 + human-verified |

## Last Session

**Stopped at:** PLAN-1.3 complete — API routes (/api/upload, /api/cleanup, blobService) + end-to-end upload verified
**Resume file:** `.planning/phases/02-compression-download/02-PLAN-2.1.md`
**Date:** 2026-05-18

---

## Key Context

- **Critical constraint**: Vercel 4.5 MB body limit → Vercel Blob client-upload pattern required
- **Stack locked**: pdf-lib 1.17.1 + sharp 0.34.5 + @vercel/blob 2.3.3 + Ant Design
- **No Ghostscript**: System binaries unavailable on Vercel Lambda
- **Runtime**: `export const runtime = 'nodejs'` required on compress route

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-18 | 2 phases for MVP | User preference: no over-engineering, just working MVP |
| 2026-05-18 | Vercel Blob client-upload | Vercel 4.5 MB body limit makes direct POST non-viable |
| 2026-05-18 | pdf-lib + sharp (no Ghostscript) | Vercel Lambda has no system binaries |
| 2026-05-18 | Sequential execution | User preference |
| 2026-05-18 | Balanced preset as default | UX research: users expect pre-selected default |
| 2026-05-18 | layout.tsx as 'use client' | Required for Ant Design ConfigProvider SSR — avoids hydration mismatch (RESEARCH.md Pitfall 2) |
| 2026-05-18 | turbopack.root in next.config.ts | Silences workspace root detection warning when multiple package-lock.json exist |
| 2026-05-18 | cacheControlMaxAge server-side only | Client SDK UploadOptions не поддерживает этот параметр — устанавливается через onBeforeGenerateToken в /api/upload |
| 2026-05-18 | RefObject<T\|null> in React 19 | useRef<HTMLInputElement>(null) возвращает RefObject<HTMLInputElement \| null> — prop типы обновлены |
