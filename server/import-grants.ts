import { readFileSync, statSync } from "node:fs";
import { openDatabase, upsertOpportunities } from "./db.js";
import { curatedImportSchema } from "./catalogue.js";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: npm run import:grants -- /absolute/path/to/reviewed-catalogue.json",
  );
if (statSync(file).size > 1024 * 1024) throw new Error("Import exceeds 1 MiB.");
const records = curatedImportSchema.parse(
  JSON.parse(readFileSync(file, "utf8")),
);
if (records.some((o) => o.verifiedAt && new Date(o.verifiedAt) > new Date()))
  throw new Error("Verification timestamp cannot be in the future.");
const db = openDatabase();
console.log(
  `Imported ${upsertOpportunities(db, records)} operator-reviewed references. Text was stored as data, never executed.`,
);
db.close();
