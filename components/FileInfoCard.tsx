'use client'

import { useEffect, useRef } from 'react'
import { Button, Typography } from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import { formatFileSize } from '@/features/pdf/pdfValidation'

interface FileInfoCardProps {
  filename: string
  size: number
  onReset: () => void
}

export function FileInfoCard({ filename, size, onReset }: FileInfoCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

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

      <div style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          size="large"
          block
          disabled
          title="Compression coming in the next step"
          aria-disabled="true"
          aria-label="Compress PDF — compression available after upload"
          style={{ minHeight: 44 }}
        >
          Compress PDF
        </Button>
      </div>

      <div style={{ textAlign: 'center' }}>
        <Typography.Link
          onClick={onReset}
          aria-label="Upload another file — resets the upload form"
          style={{ fontSize: 14 }}
        >
          Upload another file
        </Typography.Link>
      </div>
    </div>
  )
}
