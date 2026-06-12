import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Required for Electron file:// protocol
  build: {
    // Suppress large chunk warning
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Code splitting: separate vendor chunks
        manualChunks: {
          // Vendor libraries
          vendor: ['react', 'react-dom'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
})
