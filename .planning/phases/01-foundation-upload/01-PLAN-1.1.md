---
phase: 01-foundation-upload
plan: "1.1"
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - next.config.ts
  - app/layout.tsx
  - app/globals.css
  - app/page.tsx
  - components/AppHeader.tsx
  - types/upload.ts
  - .env.local.example
  - .gitignore
  - .prettierrc
autonomous: true
requirements:
  - INFRA-01
  - INFRA-03
  - UX-01
  - UX-02

must_haves:
  truths:
    - "Developer can run `npm run dev` and see a dark page (#0d0d0d background) with the sticky 'PDF Compressor' header in the browser"
    - "Ant Design dark theme applies globally — page background is #0d0d0d, container color is #1a1a2e, primary accent is #4f6ef7"
    - "Project directory layout matches D-08: app/, components/, features/pdf/, hooks/, services/, types/"
    - "Production build completes without TypeScript errors or warnings about deprecated config keys"
    - "Code is formatted consistently: Prettier passes on all .ts/.tsx files without modifications"
  artifacts:
    - path: "package.json"
      provides: "All Phase 1 dependencies at locked versions"
      contains: "next, @vercel/blob, antd, @ant-design/icons, zod"
    - path: "tsconfig.json"
      provides: "TypeScript strict mode config"
      contains: "\"strict\": true"
    - path: "next.config.ts"
      provides: "Next.js config with serverExternalPackages"
      contains: "serverExternalPackages"
    - path: "app/layout.tsx"
      provides: "ConfigProvider with darkAlgorithm and token overrides"
      exports: ["RootLayout"]
    - path: "types/upload.ts"
      provides: "UploadStage, UploadState, UploadAction, AppError type contracts"
      exports: ["UploadStage", "UploadState", "UploadAction", "AppError"]
    - path: "components/AppHeader.tsx"
      provides: "Sticky header with PDF Compressor title"
      exports: ["AppHeader"]
    - path: ".prettierrc"
      provides: "Prettier formatting config"
      contains: "singleQuote"
  key_links:
    - from: "app/layout.tsx"
      to: "antd ConfigProvider"
      via: "darkAlgorithm import"
      pattern: "darkAlgorithm"
    - from: "app/layout.tsx"
      to: "components/AppHeader.tsx"
      via: "import and render"
      pattern: "AppHeader"
---

## Phase Goal

**As a** developer, **I want to** have a working Next.js 16 project scaffold with Ant Design dark theme, strict TypeScript, and all type contracts defined, **so that** I can build upload UI and API routes in subsequent plans without renegotiating architecture.

<objective>
Initialize the Next.js 16 project with all Phase 1 dependencies, configure TypeScript strict mode and Ant Design dark theme globally, configure ESLint + Prettier, define all TypeScript type contracts for the upload state machine, and create the page skeleton with AppHeader.

Purpose: Establishes the walking skeleton — every subsequent plan builds on this scaffold without reinventing config or types.
Output: Runnable dev server with dark-themed page, all type definitions committed, Prettier configured, build passing.
</objective>

<execution_context>
@/js learn/GSD_Superpowers/.claude/get-shit-done/workflows/execute-plan.md
@/js learn/GSD_Superpowers/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@d:/js learn/GSD_Superpowers/.planning/PROJECT.md
@d:/js learn/GSD_Superpowers/.planning/ROADMAP.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md
@d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-UI-SPEC.md

<interfaces>
<!-- Type contracts defined in this plan — downstream plans implement against these. -->

From types/upload.ts (to be created in Task 2):
```typescript
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
  uploadProgress: number   // 0–100
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

From app/layout.tsx ConfigProvider token overrides (to be created in Task 1):
```typescript
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
  fontSize: 14,
  fontSizeHeading2: 28,
  fontSizeHeading4: 20,
  fontWeightStrong: 600,
  paddingXXS: 4,
  paddingXS: 8,
  padding: 16,
  paddingLG: 24,
  paddingXL: 32,
  borderRadius: 8,
  borderRadiusLG: 12,
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Initialize Next.js project, install dependencies, configure layout with dark theme, set up ESLint + Prettier</name>
  <files>
    package.json, tsconfig.json, next.config.ts, app/layout.tsx, app/globals.css, app/page.tsx, .env.local.example, .gitignore, .prettierrc
  </files>

  <read_first>
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md (Standard Stack section, Pattern 3: ConfigProvider, Pattern 4: next.config.ts, Open Questions #3)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-UI-SPEC.md (Design System section, Color section, Typography section, Spacing Scale section)
    - d:/js learn/GSD_Superpowers/CLAUDE.md (Critical Architecture Decisions, Stack section)
  </read_first>

  <action>
    Run scaffold command from the project root (d:/js learn/GSD_Superpowers):
    npx create-next-app@16.2.6 . --typescript --eslint --no-tailwind --no-src-dir --app --import-alias "@/*"

    Then install locked dependencies:
    npm install @vercel/blob@2.3.3 antd@6.4.2 @ant-design/icons@6.2.3 zod

    Install Prettier and ESLint integration (per CLAUDE.md "ESLint + Prettier"):
    npm install -D prettier eslint-config-prettier

    Create .prettierrc with content: {"semi": false, "singleQuote": true, "tabWidth": 2, "trailingComma": "es5"}

    Update .eslintrc.json (or eslint.config.mjs if generated by create-next-app) to add "prettier" at the end of the extends array. This disables ESLint rules that conflict with Prettier formatting. If the config uses flat config format (eslint.config.mjs), import eslint-config-prettier and spread it after the existing configs.

    Rewrite next.config.ts with single field: serverExternalPackages: ['sharp']. No other fields needed for Phase 1.

    Rewrite tsconfig.json to add "strict": true in compilerOptions if not already present. Confirm paths alias "@/*" maps to "./*".

    Create directory skeleton (per D-08): mkdir components features/pdf hooks services types (create placeholder .gitkeep only if needed to commit empty dirs — omit if git tracks them via files).

    Rewrite app/layout.tsx as a 'use client' component (required for Ant Design ConfigProvider SSR — see RESEARCH.md Pitfall 2). Import ConfigProvider and theme from 'antd'. Apply darkAlgorithm with the exact token overrides listed in the interfaces block above (colorBgBase, colorBgContainer, colorPrimary, colorSuccess, colorError, colorBorder, colorText, colorTextSecondary, fontFamily, fontSize 14, fontSizeHeading2 28, fontSizeHeading4 20, fontWeightStrong 600, all padding tokens, borderRadius 8, borderRadiusLG 12). Wrap html > body > ConfigProvider > {children}.

    Rewrite app/globals.css to minimal resets only: margin 0, padding 0 on *, box-sizing border-box, body background-color #0d0d0d. No Tailwind classes, no utility classes.

    Rewrite app/page.tsx as a Server Component (no 'use client'). Import AppHeader (to be created in Task 2). Render: header at top, main element centered with flex/center, upload card placeholder div (max-width 600px, width 100%, background colorBgContainer via inline style).

    Create .env.local.example with single entry: BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here

    Ensure .gitignore includes: .env.local, .env*.local, node_modules, .next
  </action>

  <verify>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx tsc --noEmit 2>&1 | head -20
    </automated>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npm run build 2>&1 | tail -10
    </automated>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx prettier --check "**/*.{ts,tsx}" 2>&1 | tail -5
    </automated>
  </verify>

  <acceptance_criteria>
    - package.json contains "next": "16.2.6" (or ^16.2.6), "@vercel/blob": "2.3.3", "antd": "6.4.2", "@ant-design/icons": "6.2.3", "zod" entries
    - package.json devDependencies contains "prettier" and "eslint-config-prettier"
    - .prettierrc exists with singleQuote: true, semi: false, tabWidth: 2
    - ESLint config extends array includes "prettier" as the last entry
    - tsconfig.json contains "strict": true under compilerOptions
    - next.config.ts contains serverExternalPackages (NOT serverComponentsExternalPackages)
    - app/layout.tsx contains 'use client' directive on line 1
    - app/layout.tsx contains darkAlgorithm and colorBgBase: '#141414'
    - app/globals.css does NOT contain any Tailwind @apply or utility classes
    - npm run build exits with code 0 (no TypeScript errors, no missing imports)
    - npx prettier --check "**/*.{ts,tsx}" exits 0 (all files formatted)
    - .env.local is NOT committed (in .gitignore)
    - Directory structure exists: components/, features/pdf/, hooks/, services/, types/
  </acceptance_criteria>

  <done>
    Next.js 16 project scaffold is installed, all Phase 1 dependencies are at locked versions, Ant Design dark theme is configured globally in layout.tsx, ESLint + Prettier are configured and passing, build passes with zero errors, and directory skeleton matches D-08.
  </done>
</task>

<task type="auto">
  <name>Task 2: Define TypeScript type contracts and create AppHeader component</name>
  <files>
    types/upload.ts, components/AppHeader.tsx
  </files>

  <read_first>
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-RESEARCH.md (Pattern 2: useReducer State Machine — exact type definitions)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-UI-SPEC.md (Component Specs section 4: Header, Typography section, Color section)
    - d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-CONTEXT.md (D-01: no navigation, D-08: directory structure)
  </read_first>

  <action>
    Create types/upload.ts exporting the exact type definitions shown in the interfaces block of this plan's context section:
    - UploadStage union type with all 5 stages: 'idle' | 'drag-over' | 'uploading' | 'upload-complete' | 'error'
    - AppError interface with code union 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK', message: string, heading: string
    - UploadState interface with stage, file (File | null), uploadProgress (number, 0–100), blobUrl (string | null), error (AppError | null)
    - UploadAction discriminated union with all 10 action types: DRAG_ENTER, DRAG_LEAVE, DROP_VALID, DROP_INVALID (with error), FILE_SELECTED (with file), PROGRESS (with percent), UPLOAD_DONE (with blobUrl, filename, size), UPLOAD_ERROR (with error), RESET, ZONE_CLICK

    All exports are named exports (no default). No implementation code in this file — types only.

    Create components/AppHeader.tsx as a 'use client' component. Import Typography from 'antd'. Render a semantic <header> element with:
    - height 56px (mobile: 48px via CSS), padding 0 24px, display flex, align-items center
    - background-color #1a1a2e (colorBgContainer), border-bottom 1px solid #303050
    - position sticky, top 0, z-index 100
    - Single <h1> child: text "PDF Compressor", font-size 28px (mobile: 24px), font-weight 600, color #e8e8f0, margin 0

    Use inline styles or CSS Module (components/AppHeader.module.css) — no Tailwind. No navigation items, no icons per D-01.

    Export as named export: export function AppHeader().
  </action>

  <verify>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx tsc --noEmit 2>&1 | head -20
    </automated>
    <automated>
      cd "d:/js learn/GSD_Superpowers" && npx prettier --check "**/*.{ts,tsx}" 2>&1 | tail -5
    </automated>
  </verify>

  <acceptance_criteria>
    - types/upload.ts exports UploadStage, AppError, UploadState, UploadAction as named exports
    - UploadStage has exactly 5 members: 'idle', 'drag-over', 'uploading', 'upload-complete', 'error'
    - AppError.code union has exactly 4 members: 'FILE_TYPE', 'FILE_SIZE', 'UPLOAD_FAILED', 'NETWORK'
    - UploadAction has exactly 10 discriminated union members (verify by counting | separators = 9, so 10 members)
    - components/AppHeader.tsx renders <header> with position: sticky and "PDF Compressor" text
    - components/AppHeader.tsx does NOT import or use any navigation components
    - npx tsc --noEmit exits 0 after both files created
    - npx prettier --check "**/*.{ts,tsx}" exits 0
  </acceptance_criteria>

  <done>
    All upload state machine type contracts are defined in types/upload.ts. AppHeader renders correctly with sticky positioning, correct typography, no nav items. TypeScript reports zero errors. Prettier passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /api/upload | Token handshake request; file bytes never cross this boundary in Phase 1 |
| browser → Vercel Blob CDN | Direct PUT using short-lived token; token scoped to single upload |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-01-01 | Spoofing | BLOB_READ_WRITE_TOKEN in env | High | mitigate | Token stored only in server-side env var (no NEXT_PUBLIC_ prefix); .env.local in .gitignore; .env.local.example has placeholder only |
| T-01-02 | Information Disclosure | .env.local committed to git | High | mitigate | .gitignore must include .env.local and .env*.local entries — verified in Task 1 acceptance criteria |
| T-01-03 | Tampering | package.json dependency versions | Medium | mitigate | Exact versions pinned in package.json (next@16.2.6, @vercel/blob@2.3.3, antd@6.4.2); no ^ ranges on critical deps |
| T-01-04 | Denial of Service | Client-side rendering crash | Low | accept | Error boundary added in PLAN-1.2 around upload card; scaffold phase has no user-controlled inputs |
</threat_model>

<verification>
After both tasks complete:

1. npm run dev starts without errors — browser shows dark page (#0d0d0d background) with "PDF Compressor" sticky header
2. npx tsc --noEmit exits 0 — zero TypeScript errors
3. npm run build exits 0 — production build succeeds
4. npx prettier --check "**/*.{ts,tsx}" exits 0 — all files formatted
5. cat types/upload.ts | grep "export type UploadStage" returns a match
6. cat components/AppHeader.tsx | grep "PDF Compressor" returns a match
7. cat .gitignore | grep ".env.local" returns a match
8. cat tsconfig.json | grep '"strict": true' returns a match
9. cat next.config.ts | grep "serverExternalPackages" returns a match (NOT serverComponentsExternalPackages)
10. cat .prettierrc | grep "singleQuote" returns a match
</verification>

<success_criteria>
- Dark-themed page renders at http://localhost:3000 with sticky "PDF Compressor" header
- TypeScript strict mode enforced: tsc --noEmit exits 0
- next build exits 0 with no errors or warnings about deprecated config keys
- All Phase 1 type contracts exist in types/upload.ts and are importable
- Project directory structure matches D-08 exactly
- BLOB_READ_WRITE_TOKEN is never in a committed file
- Prettier passes on all .ts/.tsx files: npx prettier --check "**/*.{ts,tsx}" exits 0
</success_criteria>

<output>
After completion, create d:/js learn/GSD_Superpowers/.planning/phases/01-foundation-upload/01-1.1-SUMMARY.md
</output>
