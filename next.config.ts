import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  devIndicators: false,
  experimental: { serverActions: { bodySizeLimit: '32kb' } },
  async redirects() {
    return [{
      source: '/:path*',
      has: [{ type: 'host', value: 'russmarket-demo.webappmaster.ru' }],
      destination: 'https://support.nadtocheev.ru/:path*',
      permanent: false,
    }]
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    }]
  },
}

export default config
