import fs from "node:fs";
import path from "node:path";
import type { Server as HttpServer } from "node:http";
import express, { type Express } from "express";
import { createServer as createViteServer } from "vite";
import viteConfig from "./vite.config";

export async function setupVite(app: Express, server: HttpServer) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
  app.get("*", async (request, response, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(process.cwd(), "index.html"), "utf8");
      const page = await vite.transformIndexHtml(request.originalUrl, template);
      if (request.path.startsWith("/api/")) { next(); return; }
      response.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

export function serveStatic(app: Express, rootDir: string) {
  const distPath = path.basename(rootDir) === "dist" ? path.resolve(rootDir, "public") : path.resolve(rootDir, "dist", "public");
  if (!fs.existsSync(distPath)) throw new Error(`Build output not found at ${distPath}. Run pnpm run build first.`);
  app.use(express.static(distPath));
  app.get("*", (request, response, next) => { if (request.path.startsWith("/api/")) { next(); return; } response.sendFile(path.resolve(distPath, "index.html")); });
}
