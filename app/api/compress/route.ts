import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { z } from 'zod'
import crypto from 'crypto'
import { compressPdf } from '@/services/pdfCompressor'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  if (!/\.blob\.vercel-storage\.com$/.test(new URL(blobUrl).hostname)) {
    return NextResponse.json({ error: 'Invalid blob URL' }, { status: 400 })
  }

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

  let compressedBuffer: Buffer
  try {
    compressedBuffer = await compressPdf(pdfBuffer, preset)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.toLowerCase().includes('encrypt') || message.toLowerCase().includes('password')) {
      return NextResponse.json(
        { error: 'ENCRYPTED_PDF', message: 'This PDF is password-protected and cannot be compressed.' },
        { status: 422 },
      )
    }
    console.error('[/api/compress] compression failed:', message)
    return NextResponse.json(
      { error: 'COMPRESSION_FAILED', message: 'Compression failed. The file may be corrupted.' },
      { status: 500 },
    )
  }

  const compressedSize = compressedBuffer.length

  const baseName = filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const uploadName = `compressed/${crypto.randomUUID()}-${baseName}-compressed.pdf`

  try {
    const uploaded = await put(uploadName, compressedBuffer, {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
    })
    return NextResponse.json({ compressedBlobUrl: uploaded.url, originalSize, compressedSize })
  } catch {
    return NextResponse.json({ error: 'Failed to store compressed file' }, { status: 500 })
  }
}
