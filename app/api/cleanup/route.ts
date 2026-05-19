import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteBlobSafe } from '@/services/blobService'

const schema = z.object({
  url: z.string().url(),
  compressedUrl: z.string().url().optional(),
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
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { url, compressedUrl } = result.data
  await deleteBlobSafe(url)
  if (compressedUrl) {
    await deleteBlobSafe(compressedUrl)
  }
  return NextResponse.json({ ok: true })
}
