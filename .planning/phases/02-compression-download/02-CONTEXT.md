# Phase 2: Compression & Download - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Полный цикл после загрузки: пользователь выбирает пресет, нажимает "Compress PDF", видит прогресс сжатия, получает статистику (размер до/после, % экономии), скачивает файл одним кликом. Оба файла (исходный + сжатый) удаляются из Vercel Blob после скачивания. Загрузка файла — в Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Preset Selector
- **D-01:** Preset selector размещается **внутри FileInfoCard** — между именем файла и кнопкой Compress. Не отдельная карточка.
- **D-02:** Компонент — Ant Design **Segmented** с тремя пунктами: Maximum Compression / Balanced / High Quality.
- **D-03:** **Balanced** выбран по умолчанию без действий пользователя (COMP-02).

### Compression Progress & UI
- **D-04:** Во время сжатия FileInfoCard показывает **spinner/loading state** — кнопка Compress переходит в состояние loading, preset selector блокируется. Отдельная progress-bar не нужна (сжатие — быстрая операция, не требует XHR-прогресса).
- **D-05:** После нажатия Compress кнопка отображает "Compressing…" (loading state Ant Design Button).

### Results Display
- **D-06:** После сжатия FileInfoCard **трансформируется в результаты** — preset selector и кнопка Compress заменяются статистикой и кнопкой Download. Новая карточка не создаётся.
- **D-07:** Статистика: верхняя строка "4.2 MB → 1.8 MB" (исходный → сжатый), ниже — badge "↓ 57% (− 2.4 MB)". Компактно, без сетки ячеек.

### Download Flow
- **D-08:** Кнопка **Download** (primary, large, block) — клик запускает скачивание через `/api/download`. После скачивания кнопка остаётся на странице (можно скачать повторно).
- **D-09:** Ссылка **"Сжать другой файл"** под кнопкой Download (Typography.Link, как "Upload another file" в Phase 1) — клик сбрасывает состояние в idle, удаляет оба файла через `/api/cleanup`.
- **D-10:** Скачиваемый файл получает имя `[оригинал]-compressed.pdf` (RES-03). Content-Disposition: attachment для корректной работы в Safari/iOS (UX-03).

### Error Handling (Compression)
- **D-11:** Ошибка сжатия отображается **в месте FileInfoCard** — карточка переходит в error state: красный border (#ff4d4f), заголовок ошибки, текст описания. Паттерн согласован с inline errors в DropZone (Phase 1).
- **D-12:** При ошибке сжатия показываются **две кнопки**: "Повторить" (повторить сжатие того же файла с тем же пресетом) и "Загрузить другой" (сброс в idle).

### Blob Cleanup (INFRA-02 completion)
- **D-13:** `/api/download` проксирует скачивание и вызывает `deleteBlobSafe()` для **обоих файлов** (исходный blobUrl + сжатый compressedBlobUrl) после отправки файла клиенту. Это закрывает INFRA-02 полностью.
- **D-14:** `/api/download` принимает body `{ blobUrl: string, compressedBlobUrl: string, filename: string }`, стримит сжатый файл с заголовками Content-Disposition и Content-Type, затем вызывает cleanup асинхронно.
- **D-15:** При сбросе "Сжать другой файл" существующий `/api/cleanup` вызывается с обоими URL (fire-and-forget, как в Phase 1).

### Claude's Discretion
- **Анимация трансформации FileInfoCard:** Плавный переход между состояниями (preset → stats → error). Рекомендация: opacity/translateY 200ms, как у FileInfoCard при первом появлении.
- **Текст ошибок сжатия (ERR-03):** Конкретные копии не зафиксированы — Claude выбирает информативные сообщения (heading + body), согласованные с Phase 1 error copy.
- **`/api/compress` runtime и timeout:** `export const runtime = 'nodejs'` обязателен (CLAUDE.md #3). Vercel Function timeout = 60s по умолчанию; если нужно больше для больших PDF — включить `maxDuration: 60` в route config.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — project vision, core value, constraints
- `.planning/REQUIREMENTS.md` — v1 requirements с REQ-IDs (Phase 2: COMP-01–04, RES-01–04, ERR-01–03, UX-03)
- `.planning/ROADMAP.md` — phase goals, success criteria, Plans 2.1–2.3

### Phase 1 Artifacts (что уже построено)
- `.planning/phases/01-foundation-upload/01-CONTEXT.md` — решения Phase 1, паттерны UI/UX
- `.planning/phases/01-foundation-upload/01-1.1-SUMMARY.md` — scaffold decisions (types, dark theme)
- `.planning/phases/01-foundation-upload/01-1.2-SUMMARY.md` — Upload UI patterns (DropZone, FileInfoCard, useReducer)
- `.planning/phases/01-foundation-upload/01-1.3-SUMMARY.md` — API route patterns (handleUpload, blobService)

### Research (Phase 1 — переиспользуется)
- `.planning/phases/01-foundation-upload/01-RESEARCH.md` — Vercel Blob patterns, pitfalls (MUST read: Pitfall #1 onUploadCompleted)
- `.planning/research/ARCHITECTURE.md` — data flow Vercel Blob client-upload + TypeScript типы
- `.planning/research/PITFALLS.md` — 15 pitfalls (особенно #3: fake progress, #5: BLOB_READ_WRITE_TOKEN)
- `.planning/research/STACK.md` — версии библиотек (pdf-lib 1.17.1, sharp 0.34.5, @vercel/blob 2.3.3)

### Architecture
- `CLAUDE.md` — Critical Architecture Decisions: #2 (No Ghostscript), #3 (runtime nodejs on /api/compress), #4 (separate routes)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/FileInfoCard.tsx` — Phase 2 расширяет этот компонент: добавляет Segmented preset selector, compression state, results display, Download кнопку. Existing: CheckCircleFilled, filename, size, onReset pattern.
- `services/blobService.ts` — `deleteBlobSafe(url)` — используется напрямую в `/api/download` для cleanup обоих файлов.
- `app/api/cleanup/route.ts` — уже принимает `{ url: string }` — для "Сжать другой файл" нужно расширить на два URL или вызвать дважды.
- `features/pdf/usePdfUpload.ts` — useReducer state machine с `UploadState`. Phase 2 расширяет: добавляет стадии `'compressing'` и `'compress-complete'` в `UploadStage`, новые action types, `compressedBlobUrl` в state.
- `types/upload.ts` — `UploadStage`, `UploadState`, `UploadAction`, `AppError` — Phase 2 добавляет новые значения в existing union types.

### Established Patterns
- **useReducer state machine** — все переходы через `dispatch`, нет прямых setState вызовов. Phase 2 добавляет action types: `COMPRESS_START`, `COMPRESS_DONE`, `COMPRESS_ERROR`.
- **Inline error display** — ошибки показываются в месте взаимодействия, не как toast/notification. FileInfoCard error state повторяет этот паттерн.
- **Fire-and-forget cleanup** — `fetch('/api/cleanup', ...).catch(() => {})` без await. Используется для оба cleanup вызова.
- **Ant Design dark theme tokens** — `#4f6ef7` accent, `#ff4d4f` error, `#52c41a` success, `#8888a8` secondary text. Сохранять консистентность.
- **`'use client'` boundary** — только в компонентах с hooks. `app/page.tsx` — Server Component. Phase 2 не меняет эту границу.

### Integration Points
- Phase 2 `usePdfUpload` расширение → `UploadSection.tsx` получает новые состояния → `FileInfoCard` рендерит соответствующий UI.
- `/api/compress` принимает `{ blobUrl: string, preset: string }` → возвращает `{ compressedBlobUrl: string, originalSize: number, compressedSize: number }`.
- `/api/download` принимает `{ blobUrl: string, compressedBlobUrl: string, filename: string }` → стримит файл → вызывает cleanup.
- `blobUrl` из Phase 1 `UploadState` передаётся напрямую в `/api/compress` — никакой повторной загрузки не нужно.

</code_context>

<specifics>
## Specific Ideas

- Кнопка "Повторить" при ошибке использует тот же `blobUrl` (файл ещё в Blob) — не требует повторной загрузки.
- Ant Design Segmented: `options={['Maximum', 'Balanced', 'High Quality']}`, `defaultValue="Balanced"`, блокируется (`disabled`) во время compressing.
- Статистика: верхняя строка — `{originalMb} MB → {compressedMb} MB` (14px semibold), ниже — Ant Design `Tag` с зелёным цветом: `↓ {percent}% (− {savedMb} MB)`.
- Download кнопка: type="primary" size="large" block, иконка `DownloadOutlined` слева.

</specifics>

<deferred>
## Deferred Ideas

- Повторное сжатие с другим пресетом без повторной загрузки — v2 (требует хранения исходного blobUrl после compress-complete).
- Batch compression — v2 backlog (удваивает сложность state machine).
- Email результатов — v2 backlog.

</deferred>

---

*Phase: 2-Compression & Download*
*Context gathered: 2026-05-19*
