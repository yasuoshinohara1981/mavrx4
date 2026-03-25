import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl', '**/*.hdr']
});

