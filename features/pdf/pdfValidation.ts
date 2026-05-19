import { AppError } from '@/types/upload'

export function validateFileType(file: File): AppError | null {
  const isPdfMime = file.type === 'application/pdf' || file.type === 'application/octet-stream'
  // iOS Safari may return empty type for PDFs from iCloud Drive — fall back to extension check
  const isPdfExt = file.name.toLowerCase().endsWith('.pdf')
  if (isPdfMime || (file.type === '' && isPdfExt)) {
    return null
  }
  return {
    code: 'FILE_TYPE',
    heading: 'PDF files only',
    message: 'This file is not a PDF. Please select a .pdf file.',
  }
}

export function validateFileSize(file: File, maxMb = 100): AppError | null {
  if (file.size <= maxMb * 1024 * 1024) {
    return null
  }
  const fileMb = (file.size / 1024 / 1024).toFixed(1)
  return {
    code: 'FILE_SIZE',
    heading: 'File too large',
    message: `Maximum file size is ${maxMb} MB. Your file is ${fileMb} MB.`,
  }
}

export function formatFileSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
