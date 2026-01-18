/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dd.dexscreener.com',
      },
      {
        protocol: 'https',
        hostname: '*.dexscreener.com',
      },
    ],
  },
};

export default nextConfig;
