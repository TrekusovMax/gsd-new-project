# Phase 2: Compression & Download - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 2-Compression & Download
**Areas discussed:** Preset selector, Результаты сжатия, Download flow, Ошибки сжатия, Удаление файла

---

## Preset Selector

| Option | Description | Selected |
|--------|-------------|----------|
| Внутри FileInfoCard | Preset selector между именем файла и кнопкой Compress — всё в одной карточке | ✓ |
| Отдельная карточка ниже FileInfoCard | FileInfoCard отдельно, CompressionCard ниже — больше прокрутки | |

**User's choice:** Внутри FileInfoCard

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented (Ant Design) | Три пункта в одной строке, компактно | ✓ |
| Radio.Group | 3 радиокнопки с описанием пресета, больше места | |

**User's choice:** Segmented (Ant Design)

| Option | Description | Selected |
|--------|-------------|----------|
| Balanced | COMP-02 требует Balanced по умолчанию | ✓ |
| Maximum Compression | Максимальное сжатие по умолчанию | |

**User's choice:** Balanced

---

## Результаты сжатия

| Option | Description | Selected |
|--------|-------------|----------|
| FileInfoCard трансформируется | Preset selector и кнопка Compress заменяются статистикой и Download — всё в одной карточке | ✓ |
| Новая ResultsCard ниже | FileInfoCard остаётся, ниже появляется ResultsCard | |

**User's choice:** FileInfoCard трансформируется

| Option | Description | Selected |
|--------|-------------|----------|
| 2 цифры + бейдж | "4.2 MB → 1.8 MB" + badge "↓ 57% (− 2.4 MB)" — компактно | ✓ |
| 4 отдельных ячейки | Original / Compressed / Saved % / Saved MB — по одному на ячейку | |

**User's choice:** 2 цифры + бейдж

---

## Download Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Скачивание → кнопка остаётся | Browser скачивает файл, страница остаётся с Download + "Сжать другой файл" | ✓ |
| Скачивание → сразу reset | Browser скачивает, страница сбрасывается — нельзя скачать повторно | |

**User's choice:** Скачивание → кнопка остаётся

| Option | Description | Selected |
|--------|-------------|----------|
| Ссылка «Сжать другой файл» | RES-04 CTA под кнопкой Download, сброс + cleanup | ✓ |
| Кнопка «Сжать ещё» рядом с Download | Две кнопки в одной строке | |

**User's choice:** Ссылка "Сжать другой файл"

---

## Ошибки сжатия

| Option | Description | Selected |
|--------|-------------|----------|
| В месте FileInfoCard | Inline error state — красный border, заголовок, 2 кнопки | ✓ |
| Toast / notification | Всплывающее уведомление | |

**User's choice:** В месте FileInfoCard

| Option | Description | Selected |
|--------|-------------|----------|
| Повторить + загрузить другой | 2 кнопки: retry + reset | ✓ |
| Только «Загрузить другой» | Проще, но пользователь теряет загруженный файл | |

**User's choice:** Повторить + загрузить другой

---

## Удаление файла из Vercel Blob

| Option | Description | Selected |
|--------|-------------|----------|
| После скачивания через /api/download | /api/download проксирует + вызывает del() для обоих файлов | ✓ |
| Пользователь удаляет через «Сжать другой» | /api/cleanup вызывается только при reset | |

**User's choice:** После скачивания через /api/download

| Option | Description | Selected |
|--------|-------------|----------|
| Удалять оба файла | /api/download удаляет исходный + сжатый — чистый Blob store | ✓ |
| Только сжатый | Исходный остаётся — Phase 1 удаляет его через /api/cleanup при reset | |

**User's choice:** Удалять оба файла

---

## Claude's Discretion

- Анимация трансформации FileInfoCard между состояниями
- Конкретные тексты ошибок сжатия (heading + body для ERR-03)
- `/api/compress` timeout configuration (maxDuration в route config)

## Deferred Ideas

- Повторное сжатие с другим пресетом без повторной загрузки — v2
- Batch compression — v2 backlog
- Email результатов — v2 backlog
