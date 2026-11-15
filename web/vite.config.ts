import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 5500 matches CORS_ORIGIN=http://localhost:5500 on the backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5500, strictPort: true },
});
