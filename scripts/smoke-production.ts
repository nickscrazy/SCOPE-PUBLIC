import { spawn, execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "scope-production-smoke-"));
const port = Number(process.env.SMOKE_PORT || 3115),
  origin = `http://localhost:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  APP_ENV: "staging",
  EMAIL_PROVIDER: "outbox",
  OUTBOX_DIR: join(dir, "outbox"),
  BACKUP_DIR: join(dir, "backups"),
  LOG_LEVEL: "warn",
  PORT: String(port),
  BASE_URL: origin,
  DATABASE_PATH: join(dir, "scope.db"),
};
let child: ChildProcess | undefined;
async function stop() {
  if (!child) return;
  const processToStop = child;
  child = undefined;
  if (processToStop.exitCode !== null) return;
  const ended = once(processToStop, "exit");
  processToStop.kill("SIGTERM");
  await ended;
}
async function boot() {
  child = spawn(process.execPath, ["dist/server.js"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let error = "";
  let ready = false;
  child.stdout?.on("data", (chunk) => {
    if (String(chunk).includes("SCOPE running")) ready = true;
  });
  child.stderr?.on("data", (chunk) => {
    error += String(chunk);
  });
  for (let i = 0; i < 100; i++) {
    try {
      if (ready) {
        const r = await fetch(origin + "/api/health");
        if (r.ok) return;
      }
    } catch {
      /* Wait for owned local process. */
    }
    if (child.exitCode !== null)
      throw new Error("Production process exited: " + error);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Production health check timed out.");
}
try {
  await promisify(execFile)(process.execPath, ["dist/cli.js", "migrate"], { env });
  await promisify(execFile)(process.execPath, ["dist/cli.js", "seed"], { env });
  await boot();
  const address = `smoke-${randomUUID()}@example.test`;
  const registration = await fetch(origin + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: address,
      password: randomUUID() + "!aA",
      startTrial: true,
    }),
  });
  assert.equal(registration.status, 201);
  const setCookie = registration.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/);
  const cookie = setCookie.split(";")[0];
  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
    Origin: origin,
  };
  const outbox = join(dir, "outbox");
  const mail = readdirSync(outbox).map((f) => JSON.parse(readFileSync(join(outbox, f), "utf8"))).find((m) => m.to === address);
  const token = mail.text.match(/token=([a-f0-9]{64})/)[1];
  assert.equal((await fetch(origin + "/api/auth/verify-email", { method: "POST", headers, body: JSON.stringify({ token }) })).status, 200);
  const profile = {
    companyName: "Clean start verification",
    services: ["research", "policy analysis"],
    sectors: ["research"],
    experience: "Local evaluation",
    projects: "",
    qualifications: [],
    staff: 3,
    contractors: 0,
    capacity: 2,
    turnover: "unknown",
    geographies: ["Malta", "EU"],
    minValue: 5000,
    maxValue: 50000,
    role: "bidder",
    interests: "both",
  };
  assert.equal(
    (
      await fetch(origin + "/api/profile", {
        method: "PUT",
        headers,
        body: JSON.stringify(profile),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(origin + "/api/saves/fondi-digitalise-sme", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    200,
  );
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.match(
    home.headers.get("content-security-policy") || "",
    /frame-ancestors 'none'/,
  );
  assert.match(await home.text(), /SCOPE/);
  await stop();
  await boot();
  const me = (await (await fetch(origin + "/api/me", { headers })).json()) as {
    plan: string;
  };
  assert.equal(me.plan, "trial");
  const persisted = (await (
    await fetch(origin + "/api/profile", { headers })
  ).json()) as { profile: { companyName: string } };
  assert.equal(persisted.profile.companyName, profile.companyName);
  const saves = (await (
    await fetch(origin + "/api/opportunities?saved=true", { headers })
  ).json()) as { opportunities: { id: string }[] };
  assert.equal(saves.opportunities.length, 1);
  assert.equal(saves.opportunities[0].id, "fondi-digitalise-sme");
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        productionBoot: true,
        health: true,
        registration: true,
        emailVerification: true,
        profileWrite: true,
        save: true,
        processRestart: true,
        sessionAfterRestart: true,
        profileAfterRestart: true,
        saveAfterRestart: true,
        staticServingAndCsp: true,
        executedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
