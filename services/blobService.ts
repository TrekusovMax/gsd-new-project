import { del } from '@vercel/blob'

export async function deleteBlobSafe(url: string): Promise<void> {
  try {
    await del(url)
  } catch (err) {
    console.warn('Blob cleanup failed:', err)
  }
}
