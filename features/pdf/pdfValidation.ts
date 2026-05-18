import { AppError } from '@/types/upload'

export function validateFileType(file: File): AppError | null {
  if (file.type === 'application/pdf') {
    return null
  }
  return {
    code: 'FILE_TYPE',
    heading: 'PDF files only',
    message: 'This file is not a PDF. Please select a .pdf file.',
  }
}

export function validateFileSize(file: File, maxMb = 20): AppError | null {
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
