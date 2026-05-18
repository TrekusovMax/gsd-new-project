'use client'

import React from 'react'
import {
  InboxOutlined,
  CloudUploadOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { UploadState } from '@/types/upload'
import { UploadProgress } from './UploadProgress'
import styles from './DropZone.module.css'

interface DropZoneProps {
  state: UploadState
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onZoneClick: () => void
  onFile: (file: File) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}

function getAriaLabel(state: UploadState): string {
  switch (state.stage) {
    case 'drag-over':
      return 'Release to upload your PDF'
    case 'uploading':
      return `Uploading PDF, ${state.uploadProgress}% complete`
    case 'error':
      return `Upload error: ${state.error?.message ?? 'Unknown error'}`
    default:
      return 'PDF upload area'
  }
}

function getZoneClass(stage: UploadState['stage']): string {
  switch (stage) {
    case 'drag-over':
      return `${styles.zone} ${styles.zoneDragOver}`
    case 'uploading':
      return `${styles.zone} ${styles.zoneUploading}`
    case 'error':
      return `${styles.zone} ${styles.zoneError}`
    default:
      return `${styles.zone} ${styles.zoneIdle}`
  }
}

export function DropZone({
  state,
  onDragEnter,
  onDragLeave,
  onDrop,
  onZoneClick,
  onFile,
  fileInputRef,
}: DropZoneProps) {
  const ariaLive =
    state.stage === 'uploading'
      ? 'polite'
      : state.stage === 'error'
        ? 'assertive'
        : undefined

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onFile(file)
    }
    e.target.value = ''
  }

  return (
    <div
      role="region"
      aria-label={getAriaLabel(state)}
      aria-live={ariaLive}
      tabIndex={0}
      className={getZoneClass(state.stage)}
      onClick={onZoneClick}
      onKeyDown={handleKeyDown}
      onDragEnter={(e) => {
        e.preventDefault()
        onDragEnter()
      }}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        ref={fileInputRef}
        style={{ display: 'none' }}
        aria-hidden="true"
        onChange={handleFileInputChange}
      />

      <div className={styles.content}>
        {state.stage === 'uploading' && state.file ? (
          <UploadProgress
            percent={state.uploadProgress}
            filename={state.file.name}
          />
        ) : state.stage === 'drag-over' ? (
          <>
            <CloudUploadOutlined
              className={styles.icon}
              style={{ fontSize: 48, color: '#4f6ef7', marginBottom: 12 }}
            />
            <div
              className={styles.heading}
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#e8e8f0',
                marginBottom: 0,
              }}
            >
              Release to upload
            </div>
          </>
        ) : state.stage === 'error' && state.error ? (
          <>
            <CloseCircleOutlined
              className={styles.icon}
              style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 12 }}
            />
            <div
              className={styles.heading}
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#ff4d4f',
                marginBottom: 8,
              }}
            >
              {state.error.heading}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: '#8888a8',
              }}
            >
              {state.error.message}
            </div>
          </>
        ) : (
          <>
            <InboxOutlined
              className={styles.icon}
              style={{ fontSize: 48, color: '#8888a8', marginBottom: 12 }}
            />
            <div
              className={styles.heading}
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#e8e8f0',
                marginBottom: 8,
              }}
            >
              Drag &amp; Drop your PDF here
            </div>
            <div
              style={{
                fontSize: 14,
                color: '#8888a8',
                marginBottom: 8,
              }}
            >
              or click to browse
            </div>
            <div
              style={{
                fontSize: 14,
                color: '#8888a8',
              }}
            >
              PDF only · Up to 20 MB
            </div>
          </>
        )}
      </div>
    </div>
  )
}
