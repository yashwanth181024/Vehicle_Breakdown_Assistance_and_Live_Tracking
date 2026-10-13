import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // If 5173 is taken, stop instead of quietly moving to 5174. The backend only
    // accepts the address in CLIENT_URL, so a silent port change shows up as a CORS error.
    strictPort: true,
  },
  preview: { port: 4173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          maps: ['leaflet', 'react-leaflet', 'leaflet.heat'],
          charts: ['recharts'],
        },
      },
    },
  },
});
