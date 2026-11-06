/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pg is used by the checkout API route and the records store; keep it
    // out of the client bundle and load it as an external server package.
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
