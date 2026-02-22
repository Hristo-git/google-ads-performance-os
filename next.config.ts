import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Strict mode catches side-effects and double-invocations in development
    reactStrictMode: true,

    // Experimental: optimize imports from large packages to reduce bundle size
    experimental: {
        optimizePackageImports: [
            "lucide-react",
            "@anthropic-ai/sdk",
            "@pinecone-database/pinecone",
        ],
    },

    // Security headers — applied to all routes
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-XSS-Protection", value: "1; mode=block" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                ],
            },
            // Cache static assets aggressively, never cache API routes
            {
                source: "/api/(.*)",
                headers: [
                    { key: "Cache-Control", value: "no-store, max-age=0" },
                ],
            },
        ];
    },

    // Reduce console noise in production builds
    compiler: {
        removeConsole: process.env.NODE_ENV === "production"
            ? { exclude: ["error", "warn"] }
            : false,
    },
};

export default nextConfig;
