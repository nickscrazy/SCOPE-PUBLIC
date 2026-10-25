import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { resolve } from "node:path";
const app = createApp(openDatabase(), { baseUrl: process.env.BASE_URL }),
  port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV === "production") {
  const { default: express } = await import("express");
  app.use(express.static(resolve("dist/client")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve("dist/client/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`SCOPE running at http://localhost:${port}`),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
