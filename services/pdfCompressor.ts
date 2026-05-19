import * as mupdf from 'mupdf'
import { CompressionPreset } from '@/types/upload'

const PRESET_OPTIONS: Record<CompressionPreset, string> = {
  maximum: 'garbage=3,compress,compress-images,compress-effort=100',
  balanced: 'garbage=2,compress,compress-images,compress-effort=60',
  quality:  'garbage=1,compress,compress-effort=20',
}

export async function compressPdf(inputBuffer: Buffer, preset: CompressionPreset): Promise<Buffer> {
  const doc = mupdf.Document.openDocument(inputBuffer, 'application/pdf')
  const pdfDoc = doc as mupdf.PDFDocument
  const result = pdfDoc.saveToBuffer(PRESET_OPTIONS[preset])
  return Buffer.from(result.asUint8Array())
}
