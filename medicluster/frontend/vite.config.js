import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Vite's static MIME map omits APKs. Keep verified installer fetches consistent
// with the production Express server in both development and preview.
function androidInstallerTypes() {
  const configure = (server) => {
    server.middlewares.use((req, res, next) => {
      if (/^\/downloads\/medicluster-(patient|crew)\.apk(?:\?|$)/.test(req.url || "")) {
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
      }
      next();
    });
  };
  return { name: "android-installer-types", configureServer: configure, configurePreviewServer: configure };
}

export default defineConfig({
  plugins: [react(), androidInstallerTypes()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        timeout: 180000,
        proxyTimeout: 180000,
      },
    },
  },
});
