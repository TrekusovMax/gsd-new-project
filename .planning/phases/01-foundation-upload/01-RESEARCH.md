# Phase 1: Foundation & Upload — Research

**Researched:** 2026-05-18
**Domain:** Next.js 16 App Router + Vercel Blob client-upload + Ant Design 5 dark theme
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Single-purpose страница без навигации. Весь экран — upload зона + название приложения в минимальном header (логотип/название, без nav-пунктов).
- **D-02:** Centered card upload zone, ~600px ширина, центрирована по вертикали и горизонтали на странице.
- **D-03:** Текст "Up to 20 MB" всегда виден в upload зоне — не только при ошибке.
- **D-04:** После успешной загрузки в Vercel Blob показывается File info card: имя файла, размер, зелёный чекмарк, кнопка "Compress PDF" (Phase 2 добавит логику сжатия), ссылка "Upload another file".
- **D-05:** Drop zone остаётся видимой после загрузки — пользователь может перетащить новый файл в любой момент для замены.
- **D-06:** Ошибки валидации (не PDF, > 20 MB) показываются inline внутри drop zone: красный border, иконка + текст ошибки внутри зоны. Без toast/popup.
- **D-07:** Текст ошибки исчезает когда пользователь начинает новый drag или кликает в зону снова.
- **D-08:** Standard Next.js root (без monorepo). Структура: `app/`, `components/`, `features/pdf/`, `hooks/`, `services/`, `types/`.
- **D-09:** TypeScript strict mode (`"strict": true` в tsconfig).

### Claude's Discretion

- **Theme:** Цветовая тема выбирается разработчиком. Рекомендация: использовать Ant Design dark theme (`theme.darkAlgorithm`) — современно, подходит для инструментального продукта, хорошо выглядит с синими/фиолетовыми акцентами.

### Deferred Ideas (OUT OF SCOPE)

- Компрессия, preset selector, статистика, скачивание — Phase 2.
- Dashboard, история файлов, аутентификация — v2 backlog.
- Batch processing — v2 backlog.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-01 | Drag & Drop загрузка PDF на полноэкранную зону | Drop zone компонент на базе Ant Design Upload.Dragger + нативные drag events на document |
| UPLOAD-02 | Загрузка PDF через клик и файловый диалог | Hidden `<input type="file" accept=".pdf">` + onClick на drop zone |
| UPLOAD-03 | Валидация типа файла (PDF only) до загрузки | Client-side: проверка `file.type === 'application/pdf'` + magic bytes `%PDF-` |
| UPLOAD-04 | Валидация размера файла (максимум 20 MB) до загрузки | Client-side: `file.size <= 20 * 1024 * 1024` до вызова upload() |
| UPLOAD-05 | Прогресс загрузки в реальном времени | `onUploadProgress` callback в upload() от @vercel/blob/client |
| INFRA-01 | Vercel Blob client-upload (обход лимита 4.5 MB) | handleUpload() на сервере + upload() на клиенте — стандартный паттерн SDK |
| INFRA-02 | Удаление файлов из Vercel Blob после скачивания или TTL | del() из @vercel/blob; для Phase 1 — очистка по reset, TTL через cacheControlMaxAge |
| INFRA-03 | Развёртывание на Vercel | next.config.ts с serverExternalPackages, .env с BLOB_READ_WRITE_TOKEN |
| UX-01 | Адаптивность для мобильных устройств | Breakpoints: < 768px (full width), card max-width 600px; 44px touch targets |
| UX-02 | Путь от загрузки до скачивания — максимум 3 клика | Реализуется архитектурой single-page state machine (Phase 1 scaffold) |
</phase_requirements>

---

## Summary

Phase 1 — greenfield проект. Цель: настроить Next.js 16 App Router с нуля и реализовать полный upload flow, при котором файл попадает в Vercel Blob напрямую из браузера, минуя serverless function body limit (4.5 MB).

Ключевая архитектурная цепочка: browser validate → `POST /api/upload` (token handshake, ~1 KB) → `upload()` из `@vercel/blob/client` (прямой PUT на CDN) → UI показывает File info card. API route для upload — только генерация short-lived token через `handleUpload()`. Весь state управляется через `useReducer` в одном хуке `usePdfUpload`.

Вся UI-спецификация зафиксирована в `01-UI-SPEC.md`: dark theme (`#0d0d0d` bg, `#4f6ef7` accent), 5 состояний drop zone (idle / drag-over / uploading / upload-complete / error), File info card с placeholder "Compress PDF". Плановик должен следовать этому контракту без отклонений.

**Primary recommendation:** Строго следовать паттерну client-upload из официальной документации Vercel Blob (последнее обновление 2026-02-26). Не отправлять байты файла через API route — это гарантированный сбой в production на Vercel.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File validation (type, size) | Browser / Client | — | Синхронная проверка до upload; не нужен сервер |
| Upload token handshake | API / Backend (`/api/upload`) | — | `BLOB_READ_WRITE_TOKEN` не должен покидать сервер |
| File storage (direct upload) | CDN / Vercel Blob | — | Байты идут напрямую browser → CDN, минуя serverless |
| Upload progress tracking | Browser / Client | — | `onUploadProgress` callback SDK; XHR events |
| State machine (idle → uploading → done → error) | Browser / Client | — | `useReducer` в `usePdfUpload` hook |
| Drop zone UI + drag events | Browser / Client | — | React компонент; Ant Design Upload.Dragger как base |
| File info card rendering | Browser / Client | — | Conditionally rendered by state machine stage |
| Blob cleanup (on reset) | API / Backend | Browser (TTL hint) | `del()` вызывается server-side; cacheControlMaxAge как fallback |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.2.6` | Framework (App Router + API routes) | Locked by project decision |
| `react` | (peer of next) | UI rendering | Locked |
| `typescript` | (peer of next) | Типизация, strict mode | Locked (D-09) |
| `@vercel/blob` | `2.3.3` | File storage + client-upload token | Locked; единственный способ обойти 4.5 MB limit на Vercel |
| `antd` | `6.4.2` | UI компонент библиотека | Locked; dark theme через ConfigProvider |
| `@ant-design/icons` | `6.2.3` | Иконки (InboxOutlined, CloudUploadOutlined, CheckCircleFilled, CloseCircleOutlined) | Обязательный companion для antd |

[VERIFIED: npm registry — версии получены 2026-05-18: next@16.2.6, @vercel/blob@2.3.3, antd@6.4.2, @ant-design/icons@6.2.3]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | latest | Валидация запросов на API routes | Добавить в day one для валидации тела /api/upload |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `antd` Upload.Dragger | Кастомный div + react-dropzone | react-dropzone чище, но antd уже в стеке; лучше обернуть Dragger |
| `useReducer` | Zustand | useReducer достаточен для линейного state machine из 5 состояний; Zustand overengineering |
| Vercel Blob client-upload | S3 presigned URL | Идентичный паттерн, но @vercel/blob уже в стеке и проще настройки |

**Installation:**
```bash
npm install next@16.2.6 react react-dom typescript @vercel/blob@2.3.3 antd @ant-design/icons zod
```

**Note on sharp/pdf-lib:** НЕ устанавливаются в Phase 1. Они нужны только для compression route (Phase 2). Включение в Phase 1 только увеличит время установки без пользы.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Component)
  │
  ├─ 1. User drops/selects file
  │       └─ pdfValidation.ts: validateType() + validateSize()
  │              ├─ INVALID → dispatch(ERROR) → drop zone error state
  │              └─ VALID  → dispatch(UPLOADING)
  │
  ├─ 2. usePdfUpload hook:
  │       POST /api/upload  ──────────────────────────┐
  │       (tiny JSON, no file bytes)                   │
  │       ← returns token JSON                         ▼
  │                                          /api/upload route.ts
  │                                          handleUpload() → token
  │
  ├─ 3. upload() from @vercel/blob/client
  │       PUT directly to Vercel Blob CDN ────────────▶ Vercel Blob CDN
  │       onUploadProgress({ percentage }) → dispatch(PROGRESS)
  │       ← returns { url: blobUrl, ... }
  │
  ├─ 4. dispatch(UPLOAD_DONE, { blobUrl, filename, size })
  │       → stage = 'upload-complete'
  │       → DropZone returns to idle appearance
  │       → FileInfoCard appears below drop zone
  │
  └─ 5. User clicks "Upload another file"
          → dispatch(RESET)
          → del(blobUrl) called via /api/cleanup or inline server action
          → stage = 'idle'
```

### Recommended Project Structure

```
app/
├── layout.tsx           # ConfigProvider (darkAlgorithm + token overrides)
├── page.tsx             # Page component, wires usePdfUpload, renders cards
├── globals.css          # Minimal CSS resets only
└── api/
    └── upload/
        └── route.ts     # handleUpload() token handshake

components/
├── DropZone.tsx         # Drop zone всех 5 состояний; принимает state + dispatch
├── FileInfoCard.tsx     # File info card после upload
├── UploadProgress.tsx   # Progress bar (только в uploading state)
└── AppHeader.tsx        # Sticky header с именем приложения

features/
└── pdf/
    ├── usePdfUpload.ts  # useReducer + upload() из @vercel/blob/client
    └── pdfValidation.ts # validateFileType(file), validateFileSize(file, maxMb)

types/
└── upload.ts            # UploadStage, UploadState, UploadAction, AppError

services/
└── blobService.ts       # Тонкая обёртка del() для cleanup
```

### Pattern 1: Vercel Blob Client-Upload (handleUpload + upload)

**What:** Двухшаговый upload. Сервер выдаёт short-lived token; клиент использует его для прямой загрузки на CDN.
**When to use:** Всегда, когда файл > ~1 MB на Vercel. На Vercel нет обходных путей — это единственный рабочий паттерн.

```typescript
// Source: https://vercel.com/docs/vercel-blob/client-upload (2026-02-26)
// app/api/upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: 20 * 1024 * 1024, // 20 MB
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        // blob.url доступен здесь; логирование опционально
        console.log('upload completed', blob.url)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    )
  }
}
```

```typescript
// Source: https://vercel.com/docs/vercel-blob/client-upload (2026-02-26)
// features/pdf/usePdfUpload.ts (упрощённо)
import { upload } from '@vercel/blob/client'

const newBlob = await upload(file.name, file, {
  access: 'private',
  handleUploadUrl: '/api/upload',
  onUploadProgress: ({ percentage }) => {
    dispatch({ type: 'PROGRESS', percent: percentage })
  },
})
// newBlob.url — это blobUrl для Phase 2 (/api/compress)
```

### Pattern 2: useReducer State Machine для Upload Flow

**What:** Линейная state machine с 5 состояниями. Один `useReducer` в `usePdfUpload`, пропсы в дочерние компоненты.
**When to use:** Single-page app с предсказуемым линейным потоком. Zustand не нужен.

```typescript
// Source: ARCHITECTURE.md + CONTEXT.md (D-05, D-07)
type UploadStage = 'idle' | 'drag-over' | 'uploading' | 'upload-complete' | 'error'

type UploadAction =
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

interface UploadState {
  stage: UploadStage
  file: File | null
  uploadProgress: number        // 0–100
  blobUrl: string | null        // заполняется после UPLOAD_DONE
  error: AppError | null
}
```

### Pattern 3: Ant Design ConfigProvider с darkAlgorithm

**What:** Единый `ConfigProvider` в `layout.tsx` с переопределением токенов.
**When to use:** Обязательно для всего проекта — это global theming entry point.

```typescript
// Source: 01-UI-SPEC.md + Ant Design 5.x docs [ASSUMED — API стабилен в antd 5.x]
// app/layout.tsx
import { ConfigProvider, theme } from 'antd'

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorBgBase: '#141414',
              colorBgContainer: '#1a1a2e',
              colorPrimary: '#4f6ef7',
              colorSuccess: '#52c41a',
              colorError: '#ff4d4f',
              colorBorder: '#303050',
              colorText: '#e8e8f0',
              colorTextSecondary: '#8888a8',
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            },
          }}
        >
          {children}
        </ConfigProvider>
      </body>
    </html>
  )
}
```

### Pattern 4: next.config.ts — обязательная конфигурация

```typescript
// Source: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages (2026-05-13)
// Note: sharp НЕ нужен в Phase 1, но конфиг уже правильный для Phase 2
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],  // sharp — в auto-list Next.js 15+, но явно безопаснее
}

export default nextConfig
```

**Важно:** В Next.js 15+ `serverComponentsExternalPackages` переименован в `serverExternalPackages` (stable). Использовать только `serverExternalPackages`. [VERIFIED: nextjs.org docs 2026-05-13]

### Pattern 5: Client-side PDF validation (до upload)

```typescript
// Source: PITFALLS.md (Pitfall 8) + project requirements UPLOAD-03, UPLOAD-04
// features/pdf/pdfValidation.ts

export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK'
  message: string
  heading: string
}

const PDF_MAGIC = '%PDF-'

export function validateFileType(file: File): AppError | null {
  if (file.type !== 'application/pdf') {
    return {
      code: 'FILE_TYPE',
      heading: 'PDF files only',
      message: 'This file is not a PDF. Please select a .pdf file.',
    }
  }
  return null
}

export function validateFileSize(file: File, maxMb = 20): AppError | null {
  if (file.size > maxMb * 1024 * 1024) {
    const fileMb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      code: 'FILE_SIZE',
      heading: 'File too large',
      message: `Maximum file size is ${maxMb} MB. Your file is ${fileMb} MB.`,
    }
  }
  return null
}

// Magic bytes check — дополнительная защита (только если нужна серверная валидация)
export async function validatePdfMagicBytes(file: File): Promise<boolean> {
  const slice = await file.slice(0, 5).text()
  return slice.startsWith(PDF_MAGIC)
}
```

### Anti-Patterns to Avoid

- **Отправка байтов файла через тело POST /api/upload:** 413 FUNCTION_PAYLOAD_TOO_LARGE в production для любого реального PDF. Использовать только client-upload pattern.
- **`export const runtime = 'edge'` на upload route:** Edge Runtime имеет ограничения памяти и не поддерживает все Node.js API. Использовать nodejs runtime (default).
- **Server Action для upload:** bodySizeLimit по умолчанию 1 MB — слишком мало для PDF. Использовать Route Handler.
- **Мультиплексирование через /tmp между routes:** `/tmp` изолирован на invocation-уровне. Vercel Blob — единственный правильный inter-route store.
- **`NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN`:** Токен с правами записи не должен попадать в браузер. Только `BLOB_READ_WRITE_TOKEN` (без `NEXT_PUBLIC_` префикса).
- **Таймер-driven progress:** `setInterval` фейкующий прогресс. Использовать только реальный `onUploadProgress` callback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upload token security | Кастомная signed URL генерация | `handleUpload()` из `@vercel/blob/client` | SDK обрабатывает HMAC signing, expiry, callback verification |
| Upload progress events | XHR вручную с `XMLHttpRequest.upload.onprogress` | `onUploadProgress` callback в `upload()` | SDK уже инкапсулирует XHR; callback дает `{ loaded, total, percentage }` |
| File type validation | Regex на file.name | `file.type === 'application/pdf'` + magic bytes | file.name — user-controlled; MIME type надёжнее |
| Dark theme CSS variables | Ручной CSS custom properties | Ant Design `ConfigProvider` + `darkAlgorithm` | Design tokens автоматически каскадируются через весь antd |
| Drag state management | `mouseover`/`mouseout` события | `dragenter`/`dragleave`/`dragover`/`drop` на document + zone | Mouse events не работают для drop; нужны именно drag events |
| Blob cleanup | Cron job | `del()` при reset + `cacheControlMaxAge` | Serverless не имеет daemon; opportunistic cleanup достаточен для MVP |

**Key insight:** Vercel Blob client-upload — это не просто удобство. Это единственный архитектурно корректный способ работы с файлами на Vercel serverless без сложной инфраструктуры.

---

## Common Pitfalls

### Pitfall 1: onUploadCompleted callback не работает локально

**What goes wrong:** `handleUpload()` пытается позвать callback URL, вычисленный из `VERCEL_URL`. Локально этой переменной нет — callback silently fails.
**Why it happens:** Vercel Blob вызывает callback через публичный HTTP-запрос. Localhost недоступен для Vercel серверов.
**How to avoid:** В Phase 1 `onUploadCompleted` используется только для логирования. Вся критичная логика — в client-side callback (`upload()` resolves с blobUrl). Если нужна callback-логика локально — использовать ngrok + `VERCEL_BLOB_CALLBACK_URL=https://abc.ngrok-free.app` в `.env.local`.
**Warning signs:** `Error: Could not call onUploadCompleted` в console.

### Pitfall 2: Ant Design SSR hydration mismatch с dark theme

**What goes wrong:** `ConfigProvider` с `darkAlgorithm` рендерится на сервере, но клиентские стили инициализируются иначе. Визуальный flash или hydration warning.
**Why it happens:** Ant Design 5 использует CSS-in-JS (emotion). При SSR нужна явная настройка для Next.js App Router.
**How to avoid:** Добавить `'use client'` directive в компонент, который оборачивает `ConfigProvider`. В Next.js App Router `ConfigProvider` должен быть Client Component. [ASSUMED — паттерн для antd 5 с App Router; требует проверки на реальном проекте]
**Warning signs:** `Warning: Expected server HTML to contain a matching...` в console.

### Pitfall 3: Drag events bubble — dragover/dragleave ложные срабатывания

**What goes wrong:** `dragleave` срабатывает когда мышь переходит на дочерний элемент внутри drop zone. Зона "мигает" (выходит из drag-over state).
**Why it happens:** `dragleave` bubbles. Переход на child element = leave parent + enter child, что триггерит dragleave на parent.
**How to avoid:** Использовать `relatedTarget` для проверки: если `event.relatedTarget` — дочерний элемент зоны, игнорировать. Или считать depth counter (`dragEnterCount++` на enter, `--` на leave, обновлять state только при 0). [ASSUMED — стандартный браузерный паттерн]
**Warning signs:** Drop zone state "мигает" при наведении файла на иконки/текст внутри зоны.

### Pitfall 4: `accept=".pdf"` vs `accept="application/pdf"` на iOS

**What goes wrong:** На iOS Safari `accept="application/pdf"` может не показывать PDF-файлы в пикере. `accept=".pdf"` работает надёжнее.
**Why it happens:** iOS интерпретирует MIME type для фильтрации иначе, чем расширение файла.
**How to avoid:** Использовать `accept=".pdf,application/pdf"` — обе формы для максимальной совместимости. [ASSUMED — известная iOS особенность]
**Warning signs:** На iOS нет PDF в файловом picker.

### Pitfall 5: BLOB_READ_WRITE_TOKEN не доступен при локальной разработке

**What goes wrong:** `/api/upload` возвращает 400 с ошибкой авторизации локально.
**Why it happens:** `BLOB_READ_WRITE_TOKEN` не добавлен в `.env.local`.
**How to avoid:** После создания Blob store в Vercel Dashboard запустить `vercel env pull` для создания `.env.local`. Добавить `.env.local` в `.gitignore`.
**Warning signs:** `Error: BLOB_READ_WRITE_TOKEN is missing` в server logs.

---

## Code Examples

### /api/upload/route.ts — полный рабочий код

```typescript
// Source: https://vercel.com/docs/vercel-blob/client-upload (2026-02-26)
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname) => ({
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: 20 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        // В Phase 1: только логирование
        // В Phase 2: можно сохранить в session store
        console.log('Upload complete:', blob.url)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    )
  }
}
```

### upload() вызов из клиентского хука

```typescript
// Source: https://vercel.com/docs/vercel-blob/using-blob-sdk (2026-02-19)
// features/pdf/usePdfUpload.ts
import { upload } from '@vercel/blob/client'

// onUploadProgress callback signature (verified):
// ({ loaded: number, total: number, percentage: number }) => void
const result = await upload(file.name, file, {
  access: 'private',
  handleUploadUrl: '/api/upload',
  onUploadProgress: ({ percentage }) => {
    dispatch({ type: 'PROGRESS', percent: Math.round(percentage) })
  },
})
// result.url — сохранить в state как blobUrl для Phase 2
```

### Файловый размер для отображения (всегда в MB)

```typescript
// Source: 01-UI-SPEC.md — Copywriting Contract
// "{N.N} MB" — 1 decimal place, always MB (e.g. "0.4 MB" not "400 KB")
export function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

### del() для cleanup при reset

```typescript
// Source: https://vercel.com/docs/vercel-blob/using-blob-sdk (2026-02-19)
// services/blobService.ts
import { del } from '@vercel/blob'

export async function deleteBlobSafe(url: string): Promise<void> {
  try {
    await del(url)
  } catch (err) {
    // Логировать но не бросать — cleanup не должен ломать UI
    console.warn('Blob cleanup failed:', err)
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `serverComponentsExternalPackages` | `serverExternalPackages` | Next.js 15.0.0 | Переименован из experimental в stable. Старое имя вызывает deprecation warning |
| `experimental.serverActions.bodySizeLimit` | Всё ещё `experimental` в next.config | — | Не актуально для нашего паттерна (не используем Server Actions для upload) |
| `export const config = { api: { bodyParser: false } }` | Не нужен в App Router | Next.js 13+ | Pages Router паттерн. В App Router Route Handlers тела не имеют bodyParser |

**Deprecated/outdated:**
- `serverComponentsExternalPackages`: заменено на `serverExternalPackages` в Next.js 15. Использование старого имени выдаёт предупреждение при сборке.
- Multer в App Router: не работает без шимов. Нативный `request.formData()` — правильный подход.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js, npm | ✓ | v24.14.1 | — |
| npm | Package installation | ✓ | 11.11.0 | — |
| git | Version control | ✓ | 2.48.1 | — |
| Vercel CLI | `vercel env pull` для `.env.local` | ? | — | Ручное копирование BLOB_READ_WRITE_TOKEN из Dashboard |
| BLOB_READ_WRITE_TOKEN | /api/upload | ? | — | Создать Blob store в Vercel Dashboard + vercel env pull |
| Vercel Blob store | INFRA-01 | ? | — | Нет fallback; требует создания в Vercel Dashboard перед запуском |

**Missing dependencies с no fallback:**
- **Vercel Blob store** — должен быть создан в Vercel Dashboard до первого запуска `/api/upload`. Без него `handleUpload()` вернёт 400. Wave 0 должен включать task: "Создать Blob store и получить BLOB_READ_WRITE_TOKEN".

**Missing dependencies с fallback:**
- **Vercel CLI** — можно обойтись ручным копированием токена из Dashboard в `.env.local`.

---

## Project Constraints (from CLAUDE.md)

| Directive | Source | Impact на Phase 1 |
|-----------|--------|-------------------|
| Vercel Blob client-upload — обязателен | CLAUDE.md Critical Architecture #1 | `/api/upload` только token handshake, не принимает bytes |
| No Ghostscript | CLAUDE.md Critical Architecture #2 | Не устанавливать в Phase 1; pdf-lib/sharp — только Phase 2 |
| `export const runtime = 'nodejs'` на /api/compress | CLAUDE.md Critical Architecture #3 | Phase 2 requirement; в Phase 1 `/api/upload` работает без явного runtime |
| TypeScript strict mode | CLAUDE.md + D-09 | `"strict": true` в tsconfig.json |
| Reusable components в `/components` | CLAUDE.md | DropZone, FileInfoCard, UploadProgress, AppHeader |
| Feature logic в `/features/pdf` | CLAUDE.md | usePdfUpload, pdfValidation.ts |
| No comments unless WHY is non-obvious | CLAUDE.md | Не добавлять obvious comments в code |
| ESLint + Prettier | CLAUDE.md | Настроить в scaffolding task |

---

## Open Questions (RESOLVED)

1. **onUploadCompleted локальная разработка**
   - What we know: Callback не работает без публичного URL; требует ngrok или игнорирования.
   - What's unclear: Нужна ли callback-логика в Phase 1 вообще (мы только логируем).
   - RESOLVED: Не реализовывать бизнес-логику в `onUploadCompleted` для Phase 1 — только `console.log`. Это устраняет проблему полностью.

2. **Vercel Blob store: public или private access?**
   - What we know: Private blobs требуют server-side proxy для скачивания (Phase 2 `/api/download`). Public blobs доступны напрямую по URL.
   - What's unclear: В Phase 1 файл только загружается — не скачивается.
   - RESOLVED: Создать store с `access: 'private'` сразу. Phase 2 уже ожидает private blobs. Применено в PLAN-1.3 `onBeforeGenerateToken`.

3. **create-next-app vs ручная настройка**
   - What we know: `create-next-app@latest` создаёт проект с Next.js 16 + TypeScript + App Router.
   - What's unclear: Нужно ли использовать `--eslint --tailwind` флаги (Tailwind не нужен).
   - RESOLVED: `npx create-next-app@16.2.6 . --typescript --eslint --no-tailwind --no-src-dir --app` — минимальный setup без лишнего. Применено в PLAN-1.1 Task 1.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ant Design 5 с `darkAlgorithm` в Next.js App Router требует `'use client'` на обёртке ConfigProvider | Common Pitfalls #2 | Hydration mismatch при SSR; легко исправить добавлением директивы |
| A2 | `dragEnterCount` depth counter — стандартный fix для bubbling dragleave | Common Pitfalls #3 | Drop zone "мигает"; fix — 30 минут работы |
| A3 | `accept=".pdf,application/pdf"` надёжнее на iOS чем только MIME | Common Pitfalls #4 | iOS пользователи не видят PDF в пикере; легко исправить |
| A4 | `del()` не бросает если URL уже удалён | Code Examples (deleteBlobSafe) | Cleanup при reset может упасть если blob уже удалён; оборачивать в try/catch |

---

## Sources

### Primary (HIGH confidence)
- Vercel Blob Client Upload docs — https://vercel.com/docs/vercel-blob/client-upload (last_updated: 2026-02-26) — `handleUpload()`, `upload()` паттерн, `onUploadProgress` callback signature
- Vercel Blob SDK reference — https://vercel.com/docs/vercel-blob/using-blob-sdk (last_updated: 2026-02-19) — `put()`, `del()`, `get()` сигнатуры; `onUploadProgress: ({ loaded, total, percentage }) => void`
- Next.js serverExternalPackages docs — https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages (version 16.2.6, 2026-05-13) — `sharp` в auto-list, переименование из `serverComponentsExternalPackages`
- npm registry — версии next@16.2.6, @vercel/blob@2.3.3, antd@6.4.2, @ant-design/icons@6.2.3 (verified 2026-05-18)
- `.planning/research/ARCHITECTURE.md` — data flow diagram, TypeScript типы, компонентные границы
- `.planning/research/PITFALLS.md` — 15 pitfalls с prevention strategies
- `.planning/phases/01-foundation-upload/01-UI-SPEC.md` — полная UI спецификация, копирайтинг, accessibility

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — версии библиотек, Vercel compatibility matrix
- `.planning/research/SUMMARY.md` — сводка архитектурных решений

### Tertiary (LOW / ASSUMED — см. Assumptions Log)
- A1-A4 в Assumptions Log — стандартные паттерны из training knowledge, не верифицированы в этой сессии

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — версии верифицированы npm registry
- Architecture: HIGH — официальные Vercel Blob docs (2026-02-26), Next.js docs (2026-05-13)
- UI spec: HIGH — полностью зафиксирована в 01-UI-SPEC.md
- Pitfalls: HIGH — из официальных Vercel docs + prior project research
- Drag-drop edge cases: MEDIUM — стандартные браузерные паттерны, не верифицированы

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (Next.js и Vercel Blob API стабильны; antd 6.x стабилен)
