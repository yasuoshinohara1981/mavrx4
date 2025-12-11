import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    host: '127.0.0.1'  // host: true だとネットワークエラーが出るので明示的に指定
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  assetsInclude: ['**/*.vert', '**/*.frag', '**/*.glsl']
});

