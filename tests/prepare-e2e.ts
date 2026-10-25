import { rmSync, readFileSync } from "node:fs";
import { openDatabase, upsertOpportunities } from "../server/db";
import { grantsCatalogue } from "../server/catalogue";
import { normalizeNotice } from "../server/ted";
// Disposable test-only database. Never touch the application database.
const path = "./data/e2e.db";
for (const suffix of ["", "-wal", "-shm"])
  rmSync(path + suffix, { force: true });
const db = openDatabase(path);
upsertOpportunities(db, grantsCatalogue);
const response = JSON.parse(
  readFileSync("tests/fixtures/ted-recent.json", "utf8"),
) as { notices: Record<string, unknown>[] };
upsertOpportunities(
  db,
  response.notices
    .slice(0, 8)
    .map((n) => normalizeNotice(n, new Date("2026-10-25T20:19:52.436Z"))),
);
db.close();
