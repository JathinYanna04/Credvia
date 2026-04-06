const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
    // Next.js 14 requires experimental.serverComponentsExternalPackages
    // to avoid bundling Node-native dependencies into route handlers.
    serverComponentsExternalPackages: [
      "@napi-rs/canvas",
      "tesseract.js",
      "pdfjs-dist",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/jobs",
        destination: "/career/jobs",
        permanent: false,
      },
      {
        source: "/jobs/:path*",
        destination: "/career/jobs/:path*",
        permanent: false,
      },
      {
        source: "/careers",
        destination: "/career",
        permanent: false,
      },
      {
        source: "/careers/:path*",
        destination: "/career/:path*",
        permanent: false,
      },
      {
        source: "/carreers",
        destination: "/career",
        permanent: false,
      },
      {
        source: "/carreers/:path*",
        destination: "/career/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
