import { openDatabase, upsertOpportunities } from "./db.js";
import { grantsCatalogue } from "./catalogue.js";
const db = openDatabase();
const count = upsertOpportunities(db, grantsCatalogue);
console.log(
  `Seeded ${count} official-link funding references. No fictional records or shared accounts. Check dates are preserved.`,
);
db.close();
