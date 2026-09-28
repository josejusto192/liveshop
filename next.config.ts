import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs', '@react-pdf/renderer'],
  devIndicators: false,
  // Teste no celular pelo Cloudflare Tunnel (README): libera o endereço do túnel no modo de desenvolvimento.
  allowedDevOrigins: ['*.trycloudflare.com'],
};

export default nextConfig;
