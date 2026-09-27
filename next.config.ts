import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs', '@react-pdf/renderer'],
  devIndicators: false,
};

export default nextConfig;
