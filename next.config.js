/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required to allow fetching from external prediction market APIs
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
