---
plan: PLAN-2.2
phase: 02-compression-download
title: Compression UI
goal: Extend usePdfUpload and FileInfoCard to cover the compressing, compress-complete, and compress-error UI states with preset selector, loading indicator, and stats display.
wave: 2
requires: PLAN-2.1
---

## Goal

Wire the compression engine from PLAN-2.1 into the UI. This plan extends the state machine in `usePdfUpload` with `handleCompress`, `handleDownload`, and `handleRetry`, updates `FileInfoCard` to render four distinct stages (`upload-complete`, `compressing`, `compress-complete`, `error`), and threads the new props through `UploadSection`. After this plan the user can select a preset, press Compress, watch the loading state, and see the compression statistics — all per decisions D-01 through D-09 and D-11 through D-12.

PLAN-2.3 (download route + error handling) runs in the same wave as this plan. They both depend on PLAN-2.1 but do not depend on each other. The only coordination point: PLAN-2.2 owns the `upload-complete`, `compressing`, and `compress-complete` render branches; PLAN-2.3 adds the `error` (compress-error) render branch. Both plans modify `FileInfoCard.tsx` — executor of PLAN-2.2 must leave a clear `// PLAN-2.3: add error state here` comment at the insertion point so PLAN-2.3 does not conflict.

## Requirements covered

- COMP-01: Segmented preset selector with three options (per D-01, D-02)
- COMP-02: Balanced selected by default (per D-03; initialState.preset = 'balanced')
- COMP-04: Compressing loading state visible during processing (per D-04, D-05)
- RES-01: Statistics row displayed after compress-complete (per D-06, D-07)
- RES-02: Download button present and functional after compress-complete (per D-08)
- RES-04: "Сжать другой файл" link resets state (per D-09)

## Context: interfaces from PLAN-2.1

PLAN-2.1 adds these to `types/upload.ts`. Executor must use them exactly as defined:

```typescript
export type CompressionPreset = 'maximum' | 'balanced' | 'quality'

// New UploadStage values: 'compressing' | 'compress-complete'
// New UploadState fields: preset, compressedBlobUrl, originalSize, compressedSize
// New UploadAction variants: SET_PRESET, COMPRESS_START, COMPRESS_DONE, COMPRESS_ERROR
```

`initialState` in `usePdfUpload` must gain the Phase 2 fields:

```typescript
const initialState: UploadState = {
  stage: 'idle',
  file: null,
  uploadProgress: 0,
  blobUrl: null,
  error: null,
  preset: 'balanced',        // D-03: Balanced is default
  compressedBlobUrl: null,
  originalSize: null,
  compressedSize: null,
}
```

## Tasks

### Task 1: Extend features/pdf/usePdfUpload.ts

**File:** `features/pdf/usePdfUpload.ts`
**Action:** Modify

**Changes to `initialState`:**

Add the four new fields after `error: null`:

```typescript
preset: 'balanced',
compressedBlobUrl: null,
originalSize: null,
compressedSize: null,
```

**Changes to `uploadReducer` — add new cases before the `default` branch:**

```typescript
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
```

The existing `RESET` case already returns `{ ...initialState }` — since `initialState` now includes the four new fields with null/default values, no change is needed to the RESET case.

**New function `handleCompress` — add after `handleReset`:**

```typescript
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
      const data: unknown = await response.json().catch(() => ({}))
      const errorCode = (data as Record<string, unknown>).error
      const isEncrypted = errorCode === 'ENCRYPTED_PDF'
      dispatch({
        type: 'COMPRESS_ERROR',
        error: {
          code: isEncrypted ? 'ENCRYPTED_PDF' : 'COMPRESSION_FAILED',
          heading: isEncrypted ? 'Password-protected PDF' : 'Compression failed',
          message: isEncrypted
            ? 'This PDF is password-protected. Remove the password and try again.'
            : 'Something went wrong during compression. Please try again.',
        },
      })
      return
    }

    const data = await response.json() as {
      compressedBlobUrl: string
      originalSize: number
      compressedSize: number
    }
    dispatch({ type: 'COMPRESS_DONE', ...data })
  } catch {
    dispatch({
      type: 'COMPRESS_ERROR',
      error: {
        code: 'COMPRESSION_FAILED',
        heading: 'Compression failed',
        message: 'Network error. Check your connection and try again.',
      },
    })
  }
}, [state.blobUrl, state.file, state.preset])
```

**New function `handleDownload` — add after `handleCompress`:**

```typescript
const handleDownload = useCallback(async () => {
  if (!state.compressedBlobUrl || !state.blobUrl || !state.file) return

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
    a.download = `${state.file.name.replace(/\.pdf$/i, '')}-compressed.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    // Silent fail — user already sees the download button and can retry
  }
}, [state.compressedBlobUrl, state.blobUrl, state.file])
```

Note: per D-08, the Download button stays after the download. No state transition after `handleDownload` completes. The blob URLs become invalid after the first successful download (server deletes them), but the button remains visible — this is acceptable MVP behavior.

**New function `handleRetry` — add after `handleDownload`:**

```typescript
const handleRetry = useCallback(() => {
  dispatch({ type: 'COMPRESS_START' })
  // handleRetry re-dispatches COMPRESS_START and re-runs the compress flow
  // by calling handleCompress directly (blobUrl is still valid — server does not
  // delete the original blob on compression failure)
  handleCompress()
}, [handleCompress])
```

Wait — `handleRetry` calling `handleCompress` after dispatching `COMPRESS_START` would double-dispatch. Instead, `handleRetry` should simply call `handleCompress()` directly (which already dispatches `COMPRESS_START` at its start). Remove the redundant dispatch:

```typescript
const handleRetry = useCallback(() => {
  handleCompress()
}, [handleCompress])
```

**Update return value of `usePdfUpload`:**

Add `handleCompress`, `handleDownload`, `handleRetry` to the returned object:

```typescript
return {
  state,
  handleFile,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleZoneClick,
  handleReset,
  handleCompress,
  handleDownload,
  handleRetry,
  fileInputRef,
}
```

**Verify:** `npx tsc --noEmit` exits 0. The exhaustive `never` check on the `default` case in `uploadReducer` must still compile — all 14 action variants are handled.

**Done:** Hook exports `handleCompress`, `handleDownload`, `handleRetry`. State transitions `compressing` → `compress-complete` and `compressing` → `error` work correctly per the reducer cases above.

---

### Task 2: Extend components/FileInfoCard.tsx

**File:** `components/FileInfoCard.tsx`
**Action:** Modify (extend props interface and add stage-conditional rendering)

**New props interface** (replaces the existing three-field interface):

```typescript
interface FileInfoCardProps {
  filename: string
  size: number
  stage: 'upload-complete' | 'compressing' | 'compress-complete' | 'error'
  preset: CompressionPreset
  onPresetChange: (preset: CompressionPreset) => void
  onCompress: () => void
  onDownload: () => void
  onReset: () => void
  onRetry: () => void
  originalSize?: number | null
  compressedSize?: number | null
}
```

Import `CompressionPreset` from `@/types/upload`. Import `Segmented`, `Tag`, `Button`, `Typography` from `antd`. Import `DownloadOutlined` from `@ant-design/icons`. Keep existing imports (`CheckCircleFilled`, `formatFileSize`, `useEffect`, `useRef`).

**Helper functions** (define inside the component file, before the component):

```typescript
function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function calcSavings(original: number, compressed: number): { percent: number; savedMB: string } {
  const percent = Math.round(((original - compressed) / original) * 100)
  const savedMB = formatMB(original - compressed)
  return { percent, savedMB }
}
```

**Rendering structure:**

The outer card wrapper (background, border, borderRadius, padding, animation) and the filename/size header row (`CheckCircleFilled` + filename + size) remain the same across all stages and are always rendered.

Below the header row, render stage-conditional content:

**Stage `upload-complete`:**

```tsx
{/* Segmented preset selector — D-01, D-02, D-03 */}
<div style={{ marginBottom: 16 }}>
  <Segmented
    options={[
      { label: 'Maximum', value: 'maximum' },
      { label: 'Balanced', value: 'balanced' },
      { label: 'High Quality', value: 'quality' },
    ]}
    value={preset}
    onChange={(v) => onPresetChange(v as CompressionPreset)}
    block
    style={{ marginBottom: 12 }}
  />
  <Button
    type="primary"
    size="large"
    block
    onClick={onCompress}
    style={{ minHeight: 44 }}
  >
    Compress PDF
  </Button>
</div>
<div style={{ textAlign: 'center' }}>
  <Typography.Link onClick={onReset} style={{ fontSize: 14 }}>
    Upload another file
  </Typography.Link>
</div>
```

**Stage `compressing`** (D-04, D-05):

```tsx
<div style={{ marginBottom: 16 }}>
  <Segmented
    options={[
      { label: 'Maximum', value: 'maximum' },
      { label: 'Balanced', value: 'balanced' },
      { label: 'High Quality', value: 'quality' },
    ]}
    value={preset}
    disabled
    block
    style={{ marginBottom: 12 }}
  />
  <Button
    type="primary"
    size="large"
    block
    loading
    disabled
    style={{ minHeight: 44 }}
  >
    Compressing…
  </Button>
</div>
```

**Stage `compress-complete`** (D-06, D-07, D-08, D-09):

Render stats only when `originalSize` and `compressedSize` are non-null. Use `formatMB` and `calcSavings`.

```tsx
{originalSize != null && compressedSize != null && (() => {
  const { percent, savedMB } = calcSavings(originalSize, compressedSize)
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', marginBottom: 6 }}>
        {formatMB(originalSize)} → {formatMB(compressedSize)}
      </div>
      <Tag color="#52c41a" style={{ marginBottom: 16 }}>
        ↓ {percent}% (− {savedMB})
      </Tag>
      <Button
        type="primary"
        size="large"
        block
        icon={<DownloadOutlined />}
        onClick={onDownload}
        style={{ minHeight: 44, marginBottom: 12 }}
      >
        Download
      </Button>
    </div>
  )
})()}
<div style={{ textAlign: 'center' }}>
  <Typography.Link onClick={onReset} style={{ fontSize: 14 }}>
    Сжать другой файл
  </Typography.Link>
</div>
```

**Stage `error` — insertion point marker for PLAN-2.3:**

```tsx
{/* PLAN-2.3: add compress-error state here */}
```

This comment must be present so PLAN-2.3 can locate the insertion point without conflict.

**Transition animation between stages:** Wrap the stage-conditional section in a `<div>` with `key={stage}` so React unmounts/remounts it on stage change, triggering the existing `fileCardEnter` CSS animation. The keyframe is already defined in the existing `<style>` block inside the component.

**Verify:**
- `npx tsc --noEmit` exits 0
- All four stage-conditional branches are present in the JSX
- The `// PLAN-2.3: add compress-error state here` comment is present in the error branch position
- Segmented is disabled during `compressing` stage
- Button shows `loading` prop during `compressing` stage

**Done:** `FileInfoCard` accepts the new props, renders all four stage branches, TypeScript strict mode passes.

---

### Task 3: Update components/UploadSection.tsx

**File:** `components/UploadSection.tsx`
**Action:** Modify

Destructure the three new handlers from `usePdfUpload()`:

```typescript
const {
  state,
  handleFile,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleZoneClick,
  handleReset,
  handleCompress,
  handleDownload,
  handleRetry,
  fileInputRef,
} = usePdfUpload()
```

Update the `FileInfoCard` render condition and props. Currently:
```tsx
{state.stage === 'upload-complete' && state.file !== null && (
  <FileInfoCard filename={state.file.name} size={state.file.size} onReset={handleReset} />
)}
```

Replace with:
```tsx
{(state.stage === 'upload-complete' ||
  state.stage === 'compressing' ||
  state.stage === 'compress-complete' ||
  state.stage === 'error') &&
  state.file !== null && (
  <FileInfoCard
    filename={state.file.name}
    size={state.file.size}
    stage={state.stage as 'upload-complete' | 'compressing' | 'compress-complete' | 'error'}
    preset={state.preset}
    onPresetChange={(preset) => {
      // Dispatch via usePdfUpload is not directly exposed — pass inline dispatch
      // Actually: usePdfUpload does not expose dispatch. Add handleSetPreset to the hook return.
    }}
    onCompress={handleCompress}
    onDownload={handleDownload}
    onReset={handleReset}
    onRetry={handleRetry}
    originalSize={state.originalSize}
    compressedSize={state.compressedSize}
    error={state.error}
  />
)}
```

Because `onPresetChange` needs to call `dispatch({ type: 'SET_PRESET', preset })` and dispatch is internal to the hook, add a `handleSetPreset` function to `usePdfUpload`:

Go back to `features/pdf/usePdfUpload.ts` and add:

```typescript
const handleSetPreset = useCallback((preset: CompressionPreset) => {
  dispatch({ type: 'SET_PRESET', preset })
}, [])
```

Add `handleSetPreset` to the return object. Then use it in `UploadSection`:

```tsx
onPresetChange={handleSetPreset}
```

**Verify:** `npx tsc --noEmit` exits 0. The `stage` cast is sound because the condition above guarantees only the four allowed values reach `FileInfoCard`.

**Done:** `UploadSection` renders `FileInfoCard` for all four compression stages with all required props. TypeScript compiles cleanly.

## Verification

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `usePdfUpload` returns `handleCompress`, `handleDownload`, `handleRetry`, `handleSetPreset`
- [ ] Reducer handles all 14 `UploadAction` variants without TypeScript error on the `never` check
- [ ] `FileInfoCard` renders Segmented (enabled) + Compress button when `stage === 'upload-complete'`
- [ ] `FileInfoCard` renders Segmented (disabled) + loading Button when `stage === 'compressing'`
- [ ] `FileInfoCard` renders stats + Download button + "Сжать другой файл" link when `stage === 'compress-complete'`
- [ ] `FileInfoCard` has `{/* PLAN-2.3: add compress-error state here */}` comment for the error branch
- [ ] `UploadSection` shows `FileInfoCard` for all four compression stages (not just `upload-complete`)
- [ ] Ant Design `Segmented` block prop set; `Tag` uses `#52c41a` color; Download `Button` has `DownloadOutlined` icon
