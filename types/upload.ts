export type UploadStage =
  | 'idle'
  | 'drag-over'
  | 'uploading'
  | 'upload-complete'
  | 'compressing'
  | 'compress-complete'
  | 'error'

export type CompressionPreset = 'maximum' | 'balanced' | 'quality'

export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK' | 'COMPRESSION_FAILED' | 'ENCRYPTED_PDF'
  message: string
  heading: string
}

export interface UploadState {
  stage: UploadStage
  file: File | null
  uploadProgress: number
  blobUrl: string | null
  error: AppError | null
  preset: CompressionPreset
  compressedBlobUrl: string | null
  originalSize: number | null
  compressedSize: number | null
}

export type UploadAction =
  | { type: 'DRAG_ENTER' }
  | { type: 'DRAG_LEAVE' }
  | { type: 'DROP_VALID' }
  | { type: 'DROP_INVALID'; error: AppError }
  | { type: 'FILE_SELECTED'; file: File }
  | { type: 'PROGRESS'; percent: number }
  | { type: 'UPLOAD_DONE'; blobUrl: string; filename: string; size: number }
  | { type: 'UPLOAD_ERROR'; error: AppError }
  | { type: 'RESET' }
  | { type: 'ZONE_CLICK' }
  | { type: 'SET_PRESET'; preset: CompressionPreset }
  | { type: 'COMPRESS_START' }
  | { type: 'COMPRESS_DONE'; compressedBlobUrl: string; originalSize: number; compressedSize: number }
  | { type: 'COMPRESS_ERROR'; error: AppError }
