import * as mupdf from 'mupdf'
import { CompressionPreset } from '@/types/upload'

interface PresetConfig {
  dpi: number
  jpegQuality: number
}

const PRESETS: Record<CompressionPreset, PresetConfig> = {
  maximum: { dpi: 72,  jpegQuality: 25 },
  balanced: { dpi: 110, jpegQuality: 55 },
  quality:  { dpi: 150, jpegQuality: 82 },
}

export async function compressPdf(inputBuffer: Buffer, preset: CompressionPreset): Promise<Buffer> {
  const { dpi, jpegQuality } = PRESETS[preset]
  const scale = dpi / 72

  const srcDoc = mupdf.Document.openDocument(inputBuffer, 'application/pdf') as mupdf.PDFDocument
  const newDoc = new mupdf.PDFDocument()

  const pageCount = srcDoc.countPages()

  for (let i = 0; i < pageCount; i++) {
    const page = srcDoc.loadPage(i)
    const [x0, y0, x1, y1] = page.getBounds() as [number, number, number, number]
    const pageW = x1 - x0
    const pageH = y1 - y0

    // Render page at target DPI (MuPDF applies rotation/transforms automatically)
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
    const jpegBytes = pixmap.asJPEG(jpegQuality, false)
    pixmap.destroy()

    // Add image XObject to new doc and free WASM reference immediately
    const image = new mupdf.Image(jpegBytes)
    const imgRef = newDoc.addImage(image)
    image.destroy()

    // Content stream: scale image to fill page mediabox
    const contents = `q ${pageW} 0 0 ${pageH} ${x0} ${y0} cm /Im0 Do Q`

    // Resources dict
    const xobjects = newDoc.newDictionary()
    xobjects.put('Im0', imgRef)
    const resources = newDoc.newDictionary()
    resources.put('XObject', xobjects)

    const pageObj = newDoc.addPage([x0, y0, x1, y1], 0, resources, contents)
    newDoc.insertPage(-1, pageObj)
  }

  const result = newDoc.saveToBuffer('garbage=1,compress')
  return Buffer.from(result.asUint8Array())
}
