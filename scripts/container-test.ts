/**
 * Production-like container verification. Requires Docker and a built image:
 *   docker build -t scope:rc .            (add --secret id=extra_ca,... behind a TLS proxy)
 *   docker build -t scope:previous <older release>   (optional, enables the rollback leg)
 *   npx tsx scripts/container-test.ts
 * Exercises: APP_ENV=production boot, real SMTP delivery to a local sink, email
 * verification, persistence across restarts, encrypted backup, restore after data
 * loss, upgrade of a previous-release database, and rollback to the previous image.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { hashPassword } from "../server/auth";

const IMAGE = process.env.SCOPE_IMAGE || "scope:rc";
const PREVIOUS = process.env.SCOPE_PREVIOUS_IMAGE || "scope:codex-baseline";
const PORT = 3290;
const ORIGIN = "https://scope.localtest";
const run = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryRun = (...args: string[]) => {
  try {
    return run(...args);
  } catch {
    return "";
  }
};
const step = (s: string) => console.log("•", s);
const results: Record<string, unknown> = {};
const work = mkdtempSync(join(tmpdir(), "scope-container-"));
const mail = join(work, "mail");
const data = join(work, "data");
const backups = join(work, "backups");
for (const d of [mail, data, backups]) {
  mkdirSync(d, { recursive: true });
  chmodSync(d, 0o777);
}
const key = randomBytes(32).toString("hex");
const net = "scope-test-net";
const env = [
  "APP_ENV=production",
  `BASE_URL=${ORIGIN}`,
  "TRUST_PROXY=1",
  "EMAIL_PROVIDER=smtp",
  "SMTP_URL=smtp://mailsink:2525?ignoreTLS=true",
  "EMAIL_FROM=SCOPE <no-reply@scope.localtest>",
  `BACKUP_ENCRYPTION_KEY=${key}`,
  "LOG_LEVEL=warn",
].flatMap((e) => ["-e", e]);
const sinkScript = `
import { SMTPServer } from "smtp-server";
import { writeFileSync } from "node:fs";
let n = 0;
new SMTPServer({ authOptional: true, disabledCommands: ["STARTTLS"], onData(stream, s, cb) {
  let body = ""; stream.on("data", (c) => body += c); stream.on("end", () => { writeFileSync("/mail/" + Date.now() + "-" + (n++) + ".eml", body); cb(); });
} }).listen(2525, "0.0.0.0");`;
writeFileSync(join(work, "sink.mjs"), sinkScript);

function cleanup() {
  tryRun("rm", "-f", "scope-test", "mailsink");
  tryRun("network", "rm", net);
}
async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/ready`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Container did not become ready:\n" + tryRun("logs", "scope-test"));
}
function startApp(image = IMAGE) {
  tryRun("rm", "-f", "scope-test");
  run(
    "run", "-d", "--name", "scope-test", "--network", net, "-p", `127.0.0.1:${PORT}:3000`,
    "--read-only", "--tmpfs", "/tmp", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "-v", `${data}:/data`, "-v", `${backups}:/backups`, ...env, image,
  );
}
let cookie = "";
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie, ...(init.headers || {}) },
  });
  const set = r.headers.get("set-cookie");
  if (set?.startsWith("scope_session=")) cookie = set.split(";")[0];
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown>, headers: r.headers };
}
function lastMailLink(to: string) {
  const files = readdirSync(mail).sort();
  for (const f of files.reverse()) {
    const raw = readFileSync(join(mail, f), "utf8").replace(/=\r?\n/g, "").replace(/=3D/g, "=");
    if (raw.includes(`To: ${to}`)) {
      const m = raw.match(/token=([a-f0-9]{64})/);
      if (m) return m[1];
    }
  }
  throw new Error("No mail for " + to);
}

try {
  cleanup();
  run("network", "create", net);
  step("Start local SMTP sink");
  run("run", "-d", "--name", "mailsink", "--network", net, "-v", `${resolve("node_modules")}:/sink/node_modules:ro`, "-v", `${mail}:/mail`, "-v", `${join(work, "sink.mjs")}:/sink/sink.mjs:ro`, "node:24-bookworm-slim", "node", "/sink/sink.mjs");

  step("Upgrade: create a database in the previous release's schema (migration 001 only) with an existing user");
  const legacy = new DatabaseSync(join(data, "scope.db"));
  legacy.exec("CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)");
  legacy.exec(readFileSync("server/migrations/001_initial.sql", "utf8"));
  legacy.prepare("INSERT INTO migrations VALUES('001_initial.sql',?)").run(new Date().toISOString());
  const legacyPassword = "Legacy account passphrase 1";
  legacy.prepare("INSERT INTO users VALUES(?,?,?,?,NULL,NULL)").run("legacy-user", "legacy@example.test", await hashPassword(legacyPassword), new Date().toISOString());
  legacy.close();
  chmodSync(join(data, "scope.db"), 0o666);

  step("Boot APP_ENV=production container (entrypoint migrates with a pre-migration backup)");
  startApp();
  results.ready = await waitReady();
  const preMigration = readdirSync(backups).filter((f) => f.includes("pre-migration") && f.endsWith(".db.enc"));
  assert.equal(preMigration.length, 1, "pre-migration encrypted backup expected");
  results.preMigrationBackup = preMigration[0];
  assert.equal((await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "legacy@example.test", password: legacyPassword }) })).status, 200);
  results.legacyLoginAfterUpgrade = true;

  step("Security headers and refusal of unsafe production settings");
  const home = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.match(home.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(home.headers.get("strict-transport-security") || "", /max-age=31536000/);
  const bad = tryRun("run", "--rm", "-e", "APP_ENV=production", "-e", "BASE_URL=http://insecure.example", IMAGE);
  assert.equal(bad, "", "insecure production configuration must not start");
  results.productionGuards = true;

  step("Register; verification email delivered over SMTP; confirm; trial starts");
  cookie = "";
  const email = `container-${Date.now()}@example.test`;
  const reg = await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password: "Container smoke passphrase 9", startTrial: true }) });
  assert.equal(reg.status, 201);
  assert.match(reg.headers.get("set-cookie") || "", /Secure/);
  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await api("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: lastMailLink(email) }) })).status, 200);
  assert.equal((await api("/me")).body.plan, "trial");
  results.smtpVerification = true;
  run("exec", "scope-test", "node", "dist/cli.js", "seed");
  const profile = { companyName: "Container Verification Ltd", services: ["software development"], sectors: ["digital"], experience: "", projects: "", qualifications: [], staff: 4, contractors: null, capacity: 2, turnover: "250k-1m", geographies: ["Malta"], minValue: 10000, maxValue: 200000, role: "bidder", interests: "both" };
  assert.equal((await api("/profile", { method: "PUT", body: JSON.stringify(profile) })).status, 200);
  assert.equal((await api("/saves/fondi-digitalise-sme", { method: "POST", body: "{}" })).status, 200);

  step("Restart container: session, profile and saves persist");
  run("restart", "scope-test");
  await waitReady();
  assert.equal((await api("/profile")).body.profile && ((await api("/profile")).body.profile as { companyName: string }).companyName, profile.companyName);
  assert.equal(((await api("/opportunities?saved=true")).body.opportunities as unknown[]).length, 1);
  results.persistenceAcrossRestart = true;

  step("Encrypted backup; simulate data loss; restore; data returns");
  const backup = JSON.parse(run("exec", "scope-test", "node", "dist/cli.js", "backup", "drill")) as { file: string; encrypted: boolean };
  assert.equal(backup.encrypted, true);
  const raw = readFileSync(join(backups, backup.file.split("/").pop()!));
  assert.equal(raw.includes(Buffer.from(email)), false, "backup must not contain plaintext email");
  assert.equal(JSON.parse(run("exec", "scope-test", "node", "dist/cli.js", "verify-backup", backup.file)).ok, true);
  assert.equal((await api("/profile", { method: "DELETE", body: "{}" })).status, 200);
  assert.equal((await api("/profile")).body.profile, null);
  run("stop", "scope-test");
  run("run", "--rm", "-v", `${data}:/data`, "-v", `${backups}:/backups`, ...env, "--entrypoint", "node", IMAGE, "dist/cli.js", "restore", backup.file);
  run("start", "scope-test");
  await waitReady();
  assert.equal(((await api("/profile")).body.profile as { companyName: string }).companyName, profile.companyName);
  results.backupRestoreDrill = { backup: backup.file.split("/").pop() };

  if (tryRun("image", "inspect", PREVIOUS)) {
    step(`Rollback: restore the pre-migration backup and run the previous image (${PREVIOUS})`);
    run("stop", "scope-test");
    run("run", "--rm", "-v", `${data}:/data`, "-v", `${backups}:/backups`, ...env, "--entrypoint", "node", IMAGE, "dist/cli.js", "restore", "/backups/" + preMigration[0]);
    tryRun("rm", "-f", "scope-test");
    run("run", "-d", "--name", "scope-test", "--network", net, "-p", `127.0.0.1:${PORT}:3000`, "-v", `${data}:/data`, "-e", "BASE_URL=" + ORIGIN, "-e", "DATABASE_PATH=/data/scope.db", PREVIOUS);
    for (let i = 0; i < 60 && !(await fetch(`http://127.0.0.1:${PORT}/api/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 500));
    cookie = "";
    assert.equal((await api("/auth/login", { method: "POST", body: JSON.stringify({ email: "legacy@example.test", password: legacyPassword }) })).status, 200);
    results.rollbackToPreviousRelease = { image: PREVIOUS, legacyLogin: true };
  } else results.rollbackToPreviousRelease = "skipped: previous image not present";

  results.status = "PASS";
  results.executedAt = new Date().toISOString();
  results.image = IMAGE;
  console.log(JSON.stringify(results, null, 2));
  if (process.env.EVIDENCE_FILE) writeFileSync(process.env.EVIDENCE_FILE, JSON.stringify(results, null, 2));
} finally {
  if (!process.env.KEEP) cleanup();
  if (!process.env.KEEP && existsSync(work)) execFileSync("rm", ["-rf", work]);
}
