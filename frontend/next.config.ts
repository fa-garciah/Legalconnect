import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json at the repository root (unrelated to this project —
  // backend/ and frontend/ are independent Node projects, plan.md's Structure
  // Decision) makes Next.js infer the wrong workspace root. Pin it explicitly.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
