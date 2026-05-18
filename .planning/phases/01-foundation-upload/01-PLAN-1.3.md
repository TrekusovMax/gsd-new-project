---
phase: 01-foundation-upload
plan: "1.3"
type: execute
wave: 2
depends_on: ["1.1"]
files_modified:
  - app/api/upload/route.ts
  - services/blobService.ts
  - app/api/cleanup/route.ts
  - vercel.json
autonomous: false
requirements:
  - INFRA-01
  - INFRA-02
  - INFRA-03

user_setup:
  - service: vercel-blob
    why: "Vercel Blob store must exist before /api/upload can generate upload tokens"
    env_vars:
      - name: BLOB_READ_WRITE_TOKEN
        source: "Vercel Dashboard → Storage → your Blob store → .env.local tab → copy token"
    dashboard_config:
      - task: "Create a Blob store"
        location: "Vercel Dashboard → Storage → Create Database → Blob"
      - task: "Pull env to local"
        location: "Run: vercel env pull .env.local (or manually copy BLOB_READ_WRITE_TOKEN to .env.local)"
  - service: vercel-deploy
    why: "INFRA-03 requires app deployed and reachable on Vercel preview URL"
    env_vars: []
    dashboard_config:
      - task: "Link project to Vercel"
        location: "Run: vercel link (in project root)"
      - task: "Deploy preview"
        location: "Run: vercel deploy (creates preview URL) OR push to GitHub branch if GitHub integration is connected"

must_haves:
  truths:
    - "POST /api/upload returns 200 with a valid Vercel Blob upload token"
    - "POST /api/upload rejects non-PDF content types with 400"
    - "POST /api/upload rejects files > 20 MB with 400"
    - "POST /api/cleanup deletes a blob by URL without crashing if URL is already deleted"
    - "App is deployed to Vercel and reachable at a preview URL"
    - "Full upload flow works end-to-end: browser → /api/upload token → Vercel Blob CDN → file visible in Vercel Dashboard"
    - "INFRA-02 partial coverage: on-reset del() only. Post-download cleanup in Phase 2."
  artifacts:
    - path: "app/api/upload/route.ts"
      provides: "Vercel Blob client-upload token handshake"
      exports: ["POST"]
    - path: "services/blobService.ts"
      provides: "deleteBlobSafe wrapper around del()"
      exports: ["deleteBlobSafe"]
    - path: "app/api/cleanup/route.ts"
      provides: "Server-side blob deletion endpoint"
      exports: ["POST"]
  key_links:
    - from: "features/pdf/usePdfUpload.ts"
      to: "app/api/upload/route.ts"
      via: "handleUploadUrl: '/api/upload' in upload() call"
      pattern: "handleUploadUrl"
    - from: "app/api/upload/route.ts"
      to: "@vercel/blob/client handleUpload()"
      via: "import and call"
      pattern: "handleUpload"
    - from: "app/api/cleanup/route.ts"
      to: "services/blobService.ts deleteBlobSafe()"
      via: "import and call"
      pattern: "deleteBlobSafe"
---

<objective>
Implement /api/upload (Vercel Blob client-upload token handshake), /api/cleanup (safe blob deletion), services/blobService.ts, and deploy to Vercel. This plan makes the upload flow functional end-to-end and satisfies INFRA-01, INFRA-02, INFRA-03.

Purpose: Without the API route, usePdfUpload's upload() call has no handleUploadUrl to POST to — the UI from PLAN-1.2 is non-functional. This plan makes it real.
Output: Working /api/upload endpoint, safe cleanup endpoint, deployed Vercel preview with BLOB_READ_WRITE_TOKEN set.
</objective>

<execution_context>
@/js learn/GSD_Superpowers/.claude/get-shit-done/workflows/execute-plan.md
@/js learn/GSD_Superpowers/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-1.1-SUMMARY.md

<interfaces>
<!-- Vercel Blob SDK server-side functions used in this plan -->

```typescript
// @vercel/blob/client — server-side
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// handleUpload signature:
handleUpload({
  body: HandleUploadBody,
  request: Request,
  onBeforeGenerateToken: async (pathname: string) => ({
    allowedContentTypes: string[],
    maximumSizeInBytes: number,
    addRandomSuffix: boolean,
  }),
  onUploadCompleted: async ({ blob: { url: string } }) => void,
}): Promise<object>  // returns JSON to send back to client

// @vercel/blob — server-side only
import { del } from '@vercel/blob'
del(url: string): Promise<void>
// Note: del() does NOT throw if URL is already deleted (safe to call multiple times)
```

From app/api/upload/route.ts (to be created):
POST /api/upload — accepts HandleUploadBody JSON, returns JSON token for browser upload() SDK
No runtime override needed on upload route (default nodejs runtime handles this)

From app/api/cleanup/route.ts (to be created):
POST /api/cleanup — body: { url: string }, calls deleteBlobSafe(url), returns { ok: true }

Note: /api/compress will be created in Phase 2 — not part of this plan.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement /api/upload token handshake and /api/cleanup endpoint</name>
  <files>
    app/api/upload/route.ts, services/blobService.ts, app/api/cleanup/route.ts
  </files>

  <read_first>
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md (Pattern 1: Vercel Blob Client-Upload full code example, Code Examples section for /api/upload/route.ts, del() cleanup example, Common Pitfalls #1 — onUploadCompleted local dev, Pitfall #5 — BLOB_READ_WRITE_TOKEN local dev)
    - d:/js learn/GSD_Superpowers/CLAUDE.md (Critical Architecture Decisions #1, #4: separate routes)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md (code_context section: /api/upload is token handshake only)
  </read_first>

  <action>
    Create app/api/upload/route.ts implementing the POST handler for Vercel Blob client-upload token handshake. Import handleUpload and HandleUploadBody from '@vercel/blob/client'. Import NextResponse from 'next/server'. No 'export const runtime' override needed on this route (default nodejs handles it).

    The POST handler: parse request body as HandleUploadBody via request.json(). Call handleUpload with body, request, onBeforeGenerateToken returning { allowedContentTypes: ['application/pdf'], maximumSizeInBytes: 20 * 1024 * 1024, addRandomSuffix: true }. In onUploadCompleted: only console.log('Upload complete:', blob.url) — no business logic (per RESEARCH.md Pitfall 1: callback doesn't work locally). Wrap in try/catch: success → NextResponse.json(jsonResponse), error → NextResponse.json({ error: (error as Error).message }, { status: 400 }).

    CRITICAL: This route accepts ONLY the token handshake JSON body (tiny, ~100 bytes). It does NOT accept file bytes. If file bytes were sent here, the 4.5 MB Vercel body limit would be hit. The upload() SDK call in usePdfUpload.ts sends file bytes directly to Vercel Blob CDN, not to this route.

    Create services/blobService.ts. Import del from '@vercel/blob'. Export named function deleteBlobSafe(url: string): Promise<void> that calls await del(url) inside try/catch, logging warn on failure but not rethrowing. This is safe to call even if url is already deleted.

    Create app/api/cleanup/route.ts. Import NextResponse from 'next/server'. Import deleteBlobSafe from '@/services/blobService'. Import z from 'zod'. Define schema: z.object({ url: z.string().url() }). POST handler: parse body, validate with schema (return 400 on validation failure with { error: 'Invalid request body' }), call deleteBlobSafe(url), return NextResponse.json({ ok: true }).

    No CORS headers needed on these routes — same-origin requests from Next.js frontend.
  </action>

  <verify>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx tsc --noEmit 2>&1 | head -20
    </automated>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npm run build 2>&1 | tail -15
    </automated>
    <automated>
      Requires: npm run dev running on localhost:3000

      curl -X POST http://localhost:3000/api/cleanup -H "Content-Type: application/json" -d '{"url":"invalid"}' → expected HTTP 400

      curl -X POST http://localhost:3000/api/cleanup -H "Content-Type: application/json" -d '{"url":"https://blob.vercel-storage.com/test"}' → expected HTTP 200 or 404 (not 500)
    </automated>
  </verify>

  <acceptance_criteria>
    - app/api/upload/route.ts exports POST function
    - app/api/upload/route.ts imports from '@vercel/blob/client' (NOT '@vercel/blob')
    - app/api/upload/route.ts does NOT contain 'export const runtime' (no override needed for upload route)
    - app/api/upload/route.ts onBeforeGenerateToken returns allowedContentTypes: ['application/pdf'] and maximumSizeInBytes: 20971520 (20 * 1024 * 1024)
    - app/api/upload/route.ts does NOT accept or process file bytes — only HandleUploadBody JSON
    - services/blobService.ts exports deleteBlobSafe as named export
    - services/blobService.ts wraps del() in try/catch (cleanup failure must not throw)
    - app/api/cleanup/route.ts validates request body with zod z.string().url() on the url field
    - app/api/cleanup/route.ts returns 400 on invalid body
    - app/api/cleanup/route.ts returns { ok: true } on success (curl -X POST http://localhost:3000/api/cleanup -H "Content-Type: application/json" -d '{"url":"https://example.com/file.pdf"}' returns {"ok":true})
    - curl -X POST http://localhost:3000/api/cleanup -H "Content-Type: application/json" -d '{"url":"not-a-url"}' returns HTTP 400
    - npm run build exits 0
    - INFRA-02 scope: Phase 1 covers on-reset cleanup only via /api/cleanup. Post-download cleanup (INFRA-02 remainder) deferred to Phase 2 /api/download route.
  </acceptance_criteria>

  <done>
    - app/api/upload/route.ts is created and exports POST
    - onBeforeGenerateToken enforces allowedContentTypes: ['application/pdf'] and maximumSizeInBytes: 20971520
    - services/blobService.ts exports deleteBlobSafe with try/catch wrapping del()
    - app/api/cleanup/route.ts validates url with zod, returns 400 on invalid input, returns {"ok":true} on success
    - npx tsc --noEmit exits 0
    - npm run build exits 0
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Vercel Blob store setup and end-to-end upload verification</name>

  <what-built>
    API routes are implemented. This checkpoint verifies:
    1. BLOB_READ_WRITE_TOKEN is obtained and configured in .env.local
    2. Full upload flow works end-to-end: browser → /api/upload → Vercel Blob CDN → file visible in dashboard
    3. App deploys to Vercel (INFRA-03)
  </what-built>

  <how-to-verify>
    STEP 1 — Create Blob store and get token (if not done):
    - Go to Vercel Dashboard → Storage → Create Database → Blob
    - Name it (e.g. "pdf-compressor-blob")
    - Once created: click on the store → ".env.local" tab → copy the BLOB_READ_WRITE_TOKEN value
    - Add to d:/js learn/GSD_Superpowers/.env.local: BLOB_READ_WRITE_TOKEN=your_actual_token

    STEP 2 — Test local upload flow:
    - Run: npm run dev (in d:/js learn/GSD_Superpowers)
    - Open http://localhost:3000
    - Drop any real .pdf file onto the drop zone
    - Expected: progress bar appears and fills to 100%, then FileInfoCard appears with filename and size
    - Verify in Vercel Dashboard → Storage → your Blob store → Blobs tab: the uploaded file should appear

    STEP 3 — Test validation:
    - Drop a .jpg file → should see "PDF files only" inline error, no toast
    - Click zone → should open file picker

    STEP 4 — Deploy to Vercel (INFRA-03):
    - Run: vercel link (if not already linked)
    - Run: vercel env add BLOB_READ_WRITE_TOKEN (paste token when prompted) — adds it to Vercel project
    - Run: vercel deploy
    - Copy the preview URL from output
    - Visit preview URL and repeat the upload test from STEP 2

    STEP 5 — Confirm file in Blob:
    After successful upload on either local or preview: check Vercel Dashboard → Storage → Blobs tab. The uploaded PDF should appear.

    STEP 6 — Mobile UX check (UX-01):
    Open the app on iOS Safari (375px viewport) or Android Chrome.
    - Drop zone renders correctly at mobile width
    - Tapping the drop zone opens the file picker
    - Touch target for zone click is >= 44px (visually verify)
  </how-to-verify>

  <resume-signal>
    Type "approved" if:
    - Local upload works (file reaches Vercel Blob)
    - FileInfoCard displays correct filename and size
    - Vercel preview URL is accessible

    Or describe the specific error you're seeing so Claude can diagnose.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /api/upload | Untrusted JSON body (HandleUploadBody); file bytes never cross this boundary |
| /api/upload → Vercel Blob SDK | Server-to-SDK call using BLOB_READ_WRITE_TOKEN from env |
| client → /api/cleanup | Untrusted JSON body with blob URL to delete |
| server env → process.env | BLOB_READ_WRITE_TOKEN must never reach browser |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-03-01 | Spoofing | Malicious file type via content-type header | High | mitigate | onBeforeGenerateToken sets allowedContentTypes: ['application/pdf']; Vercel Blob SDK enforces this at CDN level — file with wrong content-type is rejected even if client lies about type |
| T-03-02 | Denial of Service | File size bypass (client skips validateFileSize) | High | mitigate | maximumSizeInBytes: 20971520 enforced in onBeforeGenerateToken — server-side hard limit regardless of client validation |
| T-03-03 | Information Disclosure | BLOB_READ_WRITE_TOKEN leaked to browser | High | mitigate | Token stored in process.env only (no NEXT_PUBLIC_ prefix); handleUpload() called server-side only; .env.local in .gitignore (enforced in PLAN-1.1) |
| T-03-04 | Elevation of Privilege | /api/cleanup deleting arbitrary blobs | Medium | accept | Single-user MVP — cross-user deletion risk is negligible in Phase 1. Phase 2 can add session-bound blobUrl validation if needed. |
| T-03-05 | Spoofing | Forged HandleUploadBody to generate tokens for non-PDF | High | mitigate | onBeforeGenerateToken enforces allowedContentTypes server-side; token is scoped to PDF only; CDN rejects upload if content-type mismatch |
| T-03-06 | Information Disclosure | onUploadCompleted callback URL exposure | Low | accept | In Phase 1, onUploadCompleted only console.log — no business logic, no sensitive data returned. Callback silently fails locally (RESEARCH.md Pitfall 1) — acceptable |
</threat_model>

<verification>
After Task 1 (automated) and Task 2 (human checkpoint):

1. npx tsc --noEmit exits 0
2. npm run build exits 0
3. curl -X POST http://localhost:3000/api/cleanup -H "Content-Type: application/json" -d '{"url":"not-a-url"}' returns 400
4. curl -X POST http://localhost:3000/api/cleanup -H "Content-Type: application/json" -d '{"url":"https://example.com/file.pdf"}' returns {"ok":true}
5. File dropped on http://localhost:3000 → reaches Vercel Blob → visible in Vercel Dashboard → Blobs
6. Vercel preview URL accessible and upload works there too
</verification>

<success_criteria>
- POST /api/upload returns token JSON for PDF content type requests
- POST /api/upload returns 400 for invalid requests
- POST /api/cleanup validates input with zod and calls deleteBlobSafe
- POST /api/cleanup returns {"ok":true} on valid input; returns 400 on invalid URL
- Full upload flow: browser → /api/upload token → Vercel Blob CDN → file visible in Vercel Dashboard (human verified)
- App is deployed on Vercel at a preview URL (INFRA-03)
- BLOB_READ_WRITE_TOKEN is set in Vercel project env vars (not just .env.local)
</success_criteria>

<output>
After completion, create d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-1.3-SUMMARY.md
</output>
