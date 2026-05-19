export const runtime = 'nodejs'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { head, del } from '@vercel/blob'
import { z } from 'zod'

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
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { blobUrl, compressedBlobUrl, filename } = result.data

  const safeName = filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const downloadFilename = `${safeName}-compressed.pdf`

  let blobMeta: Awaited<ReturnType<typeof head>>
  try {
    blobMeta = await head(compressedBlobUrl)
  } catch {
    return NextResponse.json({ error: 'File not found or expired' }, { status: 404 })
  }
  if (!blobMeta) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const fileResponse = await fetch(blobMeta.downloadUrl)
  if (!fileResponse.ok || !fileResponse.body) {
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 })
  }

  const response = new Response(fileResponse.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadFilename}"`,
      'Content-Length': String(blobMeta.size),
      'Cache-Control': 'no-store',
    },
  })

  void del([compressedBlobUrl, blobUrl]).catch((err: unknown) => {
    console.warn('[/api/download] blob cleanup failed:', err)
  })

  return response
}
