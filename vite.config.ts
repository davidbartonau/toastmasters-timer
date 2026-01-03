import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  envDir: '..',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        display: resolve(__dirname, 'src/display/index.html'),
        control: resolve(__dirname, 'src/control/index.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: '/display/',
  },
});
