---
phase: 01-foundation-upload
plan: "1.2"
type: execute
wave: 3
depends_on: ["1.1", "1.3"]
files_modified:
  - features/pdf/pdfValidation.ts
  - features/pdf/usePdfUpload.ts
  - components/DropZone.tsx
  - components/DropZone.module.css
  - components/FileInfoCard.tsx
  - components/UploadProgress.tsx
  - components/UploadSection.tsx
  - app/page.tsx
autonomous: false
requirements:
  - UPLOAD-01
  - UPLOAD-02
  - UPLOAD-03
  - UPLOAD-04
  - UPLOAD-05
  - UX-01
  - UX-02

must_haves:
  truths:
    - "User can drag a PDF onto the drop zone and see it transition to drag-over state (blue border, 'Release to upload' text)"
    - "User can click the drop zone to open the file picker dialog"
    - "Dropping a non-PDF file shows inline error in drop zone: red border, 'PDF files only' heading, no toast"
    - "Dropping a file > 20 MB shows inline error: 'File too large' heading with actual file size in MB"
    - "Drop zone error clears when user starts a new drag or clicks the zone"
    - "During upload a real progress bar (0-100%) is visible with 'Uploading… N%' text"
    - "After successful upload, drop zone returns to idle state and FileInfoCard appears below it"
    - "FileInfoCard shows filename (truncated), size in MB with 1 decimal, green checkmark, disabled Compress PDF button, Upload another file link"
    - "Clicking Upload another file resets state to idle, hides FileInfoCard, and calls /api/cleanup to delete the uploaded blob"
    - "All interactive elements have 44px minimum touch target on mobile"
  artifacts:
    - path: "features/pdf/pdfValidation.ts"
      provides: "validateFileType, validateFileSize, formatFileSize functions"
      exports: ["validateFileType", "validateFileSize", "formatFileSize", "AppError"]
    - path: "features/pdf/usePdfUpload.ts"
      provides: "useReducer state machine + upload() orchestration"
      exports: ["usePdfUpload"]
    - path: "components/UploadSection.tsx"
      provides: "Client component wrapper — owns usePdfUpload hook, renders DropZone + FileInfoCard"
      exports: ["UploadSection"]
    - path: "components/DropZone.tsx"
      provides: "5-state drop zone component"
      exports: ["DropZone"]
    - path: "components/FileInfoCard.tsx"
      provides: "Post-upload file info display"
      exports: ["FileInfoCard"]
    - path: "components/UploadProgress.tsx"
      provides: "Upload progress bar sub-component"
      exports: ["UploadProgress"]
    - path: "app/page.tsx"
      provides: "Server Component — renders AppHeader + UploadSection"
  key_links:
    - from: "components/DropZone.tsx"
      to: "features/pdf/usePdfUpload.ts"
      via: "state prop + handler props (onDragEnter, onDragLeave, onDrop, onZoneClick) from UploadSection"
      pattern: "onDragEnter|onDragLeave|onDrop|onZoneClick"
    - from: "features/pdf/usePdfUpload.ts"
      to: "@vercel/blob/client upload()"
      via: "import and call"
      pattern: "from '@vercel/blob/client'"
    - from: "features/pdf/usePdfUpload.ts"
      to: "/api/cleanup"
      via: "fetch POST in handleReset when blobUrl is not null"
      pattern: "api/cleanup"
    - from: "components/UploadSection.tsx"
      to: "components/DropZone.tsx"
      via: "render with state props"
      pattern: "DropZone"
    - from: "components/UploadSection.tsx"
      to: "components/FileInfoCard.tsx"
      via: "conditional render when stage === upload-complete && state.file !== null"
      pattern: "FileInfoCard"
    - from: "app/page.tsx"
      to: "components/UploadSection.tsx"
      via: "render as child of main"
      pattern: "UploadSection"
---

## Phase Goal

**As a** user, **I want to** drag or select a PDF, see real upload progress, and get confirmation when my file is ready, **so that** I can proceed to compress it in the next step.

<objective>
Build the complete upload UI: validation logic, useReducer state machine wired to Vercel Blob client-upload, DropZone with all 5 visual states, UploadProgress bar, FileInfoCard, and UploadSection client wrapper. Wire into app/page.tsx as a Server Component.

Purpose: Delivers the core user-facing capability — the upload flow from file selection to "ready to compress" confirmation.
Output: Interactive upload page where user can select/drop PDF, see real progress, and view file info card after upload. Blob cleanup fires on reset.
</objective>

<execution_context>
@/js learn/GSD_Superpowers/.claude/get-shit-done/workflows/execute-plan.md
@/js learn/GSD_Superpowers/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-UI-SPEC.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-1.1-SUMMARY.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-1.3-SUMMARY.md

<interfaces>
<!-- Types from PLAN-1.1 types/upload.ts — use directly, no redefinition. -->

```typescript
// From types/upload.ts (created in PLAN-1.1)
export type UploadStage =
  | 'idle'
  | 'drag-over'
  | 'uploading'
  | 'upload-complete'
  | 'error'

export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK'
  message: string
  heading: string
}

export interface UploadState {
  stage: UploadStage
  file: File | null
  uploadProgress: number    // 0–100
  blobUrl: string | null
  error: AppError | null
}

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
```

Vercel Blob client upload signature (from RESEARCH.md):
```typescript
// import { upload } from '@vercel/blob/client'
upload(filename: string, file: File, {
  access: 'private',
  handleUploadUrl: '/api/upload',
  cacheControlMaxAge: 3600,
  onUploadProgress: ({ percentage }: { percentage: number }) => void
}): Promise<{ url: string }>
```

Antd components used in this plan:
- Progress: type="line", percent={N}, strokeColor="#4f6ef7", showInfo={false}
- Button: type="primary", size="large", block={true}, disabled={true}
- Typography.Link: for "Upload another file"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Validation logic and useReducer state machine</name>
  <files>
    features/pdf/pdfValidation.ts, features/pdf/usePdfUpload.ts
  </files>

  <read_first>
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md (Pattern 5: Client-side PDF validation, Pattern 2: useReducer, Code Examples section, Common Pitfalls #1)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md (D-07: error clears on drag/click)
    - d:/js learn/GSD_Superpowers/types/upload.ts (if already created in PLAN-1.1 — read the exact types before implementing)
  </read_first>

  <behavior>
    pdfValidation.ts:
    - validateFileType(file: File) where file.type = 'application/pdf' → returns null
    - validateFileType(file: File) where file.type = 'image/png' → returns AppError { code: 'FILE_TYPE', heading: 'PDF files only', message: 'This file is not a PDF. Please select a .pdf file.' }
    - validateFileSize(file: File, maxMb = 20) where file.size = 10 * 1024 * 1024 → returns null
    - validateFileSize(file: File, maxMb = 20) where file.size = 21 * 1024 * 1024 → returns AppError { code: 'FILE_SIZE', heading: 'File too large', message: 'Maximum file size is 20 MB. Your file is 21.0 MB.' }
    - formatFileSize(bytes: number) where bytes = 1536000 → returns '1.5 MB'
    - formatFileSize(bytes: number) where bytes = 400000 → returns '0.4 MB'

    usePdfUpload.ts reducer:
    - state { stage: 'idle' } + action DRAG_ENTER → state { stage: 'drag-over' }
    - state { stage: 'drag-over' } + action DRAG_LEAVE → state { stage: 'idle' }
    - state { stage: 'drag-over' } + action DROP_INVALID { error } → state { stage: 'error', error }
    - state { stage: 'uploading' } + action PROGRESS { percent: 42 } → state { stage: 'uploading', uploadProgress: 42 }
    - state { stage: 'uploading' } + action UPLOAD_DONE { blobUrl, filename, size } → state { stage: 'upload-complete', blobUrl }
    - state { stage: 'error' } + action DRAG_ENTER → state { stage: 'drag-over', error: null }
    - state { stage: 'upload-complete' } + action RESET → state { stage: 'idle', blobUrl: null, file: null }
  </behavior>

  <action>
    Create features/pdf/pdfValidation.ts with three exported functions:
    - validateFileType(file: File): AppError | null — checks file.type === 'application/pdf'; returns error object with exact copy from UI-SPEC.md Copywriting Contract if invalid
    - validateFileSize(file: File, maxMb = 20): AppError | null — checks file.size <= maxMb * 1024 * 1024; error message uses fileMb = (file.size / 1024 / 1024).toFixed(1), copy: "Maximum file size is {maxMb} MB. Your file is {fileMb} MB."
    - formatFileSize(bytes: number): string — returns (bytes / 1024 / 1024).toFixed(1) + ' MB'
    Import AppError from '@/types/upload' (path alias from PLAN-1.1 tsconfig). No default exports.

    Create features/pdf/usePdfUpload.ts as a 'use client' hook. Import useReducer, useRef, useCallback from 'react'. Import upload from '@vercel/blob/client'. Import UploadState, UploadAction, AppError from '@/types/upload'. Import validateFileType, validateFileSize from './pdfValidation'.

    Implement uploadReducer(state: UploadState, action: UploadAction): UploadState — exhaustive switch on action.type covering all 10 action types. Initial state: { stage: 'idle', file: null, uploadProgress: 0, blobUrl: null, error: null }.

    The reducer must implement per D-07: DRAG_ENTER clears error (error: null) and sets stage to 'drag-over'. ZONE_CLICK clears error and sets stage to 'idle'.

    usePdfUpload hook returns: { state, handleFile, handleDragEnter, handleDragLeave, handleDrop, handleZoneClick, handleReset, fileInputRef }. handleFile(file: File) runs validateFileType then validateFileSize; on error dispatches DROP_INVALID; on valid dispatches FILE_SELECTED then calls upload() with access: 'private', handleUploadUrl: '/api/upload', cacheControlMaxAge: 3600 (satisfies INFRA-02 TTL — files expire from CDN cache after 1 hour), onUploadProgress dispatching PROGRESS. On upload() resolve dispatches UPLOAD_DONE. On upload() reject dispatches UPLOAD_ERROR with { code: 'NETWORK', heading: 'Upload failed', message: 'Something went wrong. Please try again.' }.

    handleDragEnter uses dragEnterCount ref: increments count, dispatches DRAG_ENTER only when count goes from 0→1. handleDragLeave uses dragEnterCount ref: decrements count, dispatches DRAG_LEAVE only when count reaches 0. handleDrop(e: DragEvent) calls e.preventDefault(), resets dragEnterCount to 0, extracts e.dataTransfer.files[0], calls handleFile. handleZoneClick dispatches ZONE_CLICK (clears error per D-07) then calls fileInputRef.current?.click(). handleReset dispatches RESET. Additionally, handleReset must call cleanup: if state.blobUrl is not null before dispatching RESET, fire fetch('/api/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: state.blobUrl }) }) — do not await or block on this; fire-and-forget pattern is sufficient (cleanup failure must not break the UI reset flow). fileInputRef is useRef<HTMLInputElement>(null).

    Use dragEnterCount ref (number, initialized to 0) to handle drag event bubbling: increment on dragenter, decrement on dragleave, dispatch DRAG_ENTER only when count goes from 0→1, dispatch DRAG_LEAVE only when count reaches 0. Reset to 0 on drop.
  </action>

  <verify>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx tsc --noEmit 2>&1 | head -20
    </automated>
  </verify>

  <acceptance_criteria>
    - features/pdf/pdfValidation.ts exports validateFileType, validateFileSize, formatFileSize as named exports
    - validateFileType returns null for 'application/pdf', AppError for any other type
    - validateFileSize returns null for files <= 20 MB, AppError with actual file size in MB for files > 20 MB
    - formatFileSize(1536000) returns '1.5 MB' (toFixed(1), always MB)
    - features/pdf/usePdfUpload.ts exports usePdfUpload as named export
    - usePdfUpload.ts imports from '@vercel/blob/client' (not '@vercel/blob')
    - upload() is called with cacheControlMaxAge: 3600 (INFRA-02 TTL compliance)
    - uploadReducer handles all 10 action types (no TypeScript 'never' fallthrough warning)
    - dragEnterCount pattern is present (ref used to handle bubbling)
    - DRAG_ENTER action sets error: null in reducer
    - handleReset calls fetch('/api/cleanup', ...) when state.blobUrl is not null (fire-and-forget)
    - usePdfUpload returns handleDragEnter, handleDragLeave, handleDrop, handleZoneClick as separate functions (no dispatch exposed)
    - npx tsc --noEmit exits 0
  </acceptance_criteria>

  <done>
    Validation functions produce correct AppError objects with exact copy strings. useReducer state machine covers all 10 transitions. upload() is wired with real onUploadProgress callback and cacheControlMaxAge: 3600. handleReset triggers blob cleanup via /api/cleanup. Drag bubbling handled via dragEnterCount ref inside usePdfUpload. TypeScript strict mode passes with zero errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: DropZone, FileInfoCard, UploadProgress, UploadSection components and page wiring</name>
  <files>
    components/DropZone.tsx, components/DropZone.module.css, components/FileInfoCard.tsx, components/UploadProgress.tsx, components/UploadSection.tsx, app/page.tsx
  </files>

  <read_first>
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-UI-SPEC.md (Component Specs sections 2, 3; State × Component Matrix; Interaction Design; Responsive Design; Accessibility; Copywriting Contract; Animation & Transitions)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md (D-02, D-03, D-04, D-05, D-06, D-07)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md (Pattern 3, anti-pattern about fake progress)
  </read_first>

  <action>
    Create components/UploadProgress.tsx as 'use client'. Props: percent: number, filename: string. Renders: filename truncated at 280px max-width with text-overflow ellipsis, Ant Design Progress component (type="line", percent={percent}, strokeColor="#4f6ef7", showInfo={false}), status line "Uploading… {percent}%" (14px, color #8888a8). No fake animation. Export as named export UploadProgress.

    Create components/DropZone.tsx as 'use client'. Props: state: UploadState, onDragEnter: () => void, onDragLeave: () => void, onDrop: (e: React.DragEvent) => void, onZoneClick: () => void, onFile: (file: File) => void, fileInputRef: React.RefObject<HTMLInputElement>. NOTE: DropZone does NOT receive dispatch — all drag state transitions go through handler functions from usePdfUpload to preserve the dragEnterCount ref logic (RESEARCH.md Pitfall 3). Implements all 5 visual states from UI-SPEC.md:
    - idle: InboxOutlined 48px #8888a8, heading "Drag & Drop your PDF here", sub "or click to browse", label "PDF only · Up to 20 MB" (always visible per D-03), 2px dashed border #303050
    - drag-over: CloudUploadOutlined 48px #4f6ef7, heading "Release to upload", 2px solid border #4f6ef7, background rgba(79,110,247,0.06)
    - uploading: renders UploadProgress component, 2px solid border #4f6ef7, background rgba(79,110,247,0.04)
    - upload-complete: returns to idle visual (drop zone stays interactive per D-05)
    - error: CloseCircleOutlined 48px #ff4d4f, error heading (state.error.heading) 14px semibold #ff4d4f, error body (state.error.message) 14px regular #8888a8, 2px solid border #ff4d4f, background rgba(255,77,79,0.06)

    ARIA attributes per UI-SPEC.md Accessibility table: role="region", aria-label changes by state, aria-live="polite" during uploading, aria-live="assertive" during error.

    Keyboard: the container div handles onKeyDown for Enter and Space to trigger fileInputRef.current?.click(). tabIndex={0}.

    Hidden input: <input type="file" accept=".pdf,application/pdf" ref={fileInputRef} style={{ display: 'none' }} aria-hidden="true" onChange handlers call onFile with files[0].

    onClick on zone div: calls onZoneClick() — this handler (from usePdfUpload) dispatches ZONE_CLICK internally (error clears per D-07) and then triggers fileInputRef.current?.click().

    Drag event handlers: onDragEnter={onDragEnter}, onDragLeave={onDragLeave} (these props wire to usePdfUpload's handleDragEnter/handleDragLeave which manage the dragEnterCount ref — do not dispatch directly in DropZone), onDragOver calls preventDefault(), onDrop={onDrop} calls the onDrop prop (which handles preventDefault and file extraction).

    CSS transitions via DropZone.module.css: border-color 150ms ease, background-color 150ms ease. prefers-reduced-motion media query disables all transitions. Minimum height 280px desktop, 200px mobile (below 768px). Zone is cursor: pointer.

    Create components/FileInfoCard.tsx as 'use client'. Props: filename: string, size: number (bytes), onReset: () => void. Renders container (background colorBgContainer, border 1px solid #303050, border-radius 8px, padding 24px, margin-top 16px). Row 1: CheckCircleFilled 24px #52c41a + filename (14px semibold, max-width truncated) + formatFileSize(size) right-aligned 14px #8888a8. Row 2: Button type="primary" size="large" block disabled title="Compression coming in the next step" aria-disabled="true" aria-label="Compress PDF — compression available after upload" text "Compress PDF". Row 3: Typography.Link centered aria-label="Upload another file — resets the upload form" onClick={onReset} text "Upload another file". Animation on mount: opacity 0→1, translateY(8px)→translateY(0) over 200ms. role="status" aria-label="File uploaded successfully" aria-live="polite". On render, focus this container (useEffect + ref.current?.focus()).

    Create components/UploadSection.tsx as 'use client'. This component owns the usePdfUpload hook and composes DropZone + FileInfoCard. Import usePdfUpload from '@/features/pdf/usePdfUpload'. Import DropZone from './DropZone'. Import FileInfoCard from './FileInfoCard'. Call usePdfUpload() to get { state, handleFile, handleDragEnter, handleDragLeave, handleDrop, handleZoneClick, handleReset, fileInputRef }. Render:
    - Upload card div: max-width 600px, width 100%, border-radius 12px, background #1a1a2e, padding 24px (mobile: 16px, breakpoint < 768px)
    - DropZone with props: state={state}, onDragEnter={handleDragEnter}, onDragLeave={handleDragLeave}, onDrop={handleDrop}, onZoneClick={handleZoneClick}, onFile={handleFile}, fileInputRef={fileInputRef}. Do NOT pass dispatch to DropZone.
    - FileInfoCard conditionally: {state.stage === 'upload-complete' && state.file && <FileInfoCard filename={state.file.name} size={state.file.size} onReset={handleReset} />}. The double condition (stage check AND state.file null-check) is required — TypeScript strict mode will error without it because UploadState.file is File | null.
    Export as named export UploadSection.

    Rewrite app/page.tsx as a Server Component (no 'use client' directive). Import AppHeader from '@/components/AppHeader'. Import UploadSection from '@/components/UploadSection'. Render:
    - AppHeader at top
    - <main> with min-height calc(100vh - 56px), display flex, align-items center, justify-content center, padding 24px
    - <UploadSection /> centered inside main
    app/page.tsx must NOT use usePdfUpload or any hook directly — all client logic lives in UploadSection.
  </action>

  <verify>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx tsc --noEmit 2>&1 | head -20
    </automated>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npm run build 2>&1 | tail -15
    </automated>
  </verify>

  <acceptance_criteria>
    - components/DropZone.tsx contains aria-label and role="region" attributes
    - components/DropZone.tsx contains accept=".pdf,application/pdf" on the hidden input (iOS compatibility per RESEARCH.md Pitfall 4)
    - components/DropZone.tsx handles all 5 stages with distinct visual output (check by reading the component)
    - components/DropZone.module.css contains "transition: border-color 150ms ease" and "prefers-reduced-motion" media query
    - components/DropZone.tsx does NOT import or use React.Dispatch — drag events go through onDragEnter/onDragLeave/onDrop/onZoneClick props
    - components/FileInfoCard.tsx contains disabled on the Compress PDF button and title="Compression coming in the next step"
    - components/FileInfoCard.tsx calls onReset on "Upload another file" click
    - components/UploadProgress.tsx imports Progress from 'antd' and uses strokeColor="#4f6ef7"
    - components/UploadSection.tsx has 'use client' directive and calls usePdfUpload()
    - components/UploadSection.tsx renders FileInfoCard only when state.stage === 'upload-complete' AND state.file is not null (both conditions required — TypeScript null-check)
    - components/UploadSection.tsx does NOT pass dispatch as a prop to DropZone
    - app/page.tsx does NOT contain 'use client' directive (remains a Server Component)
    - app/page.tsx imports and renders UploadSection (not DropZone or FileInfoCard directly)
    - npm run build exits 0 with no TypeScript errors
    - "PDF only · Up to 20 MB" text is present in DropZone idle state (per D-03)
    - FileInfoCard renders without TypeScript error — state.file null-check present in JSX (npx tsc --noEmit exits 0)
  </acceptance_criteria>

  <done>
    All 5 DropZone states render correctly. FileInfoCard appears after upload with disabled Compress PDF and working Reset link. UploadProgress shows real percent. UploadSection owns all client state. app/page.tsx remains a Server Component. Build passes. 44px touch targets enforced on mobile. No TypeScript strict mode errors from null access on state.file.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user file selection → client validation | Untrusted file bytes from user's filesystem enter here |
| browser → /api/upload | Token request (no file bytes); response is a short-lived upload token |
| browser → Vercel Blob CDN | Direct PUT using token; only PDF content type allowed |
| browser → /api/cleanup | Untrusted JSON body with blob URL to delete on reset |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-02-01 | Spoofing | File type validation | High | mitigate | validateFileType checks file.type MIME (not just file extension); RESEARCH.md Pattern 5 explicitly forbids regex on file.name. Server-side allowedContentTypes: ['application/pdf'] in handleUpload as second layer (PLAN-1.3) |
| T-02-02 | Denial of Service | Oversized file bypass | High | mitigate | validateFileSize runs client-side before upload() is called; maximumSizeInBytes: 20*1024*1024 enforced server-side in handleUpload token (PLAN-1.3). Both layers required |
| T-02-03 | Spoofing | Fake progress via setInterval | Low | mitigate | onUploadProgress wired to real XHR events only; RESEARCH.md Anti-Patterns explicitly forbids timer-driven progress |
| T-02-04 | Elevation of Privilege | blobUrl exposed in client state | Low | accept | blobUrl in React state is not a secret — it's a private Vercel Blob URL requiring server auth. Phase 2 will proxy via /api/download. No sensitive data in blobUrl itself |
| T-02-05 | Denial of Service | Multiple concurrent uploads | Low | accept | MVP: single file state machine; dropping new file while uploading triggers RESET → new upload. No queue needed for v1 |
</threat_model>

<verification>
After both tasks complete:

1. npm run dev — visit http://localhost:3000, confirm dark background, "PDF Compressor" header, centered upload card
2. Drop a .png file → red border, "PDF files only" heading visible inside zone (no toast/popup)
3. Drop a file with simulated size > 20 MB → "File too large" error with file size in MB
4. Drag a file over zone → blue border, "Release to upload" text
5. After upload complete → FileInfoCard appears below drop zone, drop zone returns to idle
6. Click "Upload another file" → FileInfoCard hides, drop zone returns to idle, /api/cleanup is called (check network tab)
7. npx tsc --noEmit exits 0
8. npm run build exits 0
9. cat app/page.tsx | grep "use client" returns no match (page.tsx is a Server Component)
</verification>

<success_criteria>
- All 5 DropZone states render correctly per UI-SPEC.md spec
- Validation errors show inline in zone with exact copy strings from Copywriting Contract
- Real XHR progress is visible (not fake/timer-based)
- FileInfoCard shows filename, size in "N.N MB" format, disabled Compress button, functional Reset link
- Clicking Reset fires /api/cleanup (fire-and-forget) when a blob URL exists
- Upload flow is completable in 1 click (click zone, select file — per UX-02)
- Page is responsive: mobile breakpoint (< 768px) uses full-width card, 200px min zone height
- app/page.tsx is a Server Component; 'use client' boundary is in UploadSection.tsx
- TypeScript strict errors: zero
</success_criteria>

<output>
After completion, create d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-1.2-SUMMARY.md
</output>
