# Phase 1: Foundation & Upload - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Настройка Next.js проекта с нуля + полный upload flow: пользователь перетаскивает или выбирает PDF, видит прогресс загрузки, файл сохраняется в Vercel Blob, пользователь видит карточку с информацией о файле. Сжатие — в Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Layout & Visual
- **D-01:** Single-purpose страница без навигации. Весь экран — upload зона + название приложения в минимальном header (логотип/название, без nav-пунктов).
- **D-02:** Centered card upload zone, ~600px ширина, центрирована по вертикали и горизонтали на странице.
- **D-03:** Текст "Up to 20 MB" всегда виден в upload зоне — не только при ошибке.

### Post-upload State
- **D-04:** После успешной загрузки в Vercel Blob показывается File info card: имя файла, размер, зелёный чекмарк, кнопка "Compress PDF" (Phase 2 добавит логику сжатия), ссылка "Upload another file".
- **D-05:** Drop zone остаётся видимой после загрузки — пользователь может перетащить новый файл в любой момент для замены.

### Error UX
- **D-06:** Ошибки валидации (не PDF, > 20 MB) показываются inline внутри drop zone: красный border, иконка + текст ошибки внутри зоны. Без toast/popup.
- **D-07:** Текст ошибки исчезает когда пользователь начинает новый drag или кликает в зону снова.

### Project Structure
- **D-08:** Standard Next.js root (без monorepo). Структура: `app/`, `components/`, `features/pdf/`, `hooks/`, `services/`, `types/`.
- **D-09:** TypeScript strict mode (`"strict": true` в tsconfig).

### Infrastructure Scope
- **D-10:** INFRA-02 scope split по фазам: Phase 1 реализует on-reset cleanup через `/api/cleanup` (del() при нажатии "Upload another file"). Cleanup после скачивания (post-download del()) деферирован в Phase 2, где появится `/api/download`. `cacheControlMaxAge: 3600` устанавливается для CDN cache-control — не является TTL хранилища.

### Claude's Discretion
- **Theme:** Цветовая тема выбирается разработчиком. Рекомендация: использовать Ant Design dark theme (`theme.darkAlgorithm`) — современно, подходит для инструментального продукта, хорошо выглядит с синими/фиолетовыми акцентами.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — project vision, requirements, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements с REQ-IDs (Phase 1 требования: UPLOAD-01–05, INFRA-01–03, UX-01–02)
- `.planning/ROADMAP.md` — phase goals, success criteria, Plans 1.1–1.3

### Research Findings
- `.planning/research/SUMMARY.md` — сводка всех исследований: стек, архитектура, pitfalls
- `.planning/research/ARCHITECTURE.md` — детальный data flow Vercel Blob client-upload + TypeScript типы
- `.planning/research/PITFALLS.md` — 15 конкретных pitfalls с prevention strategies (особенно #1 — 4.5 MB body limit)
- `.planning/research/STACK.md` — версии библиотек, Vercel compatibility, что NOT использовать

### No external ADRs or specs — requirements fully captured in decisions above and referenced research files.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Нет существующего кода — greenfield проект.

### Established Patterns
- Нет — первая фаза устанавливает все паттерны.

### Integration Points
- Phase 1 создаёт `/api/upload` (Vercel Blob token handshake) — Phase 2 будет использовать полученный blobUrl для вызова `/api/compress`.
- State machine (`useReducer`) созданная в Phase 1 будет расширена в Phase 2 для compression states.

</code_context>

<specifics>
## Specific Ideas

- Кнопка "Compress PDF" на File info card в Phase 1 существует как placeholder — Phase 2 добавит к ней preset selector и логику сжатия.
- Drop zone должна поддерживать drag-over visual feedback (подсветка border, смена иконки) пока файл находится над зоной.
- Ant Design `Upload.Dragger` используется как основа, обёрнутый в кастомный компонент с собственной логикой загрузки через Vercel Blob SDK.

</specifics>

<deferred>
## Deferred Ideas

- Компрессия, preset selector, статистика, скачивание — Phase 2.
- Dashboard, история файлов, аутентификация — v2 backlog.
- Batch processing — v2 backlog.

</deferred>

---

*Phase: 1-Foundation & Upload*
*Context gathered: 2026-05-18*
