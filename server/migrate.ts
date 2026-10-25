import { openDatabase } from "./db.js";
const db = openDatabase();
console.log("Database migrations applied.");
db.close();
