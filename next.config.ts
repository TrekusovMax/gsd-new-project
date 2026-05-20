import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', 'mupdf'],
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
