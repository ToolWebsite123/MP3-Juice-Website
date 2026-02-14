import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    host: true,
    // ✅ API Proxy (NO PAGE RELOAD)
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        ws: true, // WebSocket support
      }
    },
    // ✅ Handle client-side routing
    historyApiFallback: true,
  },

  // ✅ Preview settings
  preview: {
    port: 5173,
    host: true,
    historyApiFallback: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // ✅ Optimize chunks
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  }
})