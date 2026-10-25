import { rmSync, readFileSync } from "node:fs";
import { openDatabase, upsertOpportunities } from "../server/db";
import { grantsCatalogue } from "../server/catalogue";
import { normalizeNotice } from "../server/ted";
// Disposable test-only database and outbox. Never touch the application database.
const path = "./data/e2e.db";
for (const suffix of ["", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
rmSync("./data/e2e-outbox", { recursive: true, force: true });
const db = openDatabase(path);
for (const ref of grantsCatalogue)
  upsertOpportunities(db, [ref], new Date(), {
    reviewDueAt: ref.verifiedAt ? new Date(new Date(ref.verifiedAt).getTime() + 30 * 86400000).toISOString() : null,
  });
// Recorded public TED response (real notices), replayed offline. No live sync is recorded here.
const response = JSON.parse(readFileSync("tests/fixtures/ted-recent.json", "utf8")) as {
  notices: Record<string, unknown>[];
};
upsertOpportunities(
  db,
  response.notices.slice(0, 8).map((n) => normalizeNotice(n, new Date("2026-10-25T20:19:52.436Z"))),
);
db.close();
