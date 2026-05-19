'use client'

import { useEffect, useRef } from 'react'
import { Button, Typography, Segmented, Tag } from 'antd'
import { CheckCircleFilled, DownloadOutlined } from '@ant-design/icons'
import { formatFileSize } from '@/features/pdf/pdfValidation'
import { CompressionPreset, AppError } from '@/types/upload'

interface FileInfoCardProps {
  filename: string
  size: number
  stage: 'upload-complete' | 'compressing' | 'compress-complete' | 'error'
  preset: CompressionPreset
  onPresetChange: (preset: CompressionPreset) => void
  onCompress: () => void
  onDownload: () => void
  onReset: () => void
  onRetry: () => void
  originalSize?: number | null
  compressedSize?: number | null
  error?: AppError | null
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function calcSavings(original: number, compressed: number): { percent: number; savedMB: string } {
  const percent = Math.round(((original - compressed) / original) * 100)
  const savedMB = formatMB(original - compressed)
  return { percent, savedMB }
}

export function FileInfoCard({
  filename,
  size,
  stage,
  preset,
  onPresetChange,
  onCompress,
  onDownload,
  onReset,
  onRetry,
  originalSize,
  compressedSize,
  error,
}: FileInfoCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Suppress unused var warning for error — PLAN-2.3 will wire it
  void error
  void onRetry

  return (
    <div
      ref={containerRef}
      role="status"
      aria-label="File uploaded successfully"
      aria-live="polite"
      tabIndex={-1}
      style={{
        background: '#1a1a2e',
        border: '1px solid #303050',
        borderRadius: 8,
        padding: 24,
        marginTop: 16,
        animation: 'fileCardEnter 200ms ease forwards',
        outline: 'none',
      }}
    >
      <style>{`
        @keyframes fileCardEnter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .file-info-card-animate {
            animation: none !important;
          }
        }
      `}</style>

      {/* Header row — shown across all stages */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <CheckCircleFilled
          aria-label="Upload successful"
          style={{ fontSize: 24, color: '#52c41a', flexShrink: 0 }}
        />
        <div
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            color: '#e8e8f0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {filename}
        </div>
        <div
          style={{
            fontSize: 14,
            color: '#8888a8',
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {formatFileSize(size)}
        </div>
      </div>

      {/* Stage-conditional content — key triggers re-mount animation on stage change */}
      <div key={stage}>
        {stage === 'upload-complete' && (
          <>
            {/* Segmented preset selector — D-01, D-02, D-03 */}
            <div style={{ marginBottom: 16 }}>
              <Segmented
                options={[
                  { label: 'Maximum', value: 'maximum' },
                  { label: 'Balanced', value: 'balanced' },
                  { label: 'High Quality', value: 'quality' },
                ]}
                value={preset}
                onChange={(v) => onPresetChange(v as CompressionPreset)}
                block
                style={{ marginBottom: 12 }}
              />
              <Button
                type="primary"
                size="large"
                block
                onClick={onCompress}
                style={{ minHeight: 44 }}
              >
                Compress PDF
              </Button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Typography.Link onClick={onReset} style={{ fontSize: 14 }}>
                Upload another file
              </Typography.Link>
            </div>
          </>
        )}

        {stage === 'compressing' && (
          /* D-04, D-05: loading state during compression */
          <div style={{ marginBottom: 16 }}>
            <Segmented
              options={[
                { label: 'Maximum', value: 'maximum' },
                { label: 'Balanced', value: 'balanced' },
                { label: 'High Quality', value: 'quality' },
              ]}
              value={preset}
              disabled
              block
              style={{ marginBottom: 12 }}
            />
            <Button
              type="primary"
              size="large"
              block
              loading
              disabled
              style={{ minHeight: 44 }}
            >
              Compressing…
            </Button>
          </div>
        )}

        {stage === 'compress-complete' && (
          /* D-06, D-07, D-08, D-09: stats + download + reset */
          <>
            {originalSize != null && compressedSize != null && (() => {
              const { percent, savedMB } = calcSavings(originalSize, compressedSize)
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f0', marginBottom: 6 }}>
                    {formatMB(originalSize)} → {formatMB(compressedSize)}
                  </div>
                  <Tag color="#52c41a" style={{ marginBottom: 16 }}>
                    ↓ {percent}% (− {savedMB})
                  </Tag>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<DownloadOutlined />}
                    onClick={onDownload}
                    style={{ minHeight: 44, marginBottom: 12 }}
                  >
                    Download
                  </Button>
                </div>
              )
            })()}
            <div style={{ textAlign: 'center' }}>
              <Typography.Link onClick={onReset} style={{ fontSize: 14 }}>
                Сжать другой файл
              </Typography.Link>
            </div>
          </>
        )}

        {stage === 'error' && (
          /* PLAN-2.3: add compress-error state here */
          null
        )}
      </div>
    </div>
  )
}
