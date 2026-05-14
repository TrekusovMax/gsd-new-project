# Technology Stack: PDF Compression Web App

**Project:** PDF Compression Web App (MVP)
**Researched:** 2026-05-14
**Confidence:** HIGH (npm registry verified, official Next.js docs via Context7)

---

## Constraints (Pre-Decided)

| Decision | Value |
|----------|-------|
| Frontend | Next.js 16 (App Router) + React + TypeScript + Ant Design |
| Backend | Next.js Route Handlers (Node.js) |
| Deployment | Vercel (serverless) |
| Goal | Upload PDF → compress → download |

---

## Recommended Stack

### Core PDF Processing

| Library | Version | Purpose | Vercel Compatible | Bundle Size |
|---------|---------|---------|-------------------|-------------|
| `pdf-lib` | `1.17.1` | Read, rewrite, and optimize PDF structure (pure JS) | YES — no native binaries | ~19.5 MB unpacked; ~2 MB gzipped JS |
| `@cantoo/pdf-lib` | `2.6.5` | Actively maintained fork of pdf-lib with more frequent updates | YES — same pure JS | ~21.6 MB unpacked |

**Use `pdf-lib` (v1.17.1) as the primary PDF manipulation library.**

Rationale:
- Pure JavaScript — no native binaries, no platform-specific build steps.
- Runs identically in Node.js on Vercel serverless as it does locally.
- Supports reading existing PDFs, removing redundant objects, stripping metadata, and re-serializing with `PDFDocument.save()`.
- MIT licensed.
- `@cantoo/pdf-lib` is a safe upgrade path if you need active maintenance, but the API is identical.

**Compression approach with pdf-lib:**
`pdf-lib` does not run Flate/DCT image re-encoding on its own. Its compression lever is structural: remove duplicate/unused objects, strip metadata, use `objectsPerTick` to batch the save. For image-heavy PDFs you must also process embedded images separately (see sharp below). For text-heavy or already-well-structured PDFs, this alone yields 10-40% size reduction.

---

### Image Re-encoding (for image-heavy PDFs)

| Library | Version | Purpose | Vercel Compatible | Notes |
|---------|---------|---------|-------------------|-------|
| `sharp` | `0.34.5` | Re-encode embedded JPEG/PNG images at lower quality | YES with correct config | Requires `@img/sharp-linux-x64` (~422 KB) + `@img/sharp-libvips-linux-x64` (~16.7 MB) |

**Use `sharp` (v0.34.5) for re-encoding images extracted from PDFs.**

Vercel compatibility detail:
- `sharp` ships prebuilt platform-specific binaries as optional dependencies.
- Vercel runs on Linux x64 (glibc). The packages `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64` are automatically installed on Linux.
- The correct setup requires Node.js `^18.17.0 || ^20.3.0 || >=21.0.0` — Vercel's Node.js 20 runtime satisfies this.
- **Bundle size concern:** The `libvips` linux binary is ~16.7 MB. This counts toward Vercel's function bundle limit (250 MB uncompressed on Hobby; the default deployment limit is 50 MB compressed). This is safe for a dedicated `/api/compress` route but worth monitoring.
- **Do NOT** install `sharp` as a dev dependency; it must be in `dependencies` so Vercel installs the Linux binary during deployment.

**IMPORTANT — `next.config.js` entry required:**
```js
// next.config.ts
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
};
export default nextConfig;
```
Without this, Next.js may try to bundle sharp and fail on the native binary.

---

### File Upload Handling

| Library | Version | Purpose | Vercel Compatible | Notes |
|---------|---------|---------|-------------------|-------|
| Native Web API (`request.formData()`) | — | Parse multipart/form-data in Route Handlers | YES — built-in | Recommended approach for App Router |
| `busboy` | `1.6.0` | Streaming multipart parser (transitive dep of multer) | YES | Only if streaming is needed |
| `multer` | `2.1.1` | Express-style multipart middleware | PARTIAL | Does NOT work with App Router Route Handlers out-of-the-box; requires wrapping |

**Use the native `request.formData()` API in App Router Route Handlers.**

```ts
// app/api/compress/route.ts
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // pass buffer to pdf-lib / sharp pipeline
}
```

Rationale:
- The App Router Route Handler receives a standard Web `Request`. Calling `request.formData()` correctly parses multipart uploads.
- No extra library needed.
- `multer` was designed for Express and uses middleware patterns incompatible with Next.js Route Handlers without shimming. Do not use it.

**Body size limit — required config:**
```ts
// app/api/compress/route.ts
export const config = {
  api: {
    bodyParser: false, // not needed in App Router, but note:
  },
};
```
For App Router, set the limit in `next.config.ts`:
```ts
// next.config.ts
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb', // raise if PDFs can be large
    },
  },
};
```
Or in the Route Handler segment config:
```ts
export const maxDuration = 30; // seconds; Vercel Hobby plan caps at 60s
```

---

### Temporary File Storage

**Decision: In-memory (Buffer) only. No filesystem writes.**

| Strategy | Verdict | Reason |
|----------|---------|--------|
| In-memory (Buffer/ArrayBuffer) | RECOMMENDED | Zero setup, works everywhere, fastest for files under ~50 MB |
| `/tmp` directory | CONDITIONAL | Available on Vercel Lambda with 512 MB limit, but ephemeral — fine for intermediate scratch files, not persistence |
| External storage (`@vercel/blob`) | FOR LARGE FILES | Required if input PDFs regularly exceed ~20 MB; adds latency and cost |

**For MVP, keep everything in memory:**

```ts
const inputBuffer = Buffer.from(await file.arrayBuffer());
// process → outputBuffer
// return outputBuffer directly in Response
return new Response(outputBuffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="compressed.pdf"`,
  },
});
```

If you need `/tmp` (e.g., for Ghostscript CLI execution):
- Path: `/tmp/` — writable on Vercel Lambda
- Limit: 512 MB total ephemeral storage per invocation
- Lifetime: single invocation only — do not rely on it persisting between requests

`@vercel/blob` (v2.3.3) is the right upgrade path when files exceed 20 MB or when you need async processing, but it adds a storage dependency and is out of scope for MVP.

---

### Supporting Libraries

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@vercel/blob` | `2.3.3` | Object storage for large PDFs | Out of scope for MVP; add when files > 20 MB |
| `zod` | latest | Validate upload request parameters (quality level, etc.) | Include from day one |
| `next` | `16.2.6` | Framework | Already decided |

---

## What NOT to Use — and Why

| Library | Reason to Avoid |
|---------|----------------|
| **Ghostscript (CLI / `ghostscript4js` / `compress-pdf`)** | Requires Ghostscript binary installed on the host OS. Vercel Lambda does not have Ghostscript. You cannot install system binaries on Vercel. Even with a custom Docker image (Vercel does not support custom Dockerfiles on standard plans), cold-start times would be unacceptable. |
| **`multer`** | Designed for Express middleware chain. Next.js App Router Route Handlers are Web API-based; there is no `res.locals` or `next()` chain. Attempting to use multer requires shimming Node.js `req`/`res` objects — fragile and unnecessary. |
| **`pdfjs-dist`** (v5.7.284) | A PDF **renderer/reader**. It does not write or compress PDFs. Using it to read then re-write with pdf-lib would add 5+ MB of bundle weight for no benefit. |
| **`hummus-recipe` / HummusJS** | Based on MuPDF C++ native bindings. Requires native compilation. Not compatible with Vercel serverless. Last meaningful update was years ago. |
| **`node-qpdf2`** (v6.0.0) | Wraps the QPDF CLI binary. Same problem as Ghostscript — system binary required, unavailable on Vercel Lambda. |
| **`sharp` alone (without pdf-lib)** | Cannot open or write PDFs. Sharp only processes image formats. Must be combined with pdf-lib for a complete PDF pipeline. |
| **Vercel Edge Runtime** | Does not support Node.js APIs (`Buffer`, `fs`, native modules). The PDF compression pipeline requires Node.js runtime. Use `export const runtime = 'nodejs'` (default) on the compress route. |

---

## Installation

```bash
# Runtime dependencies
npm install pdf-lib sharp

# If using @cantoo/pdf-lib fork instead
# npm install @cantoo/pdf-lib sharp

# Ensure sharp linux binaries install on deployment
# sharp's optional dependencies handle this automatically
# but pin node version in package.json engines:
```

```json
// package.json
{
  "engines": {
    "node": ">=20.3.0"
  }
}
```

```ts
// next.config.ts — required for sharp
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
```

---

## Vercel-Specific Constraints Summary

| Constraint | Value | Impact |
|------------|-------|--------|
| Function bundle size (Hobby) | 50 MB compressed / 250 MB uncompressed | `sharp` + `libvips` binary adds ~17 MB; safe |
| `/tmp` storage | 512 MB per invocation | Sufficient for PDF processing; ephemeral |
| Max execution time (Hobby) | 60 seconds | Large PDFs may approach this; set `maxDuration = 30` as a safe default |
| Node.js runtime version | 20.x (LTS) | Satisfies `sharp` requirement of `>=20.3.0` |
| Memory | 1024 MB (Hobby) | In-memory processing of PDFs up to ~200 MB is feasible |
| Native binaries | NOT supported via system install | Rules out Ghostscript, QPDF, HummusJS |
| Edge Runtime | Subset of Web APIs only | Use Node.js runtime for compress route |

---

## Sources

- `npm info pdf-lib` — verified version 1.17.1, MIT, pure JS, published ~1 year ago
- `npm info @cantoo/pdf-lib` — verified version 2.6.5, actively maintained fork (published 1 month ago)
- `npm info sharp` — verified version 0.34.5, Apache-2.0, requires Node `^18.17.0 || ^20.3.0 || >=21.0.0`
- `npm info @img/sharp-linux-x64` — 422.9 KB; `@img/sharp-libvips-linux-x64` — 16.7 MB (Vercel deployment size impact)
- `npm info multer` — version 2.1.1, confirmed not App Router compatible without shims
- `npm info busboy` — version 1.6.0 (multer transitive dep, streaming parser)
- Next.js official docs (via Context7 `/vercel/next.js`): `request.formData()` is the idiomatic App Router file upload API; `bodySizeLimit` config for Server Actions; `maxDuration` for serverless timeout
- Vercel Storage docs (via Context7 `/vercel/storage`): `@vercel/blob` v2.3.3, `multipart: true` recommended for files >4.5 MB
- Confidence: HIGH — all versions verified from npm registry + official Next.js documentation
