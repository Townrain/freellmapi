// Migration: cloudflare_model_update
// Created: 2026-07-04
//
// Cloudflare Workers AI model catalog update:
// - Disable kimi-k2.5 (deprecated by CF on 2026-05-30, aliases to k2.6)
// - Fix namespace: @cf/deepseek-ai/ → @cf/deepseek/ (matches CF's actual catalog)
// - Fix namespace: @cf/ibm-granite/ → @cf/ibm/ (matches CF's actual catalog)
// - Add kimi-k2.7-code (active on CF, 1T params, 262K ctx)
// - Add glm-5.2 (active on CF since 2026-06-16, Z.ai's flagship agentic coding model)
//
// All state changes use UPDATE (enabled toggles); no DELETE/INSERT on existing
// tables to keep the roundtrip test stable (auto-increment IDs must survive
// down→up unchanged). New-model INSERT is idempotent via INSERT OR IGNORE.
// DOWN: reversible — re-enables k2.5, reverts namespaces, disables new models.

import type Database from 'better-sqlite3';

function setModelsEnabled(db: Database.Database, platform: string, modelIds: string[], enabled: 0 | 1): void {
  if (modelIds.length === 0) return;
  const placeholders = modelIds.map(() => '?').join(',');
  db.prepare(`
    UPDATE models SET enabled = ?
     WHERE platform = ?
       AND model_id IN (${placeholders})
  `).run(enabled, platform, ...modelIds);
}

function setFallbackEnabled(db: Database.Database, platform: string, modelIds: string[], enabled: 0 | 1): void {
  if (modelIds.length === 0) return;
  const placeholders = modelIds.map(() => '?').join(',');
  db.prepare(`
    UPDATE fallback_config SET enabled = ?
     WHERE model_db_id IN (
       SELECT id FROM models WHERE platform = ? AND model_id IN (${placeholders})
     )
  `).run(enabled, platform, ...modelIds);
}

function addNewModelsToFallback(db: Database.Database, platform: string, modelIds: string[]): void {
  if (modelIds.length === 0) return;
  const placeholders = modelIds.map(() => '?').join(',');
  const missing = db.prepare(`
    SELECT m.id FROM models m
    WHERE m.platform = ? AND m.model_id IN (${placeholders})
      AND m.id NOT IN (SELECT model_db_id FROM fallback_config)
    ORDER BY m.intelligence_rank ASC
  `).all(platform, ...modelIds) as { id: number }[];
  if (missing.length === 0) return;
  const maxPriority = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config').get() as { mx: number }).mx;
  const addFb = db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');
  for (let i = 0; i < missing.length; i++) addFb.run(missing[i].id, maxPriority + i + 1);
}

export function up(db: Database.Database): void {
  // ── 1) Disable deprecated kimi-k2.5 ──
  // CF changelog 2026-05-30: k2.5 aliases to k2.6. Keep row for rollback, disable it.
  setModelsEnabled(db, 'cloudflare', ['@cf/moonshotai/kimi-k2.5'], 0);
  setFallbackEnabled(db, 'cloudflare', ['@cf/moonshotai/kimi-k2.5'], 0);

  // ── 2) Fix namespace errors ──
  // CF's actual catalog uses @cf/deepseek/ and @cf/ibm/, not @cf/deepseek-ai/ or @cf/ibm-granite/.
  db.prepare(`
    UPDATE models
       SET model_id = '@cf/deepseek/deepseek-r1-distill-qwen-32b'
     WHERE platform = 'cloudflare'
       AND model_id = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
  `).run();

  db.prepare(`
    UPDATE models
       SET model_id = '@cf/ibm/granite-4.0-h-micro'
     WHERE platform = 'cloudflare'
       AND model_id = '@cf/ibm-granite/granite-4.0-h-micro'
  `).run();

  // ── 3) Add new models (roundtrip-safe: INSERT OR IGNORE + re-enable) ──
  // Cloudflare Workers AI — 10K Neurons/day shared free pool.
  const NEW_MODELS = ['@cf/moonshotai/kimi-k2.7-code', '@cf/zai-org/glm-5.2'];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, size_label, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const additions: Array<[string, string, string, number, number, string, number | null, number | null, number | null, number | null, string, number | null]> = [
    ['cloudflare', '@cf/moonshotai/kimi-k2.7-code', 'Kimi K2.7 Code (CF)', 2,  11, 'Frontier', null, null, null, null, '~10-20M', 262144],
    ['cloudflare', '@cf/zai-org/glm-5.2',           'GLM-5.2 (CF)',        5,  11, 'Frontier', null, null, null, null, '~10-20M', 262144],
  ];
  for (const a of additions) insert.run(...a);

  // Re-enable in case down() previously disabled them (roundtrip-safe).
  setModelsEnabled(db, 'cloudflare', NEW_MODELS, 1);
  addNewModelsToFallback(db, 'cloudflare', NEW_MODELS);
  // Fallback rows may already exist (from initial up); ensure they're enabled.
  setFallbackEnabled(db, 'cloudflare', NEW_MODELS, 1);
}

export function down(db: Database.Database): void {
  const NEW_MODELS = ['@cf/moonshotai/kimi-k2.7-code', '@cf/zai-org/glm-5.2'];

  // ── 1) Disable new models (roundtrip-safe: keep row, just disable) ──
  setModelsEnabled(db, 'cloudflare', NEW_MODELS, 0);
  setFallbackEnabled(db, 'cloudflare', NEW_MODELS, 0);

  // ── 2) Revert namespace fixes ──
  db.prepare(`
    UPDATE models
       SET model_id = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
     WHERE platform = 'cloudflare'
       AND model_id = '@cf/deepseek/deepseek-r1-distill-qwen-32b'
  `).run();

  db.prepare(`
    UPDATE models
       SET model_id = '@cf/ibm-granite/granite-4.0-h-micro'
     WHERE platform = 'cloudflare'
       AND model_id = '@cf/ibm/granite-4.0-h-micro'
  `).run();

  // ── 3) Re-enable kimi-k2.5 ──
  setModelsEnabled(db, 'cloudflare', ['@cf/moonshotai/kimi-k2.5'], 1);
  setFallbackEnabled(db, 'cloudflare', ['@cf/moonshotai/kimi-k2.5'], 1);
}
