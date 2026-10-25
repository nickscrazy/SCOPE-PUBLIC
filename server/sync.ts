import { writeFileSync } from "node:fs";
import { openDatabase } from "./db.js";
import { syncTed } from "./ted.js";
const db = openDatabase();
const result = await syncTed(db);
writeFileSync(
  "evidence/ted-sync-result.json",
  JSON.stringify({ ...result, executedAt: new Date().toISOString() }, null, 2),
);
console.log(JSON.stringify(result, null, 2));
db.close();
if (result.status === "failed") process.exitCode = 1;
