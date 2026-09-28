import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // O tsconfig do Next usa jsx: preserve; nos testes o JSX (PDFs em lib/pdf.tsx) é transformado aqui.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
