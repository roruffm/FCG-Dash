import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json; charset=utf-8"],
  "/service-worker.js": ["service-worker.js", "text/javascript; charset=utf-8"],
  "/fcg-logo.png": ["fcg-logo.png", "image/png"],
  "/icon-192.png": ["icon-192.png", "image/png"],
  "/icon-512.png": ["icon-512.png", "image/png"],
  "/FCG_Dashboard_Datenvorlage.xlsx": ["FCG_Dashboard_Datenvorlage.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
};

const assets = {};
for (const [route, [filename, contentType]] of Object.entries(files)) {
  const bytes = await readFile(resolve(root, "client", filename));
  assets[route] = { contentType, body: bytes.toString("base64") };
}

const source = await readFile(resolve(root, "server", "worker-source.js"), "utf8");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(resolve(dist, "server", "index.js"), `const ASSETS = ${JSON.stringify(assets)};\n${source}`);
await cp(resolve(root, ".openai", "hosting.json"), resolve(dist, ".openai", "hosting.json"));
await cp(resolve(root, "drizzle"), resolve(dist, ".openai", "drizzle"), { recursive: true });
