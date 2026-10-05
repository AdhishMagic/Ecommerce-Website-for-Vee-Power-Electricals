import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
          }
        },
      },
    },
  },
  optimizeDeps: {
    // Declare runtime dependencies up front to prevent mid-session re-optimization resets
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-is',
      'react-router-dom',
      'lucide-react',
      'recharts',
    ],
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '5173'),
    strictPort: true,
    cors: true,
    // Allow both localhost, 127.0.0.1, and container hostnames without Host header rejection
    allowedHosts: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    // Pre-warm entry points and primary admin pages so navigations load instantly from cache
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/pages/admin/Customers.tsx',
        './src/pages/admin/Dashboard.tsx',
        './src/pages/admin/Orders.tsx',
      ],
    },
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.vscode/**',
        '**/tests/**',
        '**/coverage/**',
        '**/public/**',
        '**/*.mp4',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.svg',
      ],
    },
    hmr: {
      // Disables intrusive error overlay popup on transient reconnects
      overlay: false,
      clientPort: parseInt(process.env.FRONTEND_PORT || '5173'),
    },
    proxy: {
      '/media': {
        target: process.env.VITE_BACKEND_URL || 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '5173'),
  },
})
