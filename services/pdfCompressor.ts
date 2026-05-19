import { PDFDocument, PDFRawStream, PDFName, PDFNumber } from 'pdf-lib'
import sharp from 'sharp'
import { CompressionPreset } from '@/types/upload'

interface PresetConfig {
  jpegQuality: number
  maxWidth: number
  maxHeight: number
  convertPngToJpeg: boolean
}

const PRESET_CONFIG: Record<CompressionPreset, PresetConfig> = {
  maximum: { jpegQuality: 40, maxWidth: 1024, maxHeight: 1024, convertPngToJpeg: true },
  balanced: { jpegQuality: 65, maxWidth: 1600, maxHeight: 1600, convertPngToJpeg: false },
  quality: { jpegQuality: 85, maxWidth: 2400, maxHeight: 2400, convertPngToJpeg: false },
}

export async function compressPdf(inputBuffer: Buffer, preset: CompressionPreset): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: false })

  const { jpegQuality, maxWidth, maxHeight, convertPngToJpeg } = PRESET_CONFIG[preset]
  const context = pdfDoc.context

  try {
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue

      const subtypeEntry = obj.dict.get(PDFName.of('Subtype'))
      if (!subtypeEntry || subtypeEntry.toString() !== '/Image') continue

      const filterEntry = obj.dict.get(PDFName.of('Filter'))
      if (!filterEntry) continue
      const filterStr = filterEntry.toString()

      if (filterStr.includes('CCITTFaxDecode') || filterStr.includes('JBIG2Decode')) continue

      const isJpeg = filterStr.includes('DCTDecode')
      const isPng = !isJpeg && filterStr.includes('FlateDecode')
      if (!isJpeg && !isPng) continue

      try {
        const widthEntry = obj.dict.get(PDFName.of('Width'))
        const heightEntry = obj.dict.get(PDFName.of('Height'))
        const imgWidth = widthEntry instanceof PDFNumber ? widthEntry.asNumber() : 0
        const imgHeight = heightEntry instanceof PDFNumber ? heightEntry.asNumber() : 0

        let pipeline = sharp(Buffer.from(obj.contents))

        if (imgWidth > maxWidth || imgHeight > maxHeight) {
          pipeline = pipeline.resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
        }

        let newImageBytes: Buffer
        let newFilter: string

        if (isJpeg || convertPngToJpeg) {
          newImageBytes = await pipeline.jpeg({ quality: jpegQuality, progressive: false }).toBuffer()
          newFilter = 'DCTDecode'
        } else {
          newImageBytes = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
          newFilter = 'FlateDecode'
        }

        if (newImageBytes.length >= obj.contents.length) continue

        const metadata = await sharp(newImageBytes).metadata()
        const newWidth = metadata.width ?? imgWidth
        const newHeight = metadata.height ?? imgHeight

        const colorSpace = (isJpeg || convertPngToJpeg)
          ? 'DeviceRGB'
          : (obj.dict.get(PDFName.of('ColorSpace'))?.toString() ?? 'DeviceRGB')

        const newStreamDict = {
          Type: 'XObject',
          Subtype: 'Image',
          Width: newWidth,
          Height: newHeight,
          ColorSpace: colorSpace,
          BitsPerComponent: 8,
          Filter: PDFName.of(newFilter),
          Length: newImageBytes.length,
        }

        context.assign(ref, context.stream(newImageBytes, newStreamDict))
      } catch {
        continue
      }
    }
  } catch {
    // Pass 1 failed entirely — proceed to Pass 2 with original pdfDoc
  }

  const compressedBytes = await pdfDoc.save({ useObjectStreams: true, updateFieldAppearances: false })
  return Buffer.from(compressedBytes)
}
