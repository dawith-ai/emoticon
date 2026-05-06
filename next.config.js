const path = require("path");

const isProd = process.env.NODE_ENV === "production";
const isPages = process.env.GITHUB_PAGES === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // GitHub Pages 정적 배포용 export
  ...(isPages
    ? {
        output: "export",
        basePath: "/emoticon",
        assetPrefix: "/emoticon/",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
