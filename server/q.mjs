import Database from "better-sqlite3";
const db = new Database(process.argv[2], {readonly: true});
const rows = db.prepare("SELECT model_id, display_name, platform, enabled FROM models WHERE platform='opencode' OR model_id LIKE '%mimo%' OR display_name LIKE '%Mimo%' OR display_name LIKE '%mimo%'").all();
console.table(rows);
db.close();
