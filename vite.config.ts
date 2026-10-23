import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Spotify n'accepte plus "localhost" comme URI de redirection : on sert l'app sur 127.0.0.1.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
})
