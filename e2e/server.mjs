/**
 * Static server for the fixture corpus. It listens on two ports so that
 * "cross-origin" stylesheets and frames in fixtures are genuinely so.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../fixtures/", import.meta.url));
const PORTS = [5180, 5181];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function resolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const path = normalize(join(ROOT, decoded));
  if (path !== ROOT.slice(0, -1) && !path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    return null;
  }
  if (existsSync(path) && statSync(path).isDirectory()) return join(path, "index.html");
  return path;
}

for (const port of PORTS) {
  createServer((request, response) => {
    const path = resolve(request.url ?? "/");
    if (path === null || !existsSync(path)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(path).pipe(response);
  }).listen(port, "127.0.0.1");
}

console.log(`fixtures on http://localhost:${PORTS.join(" and http://localhost:")}`);
