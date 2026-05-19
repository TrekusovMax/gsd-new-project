'use client'

import { useReducer, useRef, useCallback } from 'react'
import { upload } from '@vercel/blob/client'
import { UploadState, UploadAction, AppError, CompressionPreset } from '@/types/upload'
import { validateFileType, validateFileSize } from './pdfValidation'

const initialState: UploadState = {
  stage: 'idle',
  file: null,
  uploadProgress: 0,
  blobUrl: null,
  error: null,
  preset: 'balanced',
  compressedBlobUrl: null,
  originalSize: null,
  compressedSize: null,
}

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'DRAG_ENTER':
      return { ...state, stage: 'drag-over', error: null }

    case 'DRAG_LEAVE':
      return { ...state, stage: 'idle' }

    case 'DROP_VALID':
      return { ...state, stage: 'uploading', error: null }

    case 'DROP_INVALID':
      return { ...state, stage: 'error', error: action.error }

    case 'FILE_SELECTED':
      return { ...state, stage: 'uploading', file: action.file, uploadProgress: 0, error: null }

    case 'PROGRESS':
      return { ...state, stage: 'uploading', uploadProgress: action.percent }

    case 'UPLOAD_DONE':
      return { ...state, stage: 'upload-complete', blobUrl: action.blobUrl, uploadProgress: 100 }

    case 'UPLOAD_ERROR':
      return { ...state, stage: 'error', error: action.error, uploadProgress: 0 }

    case 'RESET':
      return { ...initialState }

    case 'ZONE_CLICK':
      return { ...state, stage: 'idle', error: null }

    case 'SET_PRESET':
      return { ...state, preset: action.preset }

    case 'COMPRESS_START':
      return { ...state, stage: 'compressing', error: null }

    case 'COMPRESS_DONE':
      return {
        ...state,
        stage: 'compress-complete',
        compressedBlobUrl: action.compressedBlobUrl,
        originalSize: action.originalSize,
        compressedSize: action.compressedSize,
      }

    case 'COMPRESS_ERROR':
      return { ...state, stage: 'error', error: action.error }

    default: {
      const _exhaustive: never = action
      return state
    }
  }
}

export function usePdfUpload() {
  const [state, dispatch] = useReducer(uploadReducer, initialState)
  const dragEnterCount = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      const typeError = validateFileType(file)
      if (typeError) {
        dispatch({ type: 'DROP_INVALID', error: typeError })
        return
      }

      const sizeError = validateFileSize(file)
      if (sizeError) {
        dispatch({ type: 'DROP_INVALID', error: sizeError })
        return
      }

      dispatch({ type: 'FILE_SELECTED', file })

      try {
        const blob = await upload(file.name, file, {
          access: 'private',
          handleUploadUrl: '/api/upload',
          onUploadProgress: ({ percentage }: { percentage: number }) => {
            dispatch({ type: 'PROGRESS', percent: percentage })
          },
        })

        dispatch({
          type: 'UPLOAD_DONE',
          blobUrl: blob.url,
          filename: file.name,
          size: file.size,
        })
      } catch {
        const networkError: AppError = {
          code: 'NETWORK',
          heading: 'Upload failed',
          message: 'Something went wrong. Please try again.',
        }
        dispatch({ type: 'UPLOAD_ERROR', error: networkError })
      }
    },
    []
  )

  const handleDragEnter = useCallback(() => {
    dragEnterCount.current += 1
    if (dragEnterCount.current === 1) {
      dispatch({ type: 'DRAG_ENTER' })
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    dragEnterCount.current -= 1
    if (dragEnterCount.current === 0) {
      dispatch({ type: 'DRAG_LEAVE' })
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragEnterCount.current = 0
      const file = e.dataTransfer.files[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile]
  )

  const handleZoneClick = useCallback(() => {
    dispatch({ type: 'ZONE_CLICK' })
    fileInputRef.current?.click()
  }, [])

  const handleReset = useCallback(() => {
    if (state.blobUrl) {
      fetch('/api/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: state.blobUrl,
          ...(state.compressedBlobUrl ? { compressedUrl: state.compressedBlobUrl } : {}),
        }),
      }).catch(() => {})
    }
    dispatch({ type: 'RESET' })
  }, [state.blobUrl, state.compressedBlobUrl])

  const handleCompress = useCallback(async () => {
    if (!state.blobUrl || !state.file) return

    dispatch({ type: 'COMPRESS_START' })

    try {
      const response = await fetch('/api/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: state.blobUrl,
          preset: state.preset,
          filename: state.file.name,
        }),
      })

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => ({}))
        const errorCode = (data as Record<string, unknown>).error
        const isEncrypted = errorCode === 'ENCRYPTED_PDF'
        dispatch({
          type: 'COMPRESS_ERROR',
          error: {
            code: isEncrypted ? 'ENCRYPTED_PDF' : 'COMPRESSION_FAILED',
            heading: isEncrypted ? 'Password-protected PDF' : 'Compression failed',
            message: isEncrypted
              ? 'This PDF is password-protected. Remove the password and try again.'
              : 'Something went wrong during compression. Please try again.',
          },
        })
        return
      }

      const data = await response.json() as {
        compressedBlobUrl: string
        originalSize: number
        compressedSize: number
      }
      dispatch({ type: 'COMPRESS_DONE', ...data })
    } catch {
      dispatch({
        type: 'COMPRESS_ERROR',
        error: {
          code: 'COMPRESSION_FAILED',
          heading: 'Compression failed',
          message: 'Network error. Check your connection and try again.',
        },
      })
    }
  }, [state.blobUrl, state.file, state.preset])

  const handleDownload = useCallback(async () => {
    if (!state.compressedBlobUrl || !state.blobUrl || !state.file) return

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: state.blobUrl,
          compressedBlobUrl: state.compressedBlobUrl,
          filename: state.file.name,
        }),
      })

      if (!response.ok) return

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${state.file.name.replace(/\.pdf$/i, '')}-compressed.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Silent fail — user already sees the download button and can retry
    }
  }, [state.compressedBlobUrl, state.blobUrl, state.file])

  const handleRetry = useCallback(() => {
    handleCompress()
  }, [handleCompress])

  const handleSetPreset = useCallback((preset: CompressionPreset) => {
    dispatch({ type: 'SET_PRESET', preset })
  }, [])

  return {
    state,
    handleFile,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleZoneClick,
    handleReset,
    handleCompress,
    handleDownload,
    handleRetry,
    handleSetPreset,
    fileInputRef,
  }
}
