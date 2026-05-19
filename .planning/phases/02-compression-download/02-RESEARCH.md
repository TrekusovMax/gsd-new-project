# Phase 2: Compression & Download — Research

**Researched:** 2026-05-19
**Domain:** pdf-lib + sharp compression pipeline, Vercel Blob private download proxy, Next.js streaming route handler
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Preset selector размещается внутри FileInfoCard — между именем файла и кнопкой Compress.
- **D-02:** Компонент — Ant Design Segmented с тремя пунктами: Maximum Compression / Balanced / High Quality.
- **D-03:** Balanced выбран по умолчанию.
- **D-04:** Во время сжатия FileInfoCard показывает spinner/loading state — кнопка Compress переходит в loading, preset selector блокируется. Отдельная progress-bar не нужна.
- **D-05:** После нажатия Compress кнопка отображает "Compressing…" (loading state Ant Design Button).
- **D-06:** После сжатия FileInfoCard трансформируется в результаты — preset selector и кнопка Compress заменяются статистикой и кнопкой Download.
- **D-07:** Статистика: верхняя строка "4.2 MB → 1.8 MB", ниже — badge "↓ 57% (− 2.4 MB)".
- **D-08:** Кнопка Download (primary, large, block) — клик запускает скачивание через /api/download. После скачивания кнопка остаётся.
- **D-09:** Ссылка "Сжать другой файл" — клик сбрасывает состояние в idle, удаляет оба файла через /api/cleanup.
- **D-10:** Скачиваемый файл получает имя `[оригинал]-compressed.pdf`. Content-Disposition: attachment.
- **D-11:** Ошибка сжатия отображается в месте FileInfoCard: красный border, заголовок + текст.
- **D-12:** При ошибке сжатия показываются две кнопки: "Повторить" и "Загрузить другой".
- **D-13:** /api/download вызывает deleteBlobSafe() для обоих файлов после отправки клиенту.
- **D-14:** /api/download принимает `{ blobUrl, compressedBlobUrl, filename }`, стримит сжатый файл.
- **D-15:** "Сжать другой файл" вызывает /api/cleanup с обоими URL (fire-and-forget).

### Claude's Discretion

- Анимация трансформации FileInfoCard: opacity/translateY 200ms.
- Текст ошибок сжатия: Claude выбирает информативные сообщения.
- /api/compress timeout: `export const maxDuration = 60` в route config.

### Deferred Ideas (OUT OF SCOPE)

- Повторное сжатие с другим пресетом без повторной загрузки — v2.
- Batch compression — v2 backlog.
- Email результатов — v2 backlog.

</user_constraints>

---

## Summary

Phase 2 реализует полный цикл: выбор пресета → вызов /api/compress → отображение статистики → скачивание через /api/download → cleanup.

Ключевая техническая цепочка: `/api/compress` загружает PDF из Vercel Blob по URL (server-side `fetch` — без ограничений на размер входящего тела), прогоняет через pdf-lib + sharp pipeline, загружает сжатый PDF обратно в Blob, возвращает `{ compressedBlobUrl, originalSize, compressedSize }`. Затем `/api/download` получает сжатый blob через `get()` из `@vercel/blob` (возвращает `ReadableStream`), передаёт его в `Response` с заголовками `Content-Disposition: attachment` и `Content-Type: application/pdf`, после чего удаляет оба blob асинхронно.

Ограничение pdf-lib: библиотека не умеет перекодировать изображения сама по себе. Её компрессия структурная: объектные потоки (`useObjectStreams: true`) + удаление metadata. Для реальной компрессии image-heavy PDF нужно извлекать изображения через low-level API, сжимать через sharp, и заново встраивать через `embedJpg`. Этот паттерн работает, но не гарантирован для всех типов изображений (CMYK, ICC profiles, masked images).

**Primary recommendation:** Реализовать три пресета с прогрессивно более агрессивной image-компрессией и явной обработкой edge cases (зашифрованные PDF, PDF без изображений). Не пытаться хэндлить CMYK — передавать оригинальные байты изображения без изменений как fallback.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Preset selector UI (Segmented) | Browser / Client (FileInfoCard) | — | UI-only компонент, меняет локальный state |
| Compress trigger + loading state | Browser / Client (usePdfUpload) | — | dispatch(COMPRESS_START), disabled input во время обработки |
| PDF compression pipeline | API / Backend (/api/compress) | — | pdf-lib требует Node.js Buffer API; Edge Runtime не поддерживается |
| Image re-encoding (sharp) | API / Backend (/api/compress) | — | sharp — нативный бинарник, только Node.js runtime |
| Compressed file storage | CDN / Vercel Blob | — | put() после компрессии — возвращает URL для download |
| Statistics display | Browser / Client (FileInfoCard) | — | Рассчитывается из originalSize/compressedSize из ответа API |
| Download proxy | API / Backend (/api/download) | — | Private blob требует server-side аутентификации; браузер не может fetch напрямую |
| Blob cleanup after download | API / Backend (/api/download) | — | del() вызывается server-side, после Response отправлена (fire-and-forget) |
| Reset + cleanup | Browser / Client (usePdfUpload) | API (/api/cleanup) | Client диспатчит RESET, cleanup идёт через API (fire-and-forget) |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact на Phase 2 |
|-----------|-------------------|
| No Ghostscript — использовать pdf-lib + sharp | Всё сжатие через pure-JS + prebuilt binary |
| `export const runtime = 'nodejs'` на /api/compress | Обязателен; pdf-lib использует Node.js Buffer |
| Vercel Blob client-upload pattern | /api/compress принимает blobUrl, не байты файла |
| Separate routes: /api/compress, /api/download, /api/cleanup | Не объединять логику в один route |
| TypeScript strict mode | Все типы явные, null-safe |
| No comments unless WHY non-obvious | |

---

## 1. PDF Compression with pdf-lib + sharp

### Что pdf-lib умеет сжимать

[VERIFIED: pdf-lib.js.org официальная документация + SaveOptions API]

`PDFDocument.save()` принимает `SaveOptions`:

| Опция | Эффект | Используется |
|-------|--------|--------------|
| `useObjectStreams: true` | Упаковывает объекты PDF в сжатые потоки (FlateDecode). Уменьшает text-heavy PDF на 10–30%. | Всегда |
| `updateFieldAppearances: false` | Не регенерирует appearance streams для form fields. Уменьшает overhead для PDF с формами. | Всегда |
| `objectsPerTick` | Batch processing — не влияет на размер, только на производительность. | Не нужен (sync) |

**Важно:** pdf-lib НЕ перекодирует встроенные изображения. Для image compression нужен отдельный шаг с sharp.

### Image Extraction и Re-embedding (pdf-lib low-level API)

[ASSUMED — паттерн с internal API pdf-lib не задокументирован официально, основан на training knowledge + GitHub issues]

pdf-lib предоставляет доступ к raw PDF objects через `pdfDoc.context`. Изображения хранятся как XObject streams с `/Subtype /Image`. Извлечение:

```typescript
// ASSUMED — internal API, не стабильный публичный контракт
import { PDFDocument, PDFRawStream, PDFName, PDFDict } from 'pdf-lib'

async function extractImages(pdfDoc: PDFDocument): Promise<Array<{
  ref: ReturnType<typeof pdfDoc.context.nextRef>,
  stream: PDFRawStream,
  subtype: string,
}>> {
  const images: Array<{ ref: any; stream: PDFRawStream; subtype: string }> = []
  
  pdfDoc.context.enumerateIndirectObjects().forEach(([ref, obj]) => {
    if (obj instanceof PDFRawStream) {
      const dict = obj.dict
      const subtype = dict.get(PDFName.of('Subtype'))
      if (subtype?.toString() === '/Image') {
        images.push({ ref, stream: obj, subtype: subtype.toString() })
      }
    }
  })
  
  return images
}
```

**Риск:** `enumerateIndirectObjects` и прямой доступ к `context` — internal API. Не гарантирован в будущих версиях pdf-lib. Для нашей зафиксированной версии 1.17.1 — работает.

### Три пресета: конкретная реализация

[VERIFIED: sharp API — https://github.com/lovell/sharp docs; ASSUMED: compression ratios — приблизительные, зависят от контента PDF]

```typescript
// services/pdfCompressionService.ts

import { PDFDocument, PDFRawStream, PDFName } from 'pdf-lib'
import sharp from 'sharp'

export type CompressionPreset = 'maximum' | 'balanced' | 'quality'

interface PresetConfig {
  jpegQuality: number        // sharp jpeg quality 0-100
  maxImageWidth: number      // px — масштабировать вниз если шире
  maxImageHeight: number     // px
  convertPngToJpeg: boolean  // конвертировать PNG → JPEG для экономии места
}

const PRESET_CONFIG: Record<CompressionPreset, PresetConfig> = {
  maximum: {
    jpegQuality: 40,
    maxImageWidth: 1024,
    maxImageHeight: 1024,
    convertPngToJpeg: true,
  },
  balanced: {
    jpegQuality: 65,
    maxImageWidth: 1600,
    maxImageHeight: 1600,
    convertPngToJpeg: false,
  },
  quality: {
    jpegQuality: 85,
    maxImageWidth: 2400,
    maxImageHeight: 2400,
    convertPngToJpeg: false,
  },
}
```

### Полная реализация compression pipeline

```typescript
// services/pdfCompressionService.ts (полный файл)

import { PDFDocument, PDFRawStream, PDFName, PDFNumber } from 'pdf-lib'
import sharp from 'sharp'

export type CompressionPreset = 'maximum' | 'balanced' | 'quality'

interface PresetConfig {
  jpegQuality: number
  maxImageWidth: number
  maxImageHeight: number
  convertPngToJpeg: boolean
}

const PRESET_CONFIG: Record<CompressionPreset, PresetConfig> = {
  maximum:  { jpegQuality: 40,  maxImageWidth: 1024, maxImageHeight: 1024, convertPngToJpeg: true  },
  balanced: { jpegQuality: 65,  maxImageWidth: 1600, maxImageHeight: 1600, convertPngToJpeg: false },
  quality:  { jpegQuality: 85,  maxImageWidth: 2400, maxImageHeight: 2400, convertPngToJpeg: false },
}

export async function compressPdf(
  inputBuffer: Buffer,
  preset: CompressionPreset,
): Promise<Buffer> {
  // [ASSUMED: PDFDocument.load() throws on encrypted PDFs — catch separately]
  const pdfDoc = await PDFDocument.load(inputBuffer, {
    ignoreEncryption: false,  // will throw PDFDocumentError for encrypted
  })

  const config = PRESET_CONFIG[preset]
  
  // Pass 1: Re-encode embedded images via sharp
  const context = pdfDoc.context
  const indirectObjects = context.enumerateIndirectObjects()
  
  for (const [ref, obj] of indirectObjects) {
    if (!(obj instanceof PDFRawStream)) continue
    
    const dict = obj.dict
    const subtype = dict.get(PDFName.of('Subtype'))
    if (!subtype || subtype.toString() !== '/Image') continue
    
    // Skip masks and inline images (Filter=/CCITTFaxDecode is typically fax — skip)
    const filter = dict.get(PDFName.of('Filter'))
    const filterStr = filter?.toString() ?? ''
    if (filterStr.includes('CCITTFaxDecode') || filterStr.includes('JBIG2Decode')) continue
    
    const imageBytes = obj.contents  // raw compressed bytes
    
    // Detect image type by Filter
    const isJpeg = filterStr.includes('DCTDecode')
    const isPng = !isJpeg && filterStr.includes('FlateDecode')
    
    if (!isJpeg && !isPng) continue  // skip unknown formats
    
    try {
      // Get current dimensions
      const widthObj = dict.get(PDFName.of('Width'))
      const heightObj = dict.get(PDFName.of('Height'))
      const origWidth = widthObj instanceof PDFNumber ? widthObj.asNumber() : 0
      const origHeight = heightObj instanceof PDFNumber ? heightObj.asNumber() : 0
      
      // Skip if already smaller than target
      if (
        origWidth <= config.maxImageWidth &&
        origHeight <= config.maxImageHeight &&
        isJpeg &&
        !config.convertPngToJpeg
      ) {
        // Still re-encode JPEG at target quality to strip extra metadata
        // But only if downscaling would help meaningfully
        if (origWidth < config.maxImageWidth * 0.9 && origHeight < config.maxImageHeight * 0.9) continue
      }
      
      let sharpPipeline = sharp(Buffer.from(imageBytes))
      
      // Downscale if needed (maintains aspect ratio)
      if (origWidth > config.maxImageWidth || origHeight > config.maxImageHeight) {
        sharpPipeline = sharpPipeline.resize(config.maxImageWidth, config.maxImageHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
      }
      
      let newImageBytes: Buffer
      let newFilter: string
      
      if (isJpeg || config.convertPngToJpeg) {
        newImageBytes = await sharpPipeline
          .jpeg({ quality: config.jpegQuality, progressive: false })
          .toBuffer()
        newFilter = '/DCTDecode'
      } else {
        // PNG: use palette mode for maximum compression
        newImageBytes = await sharpPipeline
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toBuffer()
        newFilter = '/FlateDecode'
      }
      
      // Only replace if actually smaller
      if (newImageBytes.length >= imageBytes.length) continue
      
      // Get new dimensions from sharp metadata
      const metadata = await sharp(newImageBytes).metadata()
      const newWidth = metadata.width ?? origWidth
      const newHeight = metadata.height ?? origHeight
      
      // Rebuild image dict with new data
      const newDict = context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: newWidth,
        Height: newHeight,
        ColorSpace: isJpeg || config.convertPngToJpeg ? 'DeviceRGB' : dict.get(PDFName.of('ColorSpace')),
        BitsPerComponent: 8,
        Filter: PDFName.of(newFilter.slice(1)),
        Length: newImageBytes.length,
      })
      
      const newStream = context.stream(newImageBytes, newDict.dict ?? {})
      context.assign(ref, newStream)
      
    } catch {
      // Silently skip images that fail — preserve original
      continue
    }
  }
  
  // Pass 2: Structural compression via pdf-lib save options
  const compressedBytes = await pdfDoc.save({
    useObjectStreams: true,
    updateFieldAppearances: false,
  })
  
  return Buffer.from(compressedBytes)
}
```

**Примечание по реализации:** Блок создания `newStream` с прямым присваиванием через `context.assign(ref, newStream)` — это ASSUMED internal API. Рекомендую в Wave 1 проверить работу на тестовом PDF и при необходимости упростить до только структурной компрессии (Pass 2), если low-level image replacement нестабилен.

### Реалистичные ожидания по compression ratio

[ASSUMED — приблизительно, зависит от типа контента]

| Тип PDF | Maximum | Balanced | Quality |
|---------|---------|---------|---------|
| Scanned/image-only | 60–80% уменьшение | 40–60% | 15–30% |
| Text + charts | 20–35% | 10–20% | 5–10% |
| Already-compressed images | 5–15% | 3–8% | 1–5% |
| Text-only PDF | 5–15% | 5–15% | 5–15% |

Для text-only PDF все три пресета дадут одинаковый результат (только структурная компрессия).

### Альтернатива: упрощённый fallback без image extraction

Если low-level image API окажется нестабильным, реализовать только структурную компрессию:

```typescript
export async function compressPdfSimple(
  inputBuffer: Buffer,
  preset: CompressionPreset,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(inputBuffer)
  const bytes = await pdfDoc.save({ useObjectStreams: true, updateFieldAppearances: false })
  return Buffer.from(bytes)
}
```

Это всегда работает, но даёт 5–30% вместо 40–80% для image-heavy PDF. Трактовать как acceptable MVP fallback если image extraction нестабилен.

---

## 2. /api/compress Route Implementation

[VERIFIED: ARCHITECTURE.md + Vercel Blob SDK docs (2026-02-19) + Next.js maxDuration docs (2026-02-27)]

```typescript
// app/api/compress/route.ts

import { NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import { z } from 'zod'
import { compressPdf, type CompressionPreset } from '@/services/pdfCompressionService'
import crypto from 'crypto'

export const runtime = 'nodejs'       // REQUIRED — pdf-lib needs Node.js Buffer
export const maxDuration = 60         // seconds — enough for 20MB PDF on Hobby plan

const schema = z.object({
  blobUrl: z.string().url(),
  preset: z.enum(['maximum', 'balanced', 'quality']),
  filename: z.string().min(1).max(255),
})

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
  }

  const { blobUrl, preset, filename } = result.data

  // 1. Download PDF from Vercel Blob (server-side fetch — no body size limit)
  let pdfBuffer: Buffer
  try {
    const response = await fetch(blobUrl)
    if (!response.ok) {
      return NextResponse.json({ error: 'Could not fetch PDF from storage' }, { status: 502 })
    }
    pdfBuffer = Buffer.from(await response.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 502 })
  }

  const originalSize = pdfBuffer.length

  // 2. Compress
  let compressedBuffer: Buffer
  try {
    compressedBuffer = await compressPdf(pdfBuffer, preset as CompressionPreset)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Detect encrypted PDF
    if (message.includes('encrypt') || message.includes('password')) {
      return NextResponse.json(
        { error: 'ENCRYPTED_PDF', message: 'This PDF is password-protected and cannot be compressed.' },
        { status: 422 }
      )
    }
    console.error('[/api/compress] compression failed:', message)
    return NextResponse.json(
      { error: 'COMPRESSION_FAILED', message: 'Compression failed. The file may be corrupted.' },
      { status: 500 }
    )
  }

  const compressedSize = compressedBuffer.length

  // 3. Upload compressed PDF to Vercel Blob
  const baseName = filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const compressedFilename = `compressed/${crypto.randomUUID()}-${baseName}-compressed.pdf`

  let compressedBlobUrl: string
  try {
    const uploaded = await put(compressedFilename, compressedBuffer, {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    })
    compressedBlobUrl = uploaded.url
  } catch {
    return NextResponse.json({ error: 'Failed to store compressed file' }, { status: 500 })
  }

  // 4. Return result (original blob NOT deleted here — deleted in /api/download after user downloads)
  return NextResponse.json({
    compressedBlobUrl,
    originalSize,
    compressedSize,
  })
}
```

**Почему original blob не удаляется в /api/compress:** Пользователь может нажать "Повторить" при ошибке или захочет сжать повторно (v2). Оригинал удаляется в /api/download (после скачивания) или /api/cleanup (при сбросе).

---

## 3. Vercel Blob Download Proxy

### Как работает private blob download

[VERIFIED: @vercel/blob SDK docs — `get()` функция, Context7 /vercel/storage, последнее обновление 2026-02-19]

`@vercel/blob` экспортирует `get(urlOrPathname, options)`. Возвращает объект с `stream: ReadableStream` — это Web Streams API `ReadableStream`, напрямую пригодный для `new Response(stream)` в Next.js App Router route handler.

```typescript
import { get } from '@vercel/blob'

const result = await get('https://...private.blob.vercel-storage.com/file.pdf', { access: 'private' })
// result.stream — ReadableStream (Web Streams API)
// result.blob.contentType — 'application/pdf'
// result.blob.size — байты
```

### Полная реализация /api/download

[VERIFIED: Next.js streaming docs — `new Response(stream, { headers })` паттерн]

```typescript
// app/api/download/route.ts

import { NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { z } from 'zod'
import { deleteBlobSafe } from '@/services/blobService'

const schema = z.object({
  blobUrl: z.string().url(),
  compressedBlobUrl: z.string().url(),
  filename: z.string().min(1).max(255),
})

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
  }

  const { blobUrl, compressedBlobUrl, filename } = result.data

  // Sanitize filename for Content-Disposition
  const safeName = filename
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const downloadFilename = `${safeName}-compressed.pdf`

  // Fetch compressed blob stream from Vercel Blob
  let blobResult: Awaited<ReturnType<typeof get>>
  try {
    blobResult = await get(compressedBlobUrl, { access: 'private' })
  } catch {
    return NextResponse.json({ error: 'File not found or expired' }, { status: 404 })
  }

  if (!blobResult) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Stream blob to client
  // NOTE: del() is called AFTER response is constructed — the stream has not been
  // consumed yet at this point. Cleanup runs after client receives data.
  const response = new Response(blobResult.stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Content-Length': String(blobResult.blob.size),
      'Cache-Control': 'no-store',
    },
  })

  // Cleanup: delete both blobs after streaming (fire-and-forget)
  // Do NOT await — this runs after response is sent
  void Promise.all([
    deleteBlobSafe(compressedBlobUrl),
    deleteBlobSafe(blobUrl),
  ])

  return response
}
```

### Критически важно: cleanup ordering

[ASSUMED — поведение основано на Node.js stream semantics; официального подтверждения нет]

`void Promise.all([del(...), del(...)])` ПОСЛЕ `new Response(stream)` — правильно. Stream не потребляется в момент создания `Response`. Потребление происходит когда Node.js начинает записывать response байты в сокет. К тому моменту `del()` может уже запуститься, но это safe: `del()` просто удалит URL из Vercel Blob storage — это не прерывает уже открытый stream, потому что stream уже читает данные с CDN напрямую (CDN edge держит connection).

Если `del()` вызвать ДО начала потребления stream — теоретически возможна race condition. Размещение после `new Response(stream)` минимизирует этот риск.

### Почему POST, а не GET

По D-14 `/api/download` принимает body `{ blobUrl, compressedBlobUrl, filename }`. GET запросы не имеют тела. Использовать POST.

**Альтернатива: GET с query params** — технически возможна, но query string содержала бы приватные Blob URLs, которые могут попасть в логи сервера или browser history. POST body безопаснее для приватных URL.

---

## 4. State Machine Extension (usePdfUpload.ts + types/upload.ts)

### Изменения в types/upload.ts

```typescript
// types/upload.ts — добавить к существующему файлу

// 1. Расширить UploadStage
export type UploadStage =
  | 'idle'
  | 'drag-over'
  | 'uploading'
  | 'upload-complete'
  | 'compressing'          // NEW
  | 'compress-complete'    // NEW
  | 'error'

// 2. Расширить AppError codes
export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK' | 'COMPRESSION_FAILED' | 'ENCRYPTED_PDF'  // NEW codes
  message: string
  heading: string
}

// 3. Новые поля в UploadState
export interface UploadState {
  stage: UploadStage
  file: File | null
  uploadProgress: number
  blobUrl: string | null
  error: AppError | null
  // Phase 2 additions:
  preset: 'maximum' | 'balanced' | 'quality'  // NEW — default: 'balanced'
  compressedBlobUrl: string | null             // NEW
  originalSize: number | null                  // NEW — bytes (из /api/compress response)
  compressedSize: number | null                // NEW — bytes
}

// 4. Новые action types в UploadAction
export type UploadAction =
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
  // Phase 2 additions:
  | { type: 'SET_PRESET'; preset: 'maximum' | 'balanced' | 'quality' }    // NEW
  | { type: 'COMPRESS_START' }                                              // NEW
  | { type: 'COMPRESS_DONE'; compressedBlobUrl: string; originalSize: number; compressedSize: number }  // NEW
  | { type: 'COMPRESS_ERROR'; error: AppError }                             // NEW
```

### Изменения в reducer (usePdfUpload.ts)

```typescript
// Добавить в uploadReducer switch:

case 'SET_PRESET':
  return { ...state, preset: action.preset }

case 'COMPRESS_START':
  return { ...state, stage: 'compressing', error: null }

case 'COMPRESS_DONE':
  return {
    ...state,
    stage: 'compress-complete',
    compressedBlobUrl: action.compressedBlobUrl,
    originalSize: action.originalSize,
    compressedSize: action.compressedSize,
    error: null,
  }

case 'COMPRESS_ERROR':
  return { ...state, stage: 'error', error: action.error }

// Обновить RESET для очистки новых полей:
case 'RESET':
  return { ...initialState }  // initialState уже включает новые поля с null

// Обновить initialState:
const initialState: UploadState = {
  stage: 'idle',
  file: null,
  uploadProgress: 0,
  blobUrl: null,
  error: null,
  preset: 'balanced',          // Phase 2: default preset
  compressedBlobUrl: null,     // Phase 2
  originalSize: null,          // Phase 2
  compressedSize: null,        // Phase 2
}
```

### handleCompress — новая функция в usePdfUpload

```typescript
// Добавить в usePdfUpload.ts

const handleCompress = useCallback(async () => {
  if (!state.blobUrl || !state.file) return
  
  dispatch({ type: 'COMPRESS_START' })
  
  try {
    const response = await fetch('/api/compress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: state.blobUrl,
        preset: state.preset,
        filename: state.file.name,
      }),
    })
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const isEncrypted = data.error === 'ENCRYPTED_PDF'
      const compressError: AppError = {
        code: isEncrypted ? 'ENCRYPTED_PDF' : 'COMPRESSION_FAILED',
        heading: isEncrypted ? 'Password-protected PDF' : 'Compression failed',
        message: isEncrypted
          ? 'This PDF is password-protected. Remove the password and try again.'
          : 'Something went wrong. Please try again.',
      }
      dispatch({ type: 'COMPRESS_ERROR', error: compressError })
      return
    }
    
    const data = await response.json()
    dispatch({
      type: 'COMPRESS_DONE',
      compressedBlobUrl: data.compressedBlobUrl,
      originalSize: data.originalSize,
      compressedSize: data.compressedSize,
    })
  } catch {
    const networkError: AppError = {
      code: 'COMPRESSION_FAILED',
      heading: 'Compression failed',
      message: 'Network error. Check your connection and try again.',
    }
    dispatch({ type: 'COMPRESS_ERROR', error: networkError })
  }
}, [state.blobUrl, state.file, state.preset])
```

### handleDownload — функция для инициации скачивания

```typescript
const handleDownload = useCallback(async () => {
  if (!state.compressedBlobUrl || !state.blobUrl || !state.file) return
  
  // Trigger download via /api/download which proxies private blob
  // Using fetch + createObjectURL approach for programmatic download
  // /api/download returns streamed PDF with Content-Disposition: attachment
  const link = document.createElement('a')
  link.href = '/api/download'
  // Use fetch to POST and get blob URL for download
  // Pattern: POST to /api/download, receive streamed response, create blob URL
  
  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: state.blobUrl,
        compressedBlobUrl: state.compressedBlobUrl,
        filename: state.file.name,
      }),
    })
    
    if (!response.ok) return
    
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = state.file.name.replace(/\.pdf$/i, '')
    a.download = `${safeName}-compressed.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Silent fail for download — file is already shown, user can retry
  }
}, [state.compressedBlobUrl, state.blobUrl, state.file])
```

**Важно:** После скачивания `/api/download` удаляет оба blob. Кнопка Download остаётся на странице (D-08), но повторное нажение вернёт 404 от /api/download. Это acceptable behavior для MVP — пользователь видит файл и может нажать "Сжать другой файл".

### handleReset — обновлённая версия для Phase 2

```typescript
const handleReset = useCallback(() => {
  const urlsToClean: string[] = []
  if (state.blobUrl) urlsToClean.push(state.blobUrl)
  if (state.compressedBlobUrl) urlsToClean.push(state.compressedBlobUrl)
  
  if (urlsToClean.length > 0) {
    // /api/cleanup принимает один URL — вызвать дважды или расширить API
    // Вариант A: вызвать дважды (текущий /api/cleanup принимает { url: string })
    urlsToClean.forEach(url => {
      fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }).catch(() => {})
    })
  }
  
  dispatch({ type: 'RESET' })
}, [state.blobUrl, state.compressedBlobUrl])
```

**Альтернатива:** Расширить `/api/cleanup` для приёма массива URL. Но это изменение Phase 1 кода — оставить как есть (два отдельных вызова) для минимального diff.

---

## 5. Vercel Function Configuration

[VERIFIED: Vercel Functions Duration docs — https://vercel.com/docs/functions/configuring-functions/duration, last updated 2026-02-27]

### Лимиты по плану (с Fluid Compute включённым по умолчанию)

| Plan | Default | Maximum |
|------|---------|---------|
| Hobby | 300s | 300s |
| Pro | 300s | 800s |
| Enterprise | 300s | 800s |

**Вывод:** 60 секунд — достаточный и разумный лимит для /api/compress. Не нужно запрашивать больше (billing). Для 20MB PDF ожидаемое время: 5–25s включая fetch + compress + put.

### Обязательные экспорты в /api/compress/route.ts

```typescript
export const runtime = 'nodejs'   // REQUIRED — pdf-lib использует Node.js Buffer API
export const maxDuration = 60     // 60s — достаточно для 20MB PDF
```

### /api/download — runtime и duration

```typescript
// /api/download/route.ts — streaming, не нужен долгий timeout
export const maxDuration = 30  // streaming быстрее чем compression
// runtime: не нужен явный — nodejs по умолчанию
```

---

## 6. Edge Cases & Pitfalls

### Encrypted PDFs

[ASSUMED — на основе pdf-lib GitHub issues и training knowledge]

`PDFDocument.load()` бросает ошибку при попытке загрузить зашифрованный PDF без пароля. Сообщение об ошибке содержит "encrypt" или "password".

**Обработка:** Catch в /api/compress → return 422 с `error: 'ENCRYPTED_PDF'` → клиент показывает специфическое сообщение.

Если PDF зашифрован с пустым паролем (`PDFDocument.load(bytes, { password: '' })`), это тоже вызовет ошибку. Для MVP не пытаться угадывать пароль.

### PDFs без изображений (text-only)

Image extraction loop не найдёт ни одного XObject Image — цикл просто завершится без обработки. Compression всё равно произойдёт через Pass 2 (`useObjectStreams: true`). Пользователь увидит 5–15% уменьшение. Это корректное поведение.

**Нет специальной обработки.** Не нужно предупреждать пользователя о "low compression ratio".

### Изображения с ICC profile / CMYK

[ASSUMED — sharp behaviour с exoticными colorspaces]

Sharp может упасть на CMYK JPEG или изображениях с embedded ICC profiles. `try/catch` в image processing loop гарантирует, что такие изображения будут пропущены без изменений, а остальные будут сжаты.

**Паттерн:** `catch { continue }` в image loop — критически важен.

### Очень маленькие изображения (< 100px)

Downscaling изображений меньше `maxImageWidth` пропускается (`withoutEnlargement: true`). Они всё равно будут перекодированы по quality. Если результат больше оригинала — `if (newImageBytes.length >= imageBytes.length) continue` пропускает замену.

### Большие PDFs (close to 20MB)

Pitfall 4 из PITFALLS.md: pdf-lib загружает весь файл в память (parsed object tree = 3–5x raw size). 20MB PDF = потенциально 60–100MB RAM. На Hobby plan (по данным STACK.md — 1024MB, PITFALLS.md — 2GB) это приемлемо.

**Гарантия:** Лимит 20MB уже установлен в /api/upload `maximumSizeInBytes: 20 * 1024 * 1024`. /api/compress повторной валидации размера не требует.

### Cleanup race condition после download

Если пользователь нажмёт Download несколько раз быстро, второй вызов /api/download получит 404 от `get()` (blob уже удалён первым вызовом). Это acceptable — пользователь уже скачал файл один раз.

Клиент должен дизейблить кнопку Download после первого клика. По D-08 — кнопка остаётся видимой после скачивания. Можно перевести в `loading: true` на время fetch и оставить в normal state после завершения (файл уже на диске у пользователя).

### /tmp не используется

Всё compression pipeline — in-memory (Buffer → Buffer). `/tmp` не нужен. Pitfalls 5 и 12 из PITFALLS.md не применяются.

### Blob URL валидация в /api/compress

Zod schema валидирует `blobUrl: z.string().url()`. Дополнительная проверка: убедиться что URL принадлежит Vercel Blob store (опционально, можно добавить в MVP если нужна защита от SSRF):

```typescript
// Опциональная SSRF защита:
const ALLOWED_BLOB_HOST = /blob\.vercel-storage\.com$/
if (!ALLOWED_BLOB_HOST.test(new URL(blobUrl).hostname)) {
  return NextResponse.json({ error: 'Invalid blob URL' }, { status: 400 })
}
```

---

## 7. Implementation Notes

### FileInfoCard трансформация

FileInfoCard рендерит разный UI в зависимости от `stage`:

| stage | UI |
|-------|----|
| `upload-complete` | Filename + size + Segmented preset + Compress button |
| `compressing` | Filename + size + Segmented (disabled) + Button loading "Compressing…" |
| `compress-complete` | Filename + stats row ("X MB → Y MB") + Tag badge + Download button + "Сжать другой файл" link |
| `error` | Red border + heading + message + "Повторить" + "Загрузить другой" |

Все четыре состояния реализуются в одном компоненте. Анимация перехода: `opacity 0→1` + `translateY 4px→0` за 200ms (аналогично `fileCardEnter` в существующем коде).

### Segmented component

```typescript
// Ant Design Segmented — API
import { Segmented } from 'antd'

<Segmented
  options={[
    { label: 'Maximum', value: 'maximum' },
    { label: 'Balanced', value: 'balanced' },
    { label: 'High Quality', value: 'quality' },
  ]}
  value={state.preset}
  onChange={(value) => dispatch({ type: 'SET_PRESET', preset: value as PresetType })}
  disabled={state.stage === 'compressing'}
  block
/>
```

### Statistics display

```typescript
// Форматирование для D-07
// Верхняя строка: "4.2 MB → 1.8 MB"
// Нижняя: Tag с "↓ 57% (− 2.4 MB)"

const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const percent = Math.round(((originalSize - compressedSize) / originalSize) * 100)
const savedMB = formatMB(originalSize - compressedSize)
```

### /api/cleanup расширение (опционально)

Текущий `/api/cleanup` принимает `{ url: string }`. По D-15, при сбросе нужно удалить два URL. Два варианта:

1. **Вызвать дважды** (текущий API, нет изменений): `urlsToClean.forEach(url => fetch('/api/cleanup', ...))` — два отдельных fire-and-forget запроса.
2. **Расширить API** для `{ urls: string[] }` — одна network request. Требует изменения Phase 1 кода.

Рекомендация: вариант 1 (два вызова). Минимальный diff. Cleanup — fire-and-forget, лишний HTTP request не влияет на UX.

### Добавлять ли файл в return из usePdfUpload

В `UPLOAD_DONE` action уже есть `filename` и `size`. Но `filename` и `size` в UploadState не хранятся — хранится `file: File | null`. Для `/api/compress` нужен `file.name`. Это уже есть в `state.file.name`. Новых полей для filename не нужно.

### Vercel Blob `get()` возвращает null для несуществующих URL

[VERIFIED: @vercel/blob SDK docs] Если blob не найден, `get()` возвращает `null` (не бросает). `/api/download` должен проверять `if (!blobResult)` перед использованием stream.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Private blob streaming | Кастомный fetch + pipe | `get()` из `@vercel/blob` → `result.stream` напрямую в `Response` | SDK возвращает Web ReadableStream готовый для Response constructor |
| Multiple blob deletion | Ручной loop с try/catch | `del([url1, url2])` — batch delete | SDK поддерживает массив URL в одном вызове |
| JPEG compression | Кастомная JPEG re-encoding | sharp `.jpeg({ quality: N })` | Edge cases с EXIF, ICC profiles, progressive JPEG — sharp обрабатывает всё |
| Filename sanitization | Regex вручную | `.replace(/[^a-zA-Z0-9._-]/g, '_')` — стандартный паттерн из PITFALLS.md #9 | Path traversal protection |
| Request validation | Ручные if-checks | zod `z.object({ ... }).safeParse(body)` | Уже используется в /api/cleanup — тот же паттерн |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pdfDoc.context.enumerateIndirectObjects()` — стабильный internal API в pdf-lib 1.17.1 | Section 1 | Image extraction не работает; fallback на структурную компрессию только |
| A2 | `context.assign(ref, newStream)` — корректный способ заменить XObject image | Section 1 | Новое изображение не встраивается; PDF может быть повреждён |
| A3 | Cleanup (del()) после `new Response(stream)` не создаёт race condition | Section 3 | Файл удаляется до полной передачи клиенту; download обрывается |
| A4 | `PDFDocument.load()` throws с сообщением содержащим "encrypt" для зашифрованных PDF | Section 6 | Неправильная классификация ошибки; user видит generic error вместо encrypted-specific |
| A5 | sharp не крашится на embedded PNG с alpha channel внутри PDF | Section 1 | Image processing loop падает на alpha-PNG; catch поможет, но image не будет сжата |
| A6 | Compression ratios (Maximum: 60-80% для image PDFs) | Section 1 | Реальный ratio может быть меньше; user expectations не оправдаются |

**Риски A1 и A2 наиболее критичны.** Рекомендация: Wave 1 включает smoke test с реальным image-heavy PDF. Если image replacement нестабилен — использовать `compressPdfSimple` (только структурная компрессия).

---

## Open Questions

1. **Batch del() vs два отдельных вызова в /api/download**
   - Что знаем: `del([url1, url2])` поддерживается SDK.
   - Вариант: `deleteBlobSafe` принимает один URL. Можно обновить сигнатуру для массива.
   - Recommendation: В /api/download вызвать `del([blobUrl, compressedBlobUrl])` напрямую (без deleteBlobSafe wrapper) — чище. Или расширить deleteBlobSafe для массива.

2. **Download кнопка: fetch + createObjectURL vs прямая форма**
   - Что знаем: /api/download принимает POST body. Нельзя сделать `<a href="/api/download">`.
   - Текущий паттерн: `fetch('/api/download', { method: 'POST' }) → response.blob() → createObjectURL` — работает в Chrome/Firefox, может быть ограничен в Safari (Pitfall 11).
   - Alternative: скрытая `<form method="POST" action="/api/download">` с hidden inputs — нативный browser submit, работает в Safari без blob URL.
   - Recommendation: использовать fetch + createObjectURL для удобства. Если Safari-проблемы возникнут при тестировании — мигрировать на form submit.

---

## Sources

### Primary (HIGH confidence)
- `@vercel/blob` SDK docs — `get()`, `put()`, `del()` API, Context7 /vercel/storage (last_updated: 2026-02-19)
- Vercel Function Duration docs — https://vercel.com/docs/functions/configuring-functions/duration (last_updated: 2026-02-27) — plan limits verified
- Next.js streaming in Route Handlers — Context7 /vercel/next.js, "Stream files using Web Streams API" pattern
- pdf-lib SaveOptions API — Context7 /websites/pdf-lib_js — `useObjectStreams`, `updateFieldAppearances`
- pdf-lib embedJpg/embedPng API — Context7 /websites/pdf-lib_js — verified signatures
- sharp jpeg/png/resize API — Context7 /lovell/sharp — `quality`, `resize`, `fit: 'inside'`, `withoutEnlargement`
- `.planning/research/PITFALLS.md` — Pitfalls 4, 5, 6, 9, 10, 11, 12 напрямую применимы к Phase 2
- `features/pdf/usePdfUpload.ts` — читан; existing reducer structure
- `types/upload.ts` — читан; existing type definitions
- `services/blobService.ts` — читан; deleteBlobSafe pattern
- `app/api/cleanup/route.ts` — читан; existing cleanup pattern

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — версии библиотек, Vercel memory limits
- `.planning/research/ARCHITECTURE.md` — data flow, download proxy pattern
- `components/FileInfoCard.tsx` — читан; existing component structure для Phase 2 extension

### Tertiary (LOW / ASSUMED — см. Assumptions Log)
- A1–A6 в Assumptions Log — internal pdf-lib API, compression ratios, cleanup ordering semantics

---

## Metadata

**Confidence breakdown:**
- Vercel Blob download proxy: HIGH — SDK docs verified
- Next.js streaming Response: HIGH — official docs pattern
- Vercel Function timeout limits: HIGH — official docs verified
- pdf-lib structural compression (useObjectStreams): HIGH — official API
- pdf-lib image extraction (low-level API): LOW — internal API, ASSUMED
- sharp image processing: HIGH — official API
- Compression ratios: LOW — ASSUMED, content-dependent

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (@vercel/blob 2.3.3, pdf-lib 1.17.1, sharp 0.34.5 — версии зафиксированы)
