import http from "node:http";
import worker from "../dist/server/index.js";
import { PostgresD1 } from "./postgres-d1.mjs";

const port = Number(process.env.PORT || 3000);
const database = new PostgresD1(process.env.DATABASE_URL);
await database.initialize();

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const forwardedProtocol = String(incoming.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const protocol = forwardedProtocol === "http" ? "http" : "https";
    const host = incoming.headers.host || `localhost:${port}`;
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const forwardedFor = String(incoming.headers["x-forwarded-for"] || incoming.socket.remoteAddress || "unknown").split(",")[0].trim();
    headers.set("cf-connecting-ip", forwardedFor);

    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const method = incoming.method || "GET";
    const request = new Request(`${protocol}://${host}${incoming.url || "/"}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      duplex: body ? "half" : undefined
    });
    const response = await worker.fetch(request, { ...process.env, DB: database });
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("node_adapter_failed", error);
    if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ error: "Die App ist vorübergehend nicht verfügbar." }));
  }
});

server.listen(port, "0.0.0.0", () => console.log(`FCG Dashboard läuft auf Port ${port}.`));

async function shutdown() {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
