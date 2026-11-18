import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // เปิดให้มือถือในวง LAN เข้าถึงได้
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/socket.io': { target: SERVER, ws: true },
    },
  },
});
