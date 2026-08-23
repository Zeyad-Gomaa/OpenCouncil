/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy API + SSE to the council server so everything is same-origin.
    const target = process.env.OPEN_COUNCIL_SERVER_URL ?? 'http://127.0.0.1:4311'
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }]
  },
}

module.exports = nextConfig
