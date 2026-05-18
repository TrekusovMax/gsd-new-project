# Roadmap — PDF Compression App

**Milestone:** MVP v1.0
**Phases:** 2
**Requirements:** 23 mapped | All v1 requirements covered ✓

---

## Phases Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Foundation & Upload | Рабочий стек + файл доходит до Vercel Blob | UPLOAD-01–05, INFRA-01–03, UX-01–02 | 5 |
| 2 | Compression & Download | Полный цикл: сжатие + статистика + скачивание | COMP-01–04, RES-01–04, ERR-01–03, UX-03 | 5 |

---

### Phase 1: Foundation & Upload

**Goal:** Настроить Next.js проект, реализовать полный upload flow с Vercel Blob client-upload. Пользователь может выбрать PDF (drag&drop или диалог), видеть прогресс загрузки и получить подтверждение, что файл загружен.

**Mode:** mvp

**Requirements:** UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04, UPLOAD-05, INFRA-01, INFRA-02, INFRA-03, UX-01, UX-02

**Success Criteria:**
1. Пользователь может перетащить PDF на страницу и видеть прогресс загрузки (0–100%)
2. Пользователь видит ошибку при загрузке не-PDF файла или файла > 20 MB до начала загрузки
3. PDF успешно загружается в Vercel Blob (файл виден в Vercel dashboard)
4. Загрузка работает на мобильном устройстве (iOS Safari, Android Chrome)
5. После успешной загрузки пользователь видит UI-индикатор готовности к сжатию

**Plans:** 3 plans
Plans:
- [x] 01-PLAN-1.1.md — Next.js 16 scaffold + TypeScript strict + Ant Design dark theme + type contracts (commit 90f1153)
- [x] 01-PLAN-1.2.md — Upload UI: DropZone (5 states) + pdfValidation + usePdfUpload + FileInfoCard (commit 1cad99a)
- [ ] 01-PLAN-1.3.md — API routes: /api/upload token handshake + /api/cleanup + Vercel deploy

**Key Decisions:**
- Vercel Blob client-upload pattern обязателен из-за лимита 4.5 MB на тело запроса
- `export const runtime = 'nodejs'` на всех heavy API routes
- Ant Design Upload component как базовый, обёрнут в кастомную логику

---

### Phase 2: Compression & Download

**Goal:** Реализовать сжатие PDF (pdf-lib + sharp), выбор пресета, отображение статистики и скачивание результата. По завершении пользователь может пройти полный цикл upload → compress → download за 3 клика.

**Mode:** mvp

**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04, RES-01, RES-02, RES-03, RES-04, ERR-01, ERR-02, ERR-03, UX-03

**Success Criteria:**
1. Пользователь выбирает пресет (Balanced по умолчанию) и нажимает "Compress" — PDF сжимается и статистика отображается
2. Пользователь видит исходный размер, сжатый размер, % и МБ экономии после сжатия
3. Пользователь скачивает сжатый файл с именем `[оригинал]-compressed.pdf`
4. Скачивание работает в Safari/iOS через Content-Disposition: attachment
5. Ошибки (сбой сжатия, таймаут) показываются пользователю с понятным сообщением и возможностью повторить

**Plans:**
- `PLAN-2.1`: Compression engine (/api/compress — pdf-lib + sharp + пресеты)
- `PLAN-2.2`: Compression UI (preset selector + progress + stats display)
- `PLAN-2.3`: Download flow + error handling + "Compress another" reset

**Key Decisions:**
- pdf-lib 1.17.1 (pure-JS) + sharp 0.34.5 для image recompression — нет Ghostscript на Vercel
- Синхронный request-response (без очереди): pdf-lib + sharp на 20 MB PDF занимает 5–20s
- Private Vercel Blob + /api/download proxy для безопасного скачивания
- Файлы удаляются из Vercel Blob сразу после скачивания

---

## Deferred (v2)

- Batch compression
- Dashboard / история файлов
- Аутентификация
- Cloud storage (S3)
- Processing queue

---

## Architecture Notes

Критические решения, принятые на уровне roadmap:

1. **Vercel Blob client-upload** — обязателен из-за лимита 4.5 MB. Паттерн: browser → CDN (через SDK token), /api/compress fetches from CDN.
2. **Stack**: pdf-lib 1.17.1 + sharp 0.34.5 + @vercel/blob 2.3.3 + Ant Design
3. **State machine**: idle → uploading → processing → done → error (useReducer)
4. **Отдельные routes**: /api/upload (только token), /api/compress (тяжёлая логика), /api/download (proxy)
