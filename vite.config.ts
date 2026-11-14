import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envPrefix: ['MEDPLUM_'],
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000 },
  preview: { host: '0.0.0.0', port: 3000 },
  build: { chunkSizeWarningLimit: 4000 },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
});
