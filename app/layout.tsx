'use client'

import { ConfigProvider, theme } from 'antd'
import type { ReactNode } from 'react'
import './globals.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorBgBase: '#141414',
              colorBgContainer: '#1a1a2e',
              colorPrimary: '#4f6ef7',
              colorSuccess: '#52c41a',
              colorError: '#ff4d4f',
              colorBorder: '#303050',
              colorText: '#e8e8f0',
              colorTextSecondary: '#8888a8',
              fontFamily:
                "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: 14,
              fontSizeHeading2: 28,
              fontSizeHeading4: 20,
              fontWeightStrong: 600,
              paddingXXS: 4,
              paddingXS: 8,
              padding: 16,
              paddingLG: 24,
              paddingXL: 32,
              borderRadius: 8,
              borderRadiusLG: 12,
            },
          }}
        >
          {children}
        </ConfigProvider>
      </body>
    </html>
  )
}
