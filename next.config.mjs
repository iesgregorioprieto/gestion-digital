/** @type {import('next').NextConfig} */
const nextConfig = {
  headers: async () => [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
    {
      // El de los avisos: siempre la última versión, sin copias guardadas
      source: '/sw-avisos.js',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
    {
      source: '/manifest.json',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        { key: 'Content-Type', value: 'application/manifest+json' },
      ],
    },
  ],
};

export default nextConfig;
