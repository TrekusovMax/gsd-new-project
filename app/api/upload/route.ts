import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname) => ({
        // Include octet-stream for iOS Safari which sometimes reports PDF as binary
        allowedContentTypes: ['application/pdf', 'application/octet-stream'],
        maximumSizeInBytes: 100 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('Upload complete:', blob.url)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = (error as Error).message ?? 'Unknown error'
    console.error('[/api/upload] handleUpload failed:', message)
    // 400 for client errors (wrong type/size), 500 for server config errors (missing token)
    const status = message.toLowerCase().includes('token') ? 500 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
