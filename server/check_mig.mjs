import Database from 'better-sqlite3';
const db = new Database(process.argv[1]);
const rows = db.prepare('SELECT filename, status, applied_at FROM migrations ORDER BY applied_at').all();
console.table(rows);
db.close();
