import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  // sharp is loaded server-side via dynamic require; mark it external so
  // standalone tracing keeps the prebuilt binaries instead of bundling.
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "alto4-alto-media.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.canva.com" },
      { protocol: "https", hostname: "loopcrm.b-cdn.net" },
    ],
  },
};

export default nextConfig;
