const Database = require('better-sqlite3');
const path = require('path');
const dbFile = path.join(__dirname, 'data', 'freeapi.db');
const db = new Database(dbFile);
const rows = db.prepare("SELECT model_id, display_name, enabled, intelligence_rank FROM models WHERE platform=? AND model_id IN (?,?)").all('cloudflare', '@cf/moonshotai/kimi-k2.7-code', '@cf/zai-org/glm-5.2');
console.log('models:', JSON.stringify(rows, null, 2));
const fb = db.prepare("SELECT f.id, f.enabled, f.priority FROM fallback_config f JOIN models m ON f.model_db_id = m.id WHERE m.platform=? AND m.model_id IN (?,?)").all('cloudflare', '@cf/moonshotai/kimi-k2.7-code', '@cf/zai-org/glm-5.2');
console.log('fallback:', JSON.stringify(fb, null, 2));
db.close();
