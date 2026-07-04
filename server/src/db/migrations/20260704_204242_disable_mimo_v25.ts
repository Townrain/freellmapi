// Migration: disable_mimo_v25
// Created: 2026-07-04
//
// Disable MiMo-V2.5 Free (OpenCode Zen promo model).
// MiMo has been unreliable; OpenCode Zen's deepseek-v4-flash-free is preferred.
//
// All state changes use UPDATE (enabled toggles) for roundtrip safety.
// DOWN: reversible — re-enables the model.

import type Database from 'better-sqlite3';

const MODEL_ID = 'mimo-v2.5-free';
const PLATFORM = 'opencode';

export function up(db: Database.Database): void {
  db.prepare(`
    UPDATE models SET enabled = 0
     WHERE platform = ? AND model_id = ?
  `).run(PLATFORM, MODEL_ID);

  db.prepare(`
    UPDATE fallback_config SET enabled = 0
     WHERE model_db_id IN (
       SELECT id FROM models WHERE platform = ? AND model_id = ?
     )
  `).run(PLATFORM, MODEL_ID);
}

export function down(db: Database.Database): void {
  db.prepare(`
    UPDATE models SET enabled = 1
     WHERE platform = ? AND model_id = ?
  `).run(PLATFORM, MODEL_ID);

  db.prepare(`
    UPDATE fallback_config SET enabled = 1
     WHERE model_db_id IN (
       SELECT id FROM models WHERE platform = ? AND model_id = ?
     )
  `).run(PLATFORM, MODEL_ID);
}
