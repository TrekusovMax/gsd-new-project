'use client'

import { useReducer, useRef, useCallback } from 'react'
import { upload } from '@vercel/blob/client'
import { UploadState, UploadAction, AppError } from '@/types/upload'
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
        body: JSON.stringify({ url: state.blobUrl }),
      }).catch(() => {})
    }
    dispatch({ type: 'RESET' })
  }, [state.blobUrl])

  return {
    state,
    handleFile,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleZoneClick,
    handleReset,
    fileInputRef,
  }
}
