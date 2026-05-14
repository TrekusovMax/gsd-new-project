# Feature Landscape: PDF Compression Web App

**Domain:** Browser-based PDF compression SaaS / utility tool
**Researched:** 2026-05-14
**Confidence:** MEDIUM — Based on training data (Smallpdf, ILovePDF, PDF24, Adobe Acrobat Online,
Sejda, Compress2Go, PDFCompressor.com). Live verification unavailable in this session.

---

## Table Stakes

Features users expect. Their absence causes immediate abandonment.

### Upload UX

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Drag & Drop zone | Every modern file tool has it; users default to dragging | Low | Full-page drop target preferred, not just a small box |
| Click-to-browse fallback | Required for mobile and keyboard users; drag-only = broken on iOS | Low | Hidden `<input type="file">` triggered by button click |
| File type validation (client-side) | Users accidentally drop wrong files; instant feedback prevents wasted round-trips | Low | Reject non-PDF before upload begins, show clear message |
| File size validation (client-side) | Show limit error immediately, not after upload | Low | Display limit prominently in the drop zone (e.g., "Max 20 MB") |
| Upload progress indicator | Any upload over ~2s without feedback feels broken | Low-Med | Progress bar or spinner with percentage; HTTP upload progress via XHR/fetch |
| Single-file mode (MVP) | Users expect one file at a time for free tools | Low | Multi-file is a paid/pro pattern on competitors |

**Standard max file size for free tools (from competitor research):**
- Smallpdf free: 5 MB per file (with account), 2 MB without
- ILovePDF free: 200 MB per file (generous)
- PDF24: ~200 MB (most generous free tier)
- Adobe Acrobat Online free: 2 GB but limited uses per day
- Sejda free: 50 MB or 200 pages
- **Recommended for MVP:** 20–50 MB is the sweet spot — covers 95% of real-world PDFs (presentations, reports) without straining Vercel serverless function memory/timeout limits

### Compression Options / Presets

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Named compression presets | Users do not understand DPI/image quality numbers; named tiers map to intent | Low | Standard tier names: "Low" / "Medium" / "High" or "Screen" / "Print" / "Archive" |
| 3-tier preset system | Market standard; anything fewer feels limited, anything more feels overwhelming | Low | Most competitors offer exactly 3 levels |
| Visual hint of quality trade-off | Users need to know "High compression = lower quality" without reading docs | Low | Subtitle text under each option is sufficient |
| Default preset pre-selected | Users expect to click Compress without choosing; Medium is the safe default | Low | Don't require a choice before the button activates |

**Standard compression tier naming in the wild:**
- Smallpdf: "Basic" (72 DPI) / "Strong" (150 DPI) — just 2 options
- ILovePDF: "Extreme" / "Recommended" / "Less" — 3 options, recommended pre-selected
- PDF24: "Screen" / "eBook" / "Printer" / "Prepress" — 4 options (Ghostscript presets)
- Sejda: slider from 1–5 with labels
- **Recommended naming for MVP:** "Maximum Compression" / "Balanced" / "High Quality" — intent-based, not technical

### Compression Statistics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Original file size | Users need baseline to judge result | Low | Show on upload completion |
| Compressed file size | Core output metric | Low | Show immediately when compression completes |
| Size reduction percentage | Most emotionally satisfying metric — "Saved 68%!" | Low | Calculate: `((original - compressed) / original) * 100` |
| Absolute bytes saved | Secondary metric; useful for large files | Low | "Saved 4.2 MB" |
| Processing time | Nice to have; reassures user the server is fast | Low | Optional — some tools skip this |

**What NOT to show in stats (adds noise):**
- Page count (irrelevant to compression)
- DPI used (too technical for most users)
- Individual image compression stats (too detailed)

### Download Flow

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single prominent download button | Users expect one clear CTA after compression | Low | Large, high-contrast button — not a link |
| Auto-suggested filename | `[original-name]-compressed.pdf` — prevents overwriting originals | Low | Handle in Content-Disposition header |
| Browser-native download | Standard `<a href download>` or response with Content-Disposition attachment | Low | No custom download manager needed |
| "Compress another file" / Reset | Users expect easy reset after download — this is a loop, not a one-shot tool | Low | Show after download completes; resets entire UI state |
| File available for ~60 minutes | Temp files should persist long enough if user is distracted | Med | Requires cleanup job; Vercel serverless makes this tricky — see PITFALLS |

---

## Differentiators

Features that make a PDF compressor stand out. Not expected but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Client-side preview (PDF.js) | User can verify quality before downloading; reduces "was it good enough?" anxiety | High | Requires PDF.js or similar; significant bundle size addition |
| Before/after size visualisation | Visual progress bar or split comparison builds trust in the tool | Low-Med | A simple bar chart comparing original vs compressed is low effort, high trust signal |
| Estimated quality preview text | "Images will render at approx. 150 DPI" under each preset | Low | Copy-only; no code complexity |
| Processing speed | Sub-5s for typical files (1–10 MB) is a strong differentiator; competitors average 5–15s | High | Depends on compression library and server capacity, not just UX |
| No-registration required | Most competitors push account creation; staying truly free and anonymous is differentiated | Low | Architecture choice: no auth, no tracking. Already in spec |
| Privacy messaging | "Files deleted after 1 hour" / "We never read your files" | Low | Copy + actual temp file cleanup implementation |
| Mobile-optimised upload | iOS share sheet integration, Android Chrome file picker work natively with `accept=".pdf"` | Low | Just correct HTML attributes; no extra code |
| Dark mode | Increasingly expected; Ant Design supports it natively | Low-Med | CSS variables / Ant Design theme token; low value for a utility tool |
| Compression history (session-only) | Show last 3 files compressed in current session without a backend | Med | localStorage only; no auth required; differentiates without complexity of accounts |

**2025 competitive differentiation landscape:**
- Speed is the clearest differentiator — Smallpdf and ILovePDF are perceived as slow at peak times
- Privacy/no-tracking messaging resonates strongly post-GDPR
- No upsell interruptions during the core flow is a UX win (competitors inject upgrade prompts aggressively)
- Batch processing is the #1 requested feature on competitor forums but is universally paywalled

---

## Anti-Features

Features that look useful but add complexity without clear MVP value. Deliberately avoid.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Batch / multi-file upload | Doubles UI state complexity, multiplies server load, requires queuing logic | Spec already defers this; single file is the 80% use case |
| User accounts / login | No MVP value; adds auth complexity, GDPR surface area, email flows | Cookie/session approach if history needed later |
| Cloud storage integration (Google Drive, Dropbox) | OAuth flows, token management, per-provider edge cases | Direct upload is faster for 95% of users |
| OCR / text recognition | Completely different domain; adds huge library dependencies (Tesseract = 40MB+) | Out of scope — different product |
| PDF editing (merge, split, rotate) | Feature creep; each requires its own tested code path | Keep to single-purpose compression tool |
| Payment / premium tiers | Pre-monetisation complexity; no point until traffic validates demand | Add later if usage justifies it |
| Custom compression DPI input | Technical users want it; general users are confused; support cost high | Named presets cover 95% of intent; add advanced mode in v2 |
| Email delivery of compressed file | Adds email infrastructure, spam risk, privacy concerns | Browser download is instant and expected |
| PDF password/encryption | Different security domain; adds legal liability questions | Separate tool if ever needed |
| Page-range selection for compression | Rarely needed; adds selection UI complexity | Compress whole document |
| Undo / version history | Requires storage, versioning logic | Users keep original; just re-upload if unhappy |
| Progress with page-by-page updates | Granular server-sent events for compression progress | Single progress bar is sufficient; page events add WebSocket/SSE complexity |

---

## File Size & Processing Time Benchmarks

### Competitor File Size Limits (Free Tier)

| Tool | Free Limit | Notes |
|------|-----------|-------|
| Smallpdf | 5 MB (with free account) | Aggressively pushes Pro |
| ILovePDF | 200 MB | Most generous free tier |
| PDF24 | ~200 MB | Ghostscript-based, desktop app available |
| Adobe Acrobat Online | 2 GB | But limited to 2 free uses/day |
| Sejda | 50 MB or 200 pages | Generous but has daily task limits |
| Compress2Go | 100 MB | Less known, no limits pushing |

**Recommendation for MVP:** 20 MB hard limit.
- Rationale: Vercel serverless functions have 4.5 MB request body limit by default (configurable up to 4.5 MB for Edge, larger for Node.js routes). Next.js App Router API routes can handle larger payloads with `bodyParser: false` and streaming. 20 MB covers typical office PDFs, presentations, and scanned documents. Anything larger (architectural drawings, print-ready files) is a different use case requiring dedicated infrastructure.
- Show the limit prominently in the upload zone to prevent failed uploads.

### User Expectations for Processing Time

| File Size | Expected Time | Tolerable Maximum | Action if Exceeded |
|-----------|--------------|------------------|--------------------|
| < 1 MB | < 2s | 5s | Show spinner |
| 1–5 MB | 2–5s | 10s | Show progress bar with percentage |
| 5–20 MB | 5–15s | 30s | Show progress bar + "Processing large file..." message |
| > 20 MB | N/A | N/A | Reject at upload with clear message |

**Key insight:** Users tolerate longer waits if there is visible progress. A stuck spinner for 10s feels longer than a progress bar for 15s. Perceived performance matters more than actual performance for this type of tool.

---

## Standard UX Patterns (Competitor Analysis)

### Upload Screen
- Large centered drop zone (min 300px tall) with dashed border
- Cloud upload icon + "Drag & Drop your PDF here" primary text
- "or click to browse" secondary link below
- File size limit displayed as subtitle: "Max 20 MB · PDF only"
- Entire page accepts drop (not just the box) — prevents "missed the target" frustration

### Processing Screen
- File name displayed at top (user confirmation they uploaded the right file)
- Progress bar with percentage (0–100%)
- Status message changes: "Uploading..." → "Compressing..." → "Done!"
- Cancel button (rarely used but its presence reduces anxiety)
- Do NOT navigate away — single-page state machine

### Results Screen
- Stats panel: before / after / saved (both % and MB)
- Large "Download" CTA button (primary color, full-width on mobile)
- "Compress another file" secondary button/link below
- Optional: share link (low priority for MVP)

### Error States
- Wrong file type: inline message in drop zone, not a modal
- File too large: inline message in drop zone with the limit stated
- Server error during compression: clear message + "Try again" button — not a generic 500 page
- Network timeout: distinguish from server error; "Check your connection and retry"

---

## MVP Feature Priority

### Must Have (MVP - Phase 1 & 2 per spec)
1. Drag & Drop + click-to-browse upload
2. Client-side file type + size validation
3. Upload progress indicator
4. 3 named compression presets (Maximum / Balanced / High Quality)
5. Server-side compression via Next.js API route
6. Stats display (original size, compressed size, % saved)
7. Single-click download with suggested filename
8. "Compress another file" reset flow
9. Responsive layout (mobile + desktop)
10. Error handling for all failure modes

### Defer to Post-MVP (confirmed in spec)
- Batch processing
- PDF preview (PDF.js)
- Session compression history
- Dark mode
- User accounts

### Never Build (Anti-features confirmed)
- OCR, editing, merging, splitting
- Email delivery
- Cloud storage integrations
- Custom DPI input (v1)

---

## Feature Dependencies

```
File validation (client) → Upload → Upload progress
Upload complete → Preset selection (can be pre-selected before upload too)
Upload + preset selection → Compress button active
Compress → Server processing → Stats display
Stats display → Download button active
Download → "Compress another" reset
```

Note: Preset selection can happen before or after upload. ILovePDF allows preset selection before upload; Smallpdf requires upload first. Pre-upload preset selection reduces clicks but adds state management complexity. For MVP: show presets after upload to keep state simple.

---

## Sources

- Training data: Smallpdf, ILovePDF, PDF24, Adobe Acrobat Online, Sejda, Compress2Go — feature sets as of mid-2025
- Competitor UX patterns: Based on analysis of these tools over multiple versions
- Confidence: MEDIUM — established patterns, no live verification available in this research session
- Gaps: Pricing tier boundaries may have shifted; batch processing limits may vary; Vercel-specific file size limits should be confirmed against current Vercel documentation during implementation
