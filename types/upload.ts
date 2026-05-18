export type UploadStage =
  | 'idle'
  | 'drag-over'
  | 'uploading'
  | 'upload-complete'
  | 'error'

export interface AppError {
  code: 'FILE_TYPE' | 'FILE_SIZE' | 'UPLOAD_FAILED' | 'NETWORK'
  message: string
  heading: string
}

export interface UploadState {
  stage: UploadStage
  file: File | null
  uploadProgress: number
  blobUrl: string | null
  error: AppError | null
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
