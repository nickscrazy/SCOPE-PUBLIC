import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { configureLogging, log, errorName } from "./log.js";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { startScheduler } from "./jobs.js";

const config = loadConfig();
configureLogging(config.LOG_LEVEL);
const db = openDatabase(config.DATABASE_PATH, { migrationsDir: config.MIGRATIONS_DIR });
const app = createApp(db, { config });
// The built client is served whenever this is a real deployment, so `start` needs no
// shell-specific environment prefix and behaves the same on every platform.
const serveBuild = process.env.NODE_ENV === "production" || config.APP_ENV !== "development";
if (serveBuild) {
  const { default: express } = await import("express");
  app.use(
    express.static(resolve("dist/client"), {
      index: false,
      setHeaders(res, path) {
        // Fingerprinted assets are immutable; HTML must revalidate so releases take effect.
        res.set("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-cache").sendFile(resolve("dist/client/index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
const stopScheduler = config.TED_SYNC_ENABLED ? startScheduler(db, config) : () => {};
const server = app.listen(config.PORT, config.HOST, () => {
  log.info("server.started", {
    port: config.PORT,
    appEnv: config.APP_ENV,
    email: config.EMAIL_PROVIDER,
    billing: config.BILLING_PROVIDER,
    scheduler: config.TED_SYNC_ENABLED,
    legalConfigured: config.legalConfigured,
  });
  console.log(`SCOPE running at ${config.BASE_URL}`);
});
server.headersTimeout = 30000;
server.requestTimeout = 60000;
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("server.stopping", { signal });
  stopScheduler();
  server.close(() => {
    try {
      db.close();
    } catch (e) {
      log.error("server.db_close_failed", { error: errorName(e) });
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
