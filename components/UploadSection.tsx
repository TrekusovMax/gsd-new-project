'use client'

import { usePdfUpload } from '@/features/pdf/usePdfUpload'
import { DropZone } from './DropZone'
import { FileInfoCard } from './FileInfoCard'

export function UploadSection() {
  const {
    state,
    handleFile,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleZoneClick,
    handleReset,
    fileInputRef,
  } = usePdfUpload()

  return (
    <div
      style={{
        maxWidth: 600,
        width: '100%',
        borderRadius: 12,
        background: '#1a1a2e',
        padding: 24,
      }}
    >
      <style>{`
        @media (max-width: 767px) {
          .upload-section-card {
            padding: 16px !important;
          }
        }
      `}</style>

      <DropZone
        state={state}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onZoneClick={handleZoneClick}
        onFile={handleFile}
        fileInputRef={fileInputRef}
      />

      {state.stage === 'upload-complete' && state.file !== null && (
        <FileInfoCard
          filename={state.file.name}
          size={state.file.size}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
