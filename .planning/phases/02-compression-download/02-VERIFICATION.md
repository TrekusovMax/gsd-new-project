---
phase: 02-compression-download
verified: 2026-05-19T14:00:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Скачать файл на iPhone/iPad (Safari) — проверить что браузер сохраняет файл, а не открывает PDF встроенным просмотрщиком"
    expected: "Браузер показывает диалог сохранения или сохраняет файл с именем [оригинал]-compressed.pdf, PDF не открывается в Safari Reader"
    why_human: "Content-Disposition: attachment корректен в коде, но поведение Safari/iOS-WebView зависит от версии и настроек. Программно не проверяется."
  - test: "Полный E2E сценарий: загрузить PDF → выбрать пресет Maximum → нажать Compress → дождаться статистики → нажать Download → нажать 'Сжать другой файл'"
    expected: "1) Во время сжатия Segmented заблокирован, кнопка показывает loading. 2) После — видна строка 'X.X MB → Y.Y MB', зелёный Tag '↓ N% (− Z.Z MB)'. 3) Файл скачивается с именем [оригинал]-compressed.pdf. 4) 'Сжать другой файл' возвращает в idle, оба файла удалены из Vercel Blob."
    why_human: "Интеграционный сценарий с живым Vercel Blob. Нельзя запустить без реального BLOB_READ_WRITE_TOKEN и активного деплоя."
  - test: "Загрузить зашифрованный (password-protected) PDF, нажать Compress"
    expected: "FileInfoCard переходит в error state: красный бордер, заголовок 'Password-protected PDF', текст 'This PDF is password-protected. Remove the password and try again.', кнопки 'Повторить' и 'Загрузить другой'"
    why_human: "Требует реальный зашифрованный PDF-файл и живой /api/compress."
  - test: "Проверить, что оба файла (оригинал + сжатый) удалены из Vercel Blob после нажатия Download"
    expected: "Повторный запрос к URL оригинала и URL сжатого файла возвращает 404 через ~5 сек после скачивания"
    why_human: "del() вызывается fire-and-forget; нужен доступ к Vercel dashboard или повторный fetch к blob URL после скачивания."
---

# Phase 2: Compression & Download — Verification Report

**Phase Goal:** Полный цикл сжатия: пользователь выбирает пресет → жмёт Compress → видит прогресс → получает статистику → скачивает файл одним кликом. Оба файла удаляются из Vercel Blob после скачивания.
**Verified:** 2026-05-19T14:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Пользователь выбирает пресет (Balanced по умолчанию) и нажимает "Compress" — PDF сжимается и статистика отображается | ✓ VERIFIED | `initialState.preset = 'balanced'` в `usePdfUpload.ts:14`. `FileInfoCard` рендерит `Segmented` с `value={preset}` при `stage='upload-complete'`. `handleCompress` диспатчит `COMPRESS_START` → вызывает `/api/compress` → диспатчит `COMPRESS_DONE`. Reducer корректно переводит стейт в `compress-complete`. |
| 2 | Пользователь видит исходный размер, сжатый размер, % и МБ экономии | ✓ VERIFIED | `FileInfoCard.tsx:192-213`: при `stage='compress-complete'` рендерит `{formatMB(originalSize)} → {formatMB(compressedSize)}` и `Tag color="#52c41a"` с `↓ {percent}% (− {savedMB})`. Данные приходят из `COMPRESS_DONE` payload через `/api/compress`, который возвращает `{ compressedBlobUrl, originalSize, compressedSize }`. |
| 3 | Пользователь скачивает сжатый файл с именем `[оригинал]-compressed.pdf` | ✓ VERIFIED | `usePdfUpload.ts:241`: `a.download = \`${state.file.name.replace(/\.pdf$/i, '')}-compressed.pdf\``. Дополнительно, `/api/download/route.ts:30`: `downloadFilename = \`${safeName}-compressed.pdf\``, который используется в `Content-Disposition` заголовке. |
| 4 | Скачивание работает в Safari/iOS через Content-Disposition: attachment | ✓ VERIFIED | `app/api/download/route.ts:50`: `'Content-Disposition': \`attachment; filename="${downloadFilename}"\``. Файл стримится через нативный `Response` с этим заголовком. Поведение в реальном Safari требует human-проверки (см. ниже). |
| 5 | Ошибки (сбой сжатия, таймаут) показываются с понятным сообщением и возможностью повторить | ✓ VERIFIED | `FileInfoCard.tsx:223-272`: `stage='error'` рендерит красный бордер (`#ff4d4f`), `error.heading`, `error.message`, кнопки "Повторить" (`onRetry`) и "Загрузить другой" (`onReset`). `handleCompress` в `usePdfUpload.ts:186-199` диспатчит `COMPRESS_ERROR` с типизированными `ENCRYPTED_PDF` / `COMPRESSION_FAILED` кодами. |

**Score: 5/5 Success Criteria verified**

---

## Requirements Coverage

| Requirement | Source Plan | Описание | Status | Evidence |
|-------------|------------|----------|--------|---------|
| COMP-01 | PLAN-2.1 / PLAN-2.2 | Три пресета: Maximum / Balanced / High Quality | ✓ SATISFIED | `PRESET_CONFIG` в `pdfCompressor.ts:12-16`; `Segmented` с тремя options в `FileInfoCard.tsx:133-143` |
| COMP-02 | PLAN-2.1 / PLAN-2.2 | Balanced по умолчанию | ✓ SATISFIED | `initialState.preset = 'balanced'` в `usePdfUpload.ts:14` |
| COMP-03 | PLAN-2.1 | Серверное сжатие pdf-lib + sharp | ✓ SATISFIED | `pdfCompressor.ts`: два прохода — Pass 1 (sharp image re-encoding) + Pass 2 (`pdfDoc.save({ useObjectStreams: true })`); вызывается из `/api/compress` |
| COMP-04 | PLAN-2.2 | Индикатор обработки во время сжатия | ✓ SATISFIED | `FileInfoCard.tsx:162-187`: `stage='compressing'` — `Segmented disabled`, `Button loading disabled` с текстом "Compressing…" |
| RES-01 | PLAN-2.2 | Статистика после сжатия | ✓ SATISFIED | `FileInfoCard.tsx:192-213`: `formatMB`, `calcSavings`, `Tag color="#52c41a"` при `compress-complete` |
| RES-02 | PLAN-2.2 / PLAN-2.3 | Скачать одним нажатием | ✓ SATISFIED | Download Button (`DownloadOutlined`) → `onDownload` → `handleDownload` → `fetch('/api/download')` → blob URL + `a.click()` |
| RES-03 | PLAN-2.3 | Имя файла `[оригинал]-compressed.pdf` | ✓ SATISFIED | `usePdfUpload.ts:241` (client `a.download`) + `download/route.ts:30` (server `Content-Disposition filename`) |
| RES-04 | PLAN-2.2 / PLAN-2.3 | CTA "Сжать другой файл" | ✓ SATISFIED | `FileInfoCard.tsx:215-219`: `Typography.Link` → `onReset`; `handleReset` в `usePdfUpload.ts:156-168` вызывает `/api/cleanup` с обоими URL и диспатчит `RESET` |
| ERR-03 | PLAN-2.1 / PLAN-2.2 / PLAN-2.3 | Сообщение при сбое сжатия | ✓ SATISFIED | `handleCompress` диспатчит `COMPRESS_ERROR` с heading/message; `FileInfoCard` рендерит error state с кнопками retry/reset |
| UX-03 | PLAN-2.3 | Content-Disposition: attachment для Safari | ✓ SATISFIED | `app/api/download/route.ts:50`: заголовок установлен корректно; human-проверка для iOS-специфичного поведения помечена ниже |
| ERR-01 | — | Ошибка при не-PDF файле | ✓ SATISFIED (Phase 1) | Реализовано в Phase 1: `validateFileType` в `pdfValidation.ts`, DropZone error state. Трассировка REQUIREMENTS.md относит к Phase 2, но код существует с Phase 1. |
| ERR-02 | — | Ошибка при файле > 20 MB | ✓ SATISFIED (Phase 1) | Реализовано в Phase 1: `validateFileSize` в `pdfValidation.ts`. Аналогично ERR-01. |

**Все 10 заявленных REQ-IDs закрыты. ERR-01, ERR-02 закрыты в Phase 1 и подтверждены в 01-VERIFICATION.md.**

---

## Architecture Constraints (CLAUDE.md)

| Constraint | Required | Status | Evidence |
|-----------|---------|--------|---------|
| No Ghostscript | Использовать pdf-lib + sharp | ✓ | `pdfCompressor.ts`: только `pdf-lib` + `sharp`, без системных бинарей |
| `runtime = 'nodejs'` на /api/compress | Обязателен (pdf-lib требует Node.js Buffer API) | ✓ | `compress/route.ts:7`: `export const runtime = 'nodejs'` |
| `runtime = 'nodejs'` на /api/download | Обязателен для консистентности | ✓ | `download/route.ts:1`: `export const runtime = 'nodejs'` |
| Отдельные routes | /api/upload, /api/compress, /api/download | ✓ | Все три маршрута существуют как независимые файлы |
| Vercel Blob client-upload | Обязателен (лимит 4.5 MB) | ✓ | `/api/compress` принимает `blobUrl` (не тело файла), fetch из Blob CDN server-side |

---

## Decisions Coverage (D-01 — D-15)

| Решение | Описание | Status | Evidence |
|--------|----------|--------|---------|
| D-01 | Preset selector внутри FileInfoCard | ✓ | `FileInfoCard.tsx:132-152` |
| D-02 | Ant Design Segmented, три пункта | ✓ | `FileInfoCard.tsx:133-143` |
| D-03 | Balanced по умолчанию | ✓ | `initialState.preset = 'balanced'` |
| D-04 | Loading state во время сжатия | ✓ | `FileInfoCard.tsx:162-187`: Segmented disabled, Button loading |
| D-05 | Кнопка показывает "Compressing…" | ✓ | `FileInfoCard.tsx:183` |
| D-06 | FileInfoCard трансформируется в результаты | ✓ | `key={stage}` на wrapper div; `stage='compress-complete'` рендерит stats |
| D-07 | Статистика: "X.X MB → Y.Y MB" + badge | ✓ | `FileInfoCard.tsx:197-201` |
| D-08 | Download кнопка primary/large/block, остаётся после скачивания | ✓ | `FileInfoCard.tsx:202-211`; нет state transition после download |
| D-09 | "Сжать другой файл" → reset + cleanup | ✓ | `FileInfoCard.tsx:215-219`; `handleReset` с cleanup |
| D-10 | Имя `[оригинал]-compressed.pdf`, Content-Disposition: attachment | ✓ | `download/route.ts:28-31, 50` |
| D-11 | Ошибка в месте FileInfoCard, красный бордер | ✓ | `FileInfoCard.tsx:223-272` |
| D-12 | Две кнопки при ошибке: "Повторить" + "Загрузить другой" | ✓ | `FileInfoCard.tsx:255-269` |
| D-13 | /api/download вызывает deleteBlobSafe для обоих файлов | ✓ | `download/route.ts:56`: `void del([compressedBlobUrl, blobUrl])` |
| D-14 | /api/download принимает `{blobUrl, compressedBlobUrl, filename}`, стримит с заголовками | ✓ | `download/route.ts`: Zod schema, streaming Response, Content-Disposition |
| D-15 | "Сжать другой файл" → /api/cleanup с обоими URL | ✓ | `usePdfUpload.ts:157-165`: `...(state.compressedBlobUrl ? { compressedUrl: state.compressedBlobUrl } : {})` |

**Все 15 решений D-01 — D-15 выполнены.**

---

## Required Artifacts

| Artifact | Ожидается | Status | Details |
|---------|----------|--------|---------|
| `types/upload.ts` | CompressionPreset, расширенные UploadStage/UploadAction/UploadState | ✓ VERIFIED | 7 UploadStage значений, 14 UploadAction вариантов, 4 новых поля в UploadState |
| `services/pdfCompressor.ts` | `compressPdf(inputBuffer, preset): Promise<Buffer>` | ✓ VERIFIED | Два прохода: Pass 1 (sharp image re-encoding с per-image try/catch) + Pass 2 (pdfDoc.save useObjectStreams) |
| `app/api/compress/route.ts` | POST, runtime=nodejs, maxDuration=60, SSRF guard | ✓ VERIFIED | Все требования: строки 7-8 (runtime/maxDuration), строка 31 (SSRF), строки 51-64 (error classification) |
| `app/api/download/route.ts` | POST, runtime=nodejs, maxDuration=30, Content-Disposition, del after Response | ✓ VERIFIED | head()+fetch(downloadUrl) streaming, Content-Disposition:attachment, del() fire-and-forget после new Response() |
| `app/api/cleanup/route.ts` | Опциональный `compressedUrl`, backward-compatible | ✓ VERIFIED | Zod schema с `.optional()`, sequential deleteBlobSafe |
| `features/pdf/usePdfUpload.ts` | handleCompress, handleDownload, handleRetry, handleSetPreset; COMPRESS_* reducer cases | ✓ VERIFIED | Все 4 обработчика экспортированы, reducer закрывает все 14 вариантов с exhaustive never check |
| `components/FileInfoCard.tsx` | 4 stage branches, error prop, PLAN-2.3 comment удалён | ✓ VERIFIED | Все 4 ветки реализованы (строки 129-272), PLAN-2.3 comment отсутствует (заменён реальным JSX) |
| `components/UploadSection.tsx` | FileInfoCard для 4 стадий со всеми props | ✓ VERIFIED | Условие строки 51-55 покрывает все 4 стадии; все required props переданы |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `UploadSection` | `FileInfoCard` | Все 4 stage значения + 9 props | ✓ WIRED | `UploadSection.tsx:51-69` |
| `usePdfUpload.handleCompress` | `/api/compress` | `fetch('/api/compress', { method: 'POST', body: JSON.stringify({blobUrl, preset, filename}) })` | ✓ WIRED | `usePdfUpload.ts:176-184` |
| `usePdfUpload.handleDownload` | `/api/download` | `fetch('/api/download', { method: 'POST', body: JSON.stringify({blobUrl, compressedBlobUrl, filename}) })` | ✓ WIRED | `usePdfUpload.ts:225-233` |
| `usePdfUpload.handleReset` | `/api/cleanup` | `fetch('/api/cleanup', { body: { url, compressedUrl? } })` | ✓ WIRED | `usePdfUpload.ts:157-165` |
| `/api/compress` | `pdfCompressor.compressPdf` | `import { compressPdf }` + вызов с pdfBuffer + preset | ✓ WIRED | `compress/route.ts:5, 50` |
| `/api/compress` | Vercel Blob `put` | `put(uploadName, compressedBuffer, { access: 'private' })` | ✓ WIRED | `compress/route.ts:72-77` |
| `/api/download` | Vercel Blob `head` + `del` | `head(compressedBlobUrl)` + `fetch(blobMeta.downloadUrl)` + `del([...])` | ✓ WIRED | `download/route.ts:33-56` |
| `FileInfoCard stage=compress-complete` | `originalSize/compressedSize` props | `calcSavings(originalSize, compressedSize)` → рендер Tag и форматированная строка | ✓ WIRED | `FileInfoCard.tsx:192-213` |
| `FileInfoCard stage=error` | `error.heading/error.message` | Условный рендер внутри `{error && (...)}` | ✓ WIRED | `FileInfoCard.tsx:232-251` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---------|--------------|--------|-------------------|--------|
| `FileInfoCard` (compress-complete) | `originalSize`, `compressedSize` | `COMPRESS_DONE` action ← `/api/compress` response | ✓ `/api/compress` возвращает реальные `pdfBuffer.length` / `compressedBuffer.length` (строки 46, 66) | ✓ FLOWING |
| `FileInfoCard` (error) | `error.heading`, `error.message` | `COMPRESS_ERROR` action ← `handleCompress` error path | ✓ Реальные строки из error classification (не заглушки) | ✓ FLOWING |
| `FileInfoCard` (compressing) | `stage` | `COMPRESS_START` dispatch в `handleCompress` | ✓ Dispatch вызывается до fetch, переход детерминирован | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---------|--------|--------|--------|
| TypeScript компилируется без ошибок | `npx tsc --noEmit` | Exit 0, нет вывода | ✓ PASS |
| SSRF guard отклоняет не-Vercel URL | Regex `\.blob\.vercel-storage\.com$` проверен в коде | `compress/route.ts:31` — guard присутствует | ✓ PASS |
| del() вызывается после Response, не до | Порядок строк: `new Response(...)` строка 47, `void del(...)` строка 56 | Корректный порядок | ✓ PASS |
| Все 14 UploadAction вариантов обработаны | exhaustive `never` check компилируется | `tsc --noEmit` exit 0 | ✓ PASS |
| PLAN-2.3 comment marker удалён | `grep "PLAN-2.3: add compress-error" FileInfoCard.tsx` | Нет совпадений | ✓ PASS |
| Нет `any` в новых файлах | `grep ": any\|as any" pdfCompressor.ts compress/route.ts download/route.ts` | Нет совпадений | ✓ PASS |
| Нет TBD/FIXME/XXX/TODO в ts/tsx файлах | `grep TBD\|FIXME\|XXX\|TODO` во всех .ts/.tsx | Нет совпадений | ✓ PASS |

---

## Anti-Patterns Found

Нет блокирующих антипаттернов.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `usePdfUpload.ts` | 246 | `catch {} // Silent fail` в handleDownload | ℹ️ Info | Ошибка скачивания не отображается пользователю, но Download кнопка остаётся доступной для повтора. Поведение намеренно задокументировано в PLAN-2.2 (D-08). |

---

## Human Verification Required

### 1. Safari/iOS Download Behavior

**Test:** Открыть приложение на iPhone/iPad в Safari. Загрузить PDF, нажать Compress, после завершения нажать Download.
**Expected:** Браузер сохраняет файл с именем `[оригинал]-compressed.pdf` — показывает диалог скачивания или сохраняет в Файлы/Downloads. PDF не открывается встроенным Safari Reader.
**Why human:** `Content-Disposition: attachment` присутствует в коде (`download/route.ts:50`), но поведение Safari на iOS зависит от версии OS и настроек "Скачивания" в браузере. Единственная надёжная проверка — ручной тест на реальном устройстве.

### 2. Полный E2E сценарий с живым Vercel Blob

**Test:** На задеплоенном приложении (Vercel): загрузить PDF > 1 MB → выбрать Maximum → нажать Compress → дождаться загрузки → проверить статистику → нажать Download → нажать "Сжать другой файл".
**Expected:**
1. Segmented заблокирован во время сжатия, кнопка показывает loading "Compressing…"
2. После сжатия — строка "X.X MB → Y.Y MB" и зелёный Tag "↓ N% (− Z.Z MB)"
3. Скачанный файл имеет имя `[оригинал]-compressed.pdf` и корректно открывается
4. После "Сжать другой файл" — приложение возвращается в idle
**Why human:** Полный сценарий требует активного Vercel Blob с `BLOB_READ_WRITE_TOKEN` и реального PDF. Нельзя воспроизвести программно без запуска сервера.

### 3. Ошибка при зашифрованном PDF

**Test:** Загрузить зашифрованный (password-protected) PDF, нажать Compress.
**Expected:** FileInfoCard переходит в error state: красный бордер, заголовок "Password-protected PDF", сообщение с инструкцией убрать пароль, кнопки "Повторить" и "Загрузить другой".
**Why human:** Требует реальный зашифрованный PDF-файл и запущенный `/api/compress`.

### 4. Проверка удаления файлов из Vercel Blob после скачивания

**Test:** После успешного скачивания выполнить GET-запрос к `blobUrl` и `compressedBlobUrl` (взять из Network tab DevTools).
**Expected:** Оба URL возвращают 404 или Forbidden в течение нескольких секунд после скачивания.
**Why human:** `del([compressedBlobUrl, blobUrl])` fire-and-forget — верификация удаления требует проверки реального Vercel Blob storage.

---

## Gaps Summary

Автоматически проверяемых gaps не обнаружено.

Все 10 требований (COMP-01–04, RES-01–04, ERR-03, UX-03) верифицированы в коде. Все 15 решений D-01–D-15 выполнены. Архитектурные ограничения CLAUDE.md соблюдены. TypeScript компилируется без ошибок (`npx tsc --noEmit` exit 0).

Статус `human_needed` выставлен из-за 4 сценариев, требующих ручного тестирования на реальном устройстве / деплое — прежде всего поведение Safari/iOS и E2E с живым Vercel Blob.

---

_Verified: 2026-05-19T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
