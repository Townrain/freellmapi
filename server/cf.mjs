import Database from "better-sqlite3";
const db = new Database(process.argv[2], {readonly: true});
const rows = db.prepare("SELECT model_id, display_name, enabled FROM models WHERE platform = ? ORDER BY intelligence_rank").all("cloudflare");
console.log("CF models (" + rows.length + "):");
rows.forEach(r => console.log("  " + r.model_id + " enabled=" + r.enabled));
db.close();
