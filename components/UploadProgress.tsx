'use client'

import { Progress } from 'antd'

interface UploadProgressProps {
  percent: number
  filename: string
}

export function UploadProgress({ percent, filename }: UploadProgressProps) {
  return (
    <div style={{ width: '100%', padding: '0 8px' }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#e8e8f0',
          maxWidth: 280,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 12,
        }}
      >
        {filename}
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Upload progress"
      >
        <Progress
          type="line"
          percent={percent}
          strokeColor="#4f6ef7"
          showInfo={false}
        />
      </div>
      <div
        style={{
          fontSize: 14,
          color: '#8888a8',
          marginTop: 8,
        }}
      >
        {`Uploading… ${percent}%`}
      </div>
    </div>
  )
}
