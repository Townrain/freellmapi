import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

// Read the DB and encryption key
const dbPath = process.argv[2];
const rawKey = process.argv[3];

// Freellmapi uses AES-256-GCM envelope encryption
// The key stored in settings is the raw hex key
const key = Buffer.from(rawKey, "hex");

// Try to open directly first (some desktop builds don't encrypt)
let db;
try {
  db = new Database(dbPath, { readonly: false });
} catch {
  console.log("Cannot open DB directly (may be encrypted or locked)");
  process.exit(1);
}

try {
  const row = db.prepare("SELECT id FROM migrations WHERE filename = ?").get("20260704_194607_cloudflare_model_update.ts");
  if (row) {
    db.prepare("DELETE FROM migrations WHERE id = ?").run(row.id);
    console.log("Deleted migration record for cloudflare_model_update — will re-run on next boot");
  } else {
    console.log("Migration record not found");
  }
  db.close();
} catch(e) {
  console.log("Error:", e.message);
  // DB is probably encrypted, need to use the app's crypto
}
