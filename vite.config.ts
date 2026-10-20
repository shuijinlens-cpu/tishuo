import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' 让构建产物用相对路径，可直接丢到 GitHub Pages / 任意静态托管子目录
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
