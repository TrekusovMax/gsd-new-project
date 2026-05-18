# PDF Compression App — Project Guide

## Project

Современное web-приложение для сжатия PDF-документов. Стек: Next.js (App Router) + TypeScript + Ant Design + Vercel Blob. Развёртывание на Vercel.

**Core value:** Пользователь загружает PDF, сжимает и скачивает — максимум 3 клика, без регистрации.

## GSD Workflow

This project uses GSD (Get Shit Done) for AI-assisted development.

```
/gsd-discuss-phase N   — обсудить фазу перед планированием
/gsd-plan-phase N      — создать план фазы
/gsd-execute-phase N   — выполнить план
/gsd-verify-work       — проверить результаты
/gsd-progress          — текущий статус
```

**Current phase:** Phase 1 — Foundation & Upload

## Critical Architecture Decisions

1. **Vercel Blob client-upload** — обязателен. Vercel enforces 4.5 MB body limit on serverless functions. Direct PDF POST to API route fails in production. Pattern: browser uploads to CDN via SDK token, then /api/compress fetches from CDN URL.

2. **No Ghostscript** — system binaries unavailable on Vercel Lambda. Use pdf-lib (pure-JS) + sharp (prebuilt binary).

3. **`export const runtime = 'nodejs'`** — required on /api/compress. pdf-lib uses Node.js Buffer APIs; Edge Runtime is incompatible.

4. **Separate routes**: `/api/upload` (token handshake only), `/api/compress` (heavy processing), `/api/download` (private blob proxy).

## Stack

- **Frontend**: Next.js 15 (App Router), React, TypeScript, Ant Design
- **PDF processing**: pdf-lib 1.17.1 + sharp 0.34.5
- **Storage**: @vercel/blob 2.3.3
- **Deployment**: Vercel

## Planning Artifacts

- `.planning/PROJECT.md` — project context and requirements
- `.planning/ROADMAP.md` — 2-phase plan
- `.planning/REQUIREMENTS.md` — all v1 requirements with REQ-IDs
- `.planning/STATE.md` — current project state
- `.planning/research/` — ecosystem research (stack, features, architecture, pitfalls)

## Development Standards

- TypeScript strict mode
- Reusable components in `/components`
- Feature logic in `/features/pdf`
- No comments unless WHY is non-obvious
- ESLint + Prettier
