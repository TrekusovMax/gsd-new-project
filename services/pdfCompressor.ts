import * as mupdf from 'mupdf'
import sharp from 'sharp'
import { CompressionPreset } from '@/types/upload'

interface PresetConfig {
  jpegQuality: number
  maxDimension: number
}

const PRESETS: Record<CompressionPreset, PresetConfig> = {
  maximum: { jpegQuality: 40, maxDimension: 1200 },
  balanced: { jpegQuality: 65, maxDimension: 2000 },
  quality:  { jpegQuality: 85, maxDimension: 3000 },
}

async function reencodeImage(
  pdfDoc: mupdf.PDFDocument,
  xobjRef: mupdf.PDFObject,
  config: PresetConfig,
): Promise<void> {
  try {
    const xobjDict = xobjRef.resolve()

    if (!xobjDict.get('Subtype').isName() || xobjDict.get('Subtype').asName() !== 'Image') return

    // Skip 1-bit image masks
    const imageMask = xobjDict.get('ImageMask')
    if (imageMask.isBoolean() && imageMask.asBoolean()) return

    // MuPDF decodes ALL image formats (JBIG2, CCITT, JPEG2000, raw, etc.)
    const image = pdfDoc.loadImage(xobjRef)
    let pixmap = image.toPixmap()

    // Normalize to DeviceRGB for JPEG encoding
    if (pixmap.getColorSpace() !== mupdf.ColorSpace.DeviceRGB) {
      pixmap = pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false)
    }

    const w = pixmap.getWidth()
    const h = pixmap.getHeight()
    const pixels = Buffer.from(pixmap.getPixels())

    let pipeline = sharp(pixels, { raw: { width: w, height: h, channels: 3 } })

    if (w > config.maxDimension || h > config.maxDimension) {
      pipeline = pipeline.resize(config.maxDimension, config.maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    const jpegBuffer = await pipeline.jpeg({ quality: config.jpegQuality, progressive: false }).toBuffer()
    const meta = await sharp(jpegBuffer).metadata()
    const newW = meta.width ?? w
    const newH = meta.height ?? h

    // writeRawStream must be called on the indirect reference
    xobjRef.writeRawStream(jpegBuffer)

    // Update image dict (resolved object allows direct dict mutations)
    xobjDict.put('Filter', 'DCTDecode')
    xobjDict.put('ColorSpace', 'DeviceRGB')
    xobjDict.put('Width', newW)
    xobjDict.put('Height', newH)
    xobjDict.put('BitsPerComponent', 8)
    xobjDict.delete('DecodeParms')
  } catch {
    // Skip any image that fails to decode or re-encode
  }
}

export async function compressPdf(inputBuffer: Buffer, preset: CompressionPreset): Promise<Buffer> {
  const config = PRESETS[preset]
  const doc = mupdf.Document.openDocument(inputBuffer, 'application/pdf') as mupdf.PDFDocument

  const processedNums = new Set<number>()
  const tasks: mupdf.PDFObject[] = []

  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as mupdf.PDFPage
    const resources = page.getObject().getInheritable('Resources')
    if (!resources.isDictionary()) continue

    const xobjects = resources.get('XObject')
    if (!xobjects.isDictionary()) continue

    xobjects.forEach((xobjRef: mupdf.PDFObject) => {
      if (!xobjRef.isIndirect()) return
      const num = xobjRef.asIndirect()
      if (processedNums.has(num)) return
      processedNums.add(num)
      tasks.push(xobjRef)
    })
  }

  await Promise.all(tasks.map(ref => reencodeImage(doc, ref, config)))

  const result = doc.saveToBuffer('garbage=4,compress,compress-fonts')
  return Buffer.from(result.asUint8Array())
}
