import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  build: {
    // Forge's default outDir (`.vite/renderer/<name>`) is resolved against `root`, which put the
    // build in src/renderer/.vite and left it out of the package. Pin it to the project's .vite/.
    // `main_window` must match the renderer name in forge.config.mts.
    outDir: fileURLToPath(new URL('.vite/renderer/main_window', import.meta.url)),
    emptyOutDir: true,
  },
});
