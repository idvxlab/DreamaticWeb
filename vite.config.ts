import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
const backend: ProxyOptions = {
  target: "http://127.0.0.1:4310",
  changeOrigin: false,
  configure(proxy) {
    proxy.on("error", (_error, _req, res) => {
      if ("writeHead" in res && !res.headersSent && !res.writableEnded)
        res
          .writeHead(503, { "Content-Type": "application/json; charset=utf-8" })
          .end(
            JSON.stringify({
              code: "DEV_BACKEND_UNAVAILABLE",
              error: "后端连接中断，开发服务可能正在重启。请稍后重试。",
            }),
          );
    });
  },
};
export default defineConfig({
  plugins: [react()],
  root: "apps/web",
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/assets": backend,
    },
  },
});
