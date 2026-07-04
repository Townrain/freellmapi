// Migration: cloudflare_model_update
// Created: 2026-07-04
//
// Cloudflare Workers AI model catalog update:
// - Remove kimi-k2.5 (deprecated by CF on 2026-05-30, now aliases to k2.6)
// - Fix namespace: @cf/deepseek-ai/ → @cf/deepseek/ (matches CF's actual catalog)
// - Fix namespace: @cf/ibm-granite/ → @cf/ibm/ (matches CF's actual catalog)
// - Add kimi-k2.7-code (active on CF, 1T params, 262K ctx)
// - Add glm-5.2 (active on CF since 2026-06-16, Z.ai's flagship agentic coding model)
//
// DOWN: reversible — re-adds k2.5, reverts namespace fixes, removes new models.

import type Database from 'better-sqlite3';

function normalizeFallbackOrder(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT id FROM fallback_config ORDER BY priority ASC
  `).all() as { id: number }[];
  const update = db.prepare('UPDATE fallback_config SET priority = ? WHERE id = ?');
  for (let i = 0; i < rows.length; i++) {
    update.run(i + 1, rows[i].id);
  }
}

export function up(db: Database.Database): void {
  const deleteModel = db.prepare(`DELETE FROM models WHERE platform = ? AND model_id = ?`);
  const deleteFallback = db.prepare(`
    DELETE FROM fallback_config WHERE model_db_id IN (
      SELECT id FROM models WHERE platform = ? AND model_id = ?
    )
  `);

  // ── 1) Remove deprecated kimi-k2.5 ──
  // Cloudflare changelog 2026-05-30: k2.5 aliases to k2.6.
  // Two rows for one backend wastes a fallback slot.
  const removals: Array<[string, string]> = [
    ['cloudflare', '@cf/moonshotai/kimi-k2.5'],
  ];
  const applyRemovals = db.transaction(() => {
    for (const [p, m] of removals) {
      deleteFallback.run(p, m);
      deleteModel.run(p, m);
    }
    normalizeFallbackOrder(db);
  });
  applyRemovals();

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

  // ── 3) Add new models ──
  // Cloudflare Workers AI — 10K Neurons/day shared free pool.
  const insert = db.prepare(`
    INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, size_label, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const additions: Array<[string, string, string, number, number, string, number | null, number | null, number | null, number | null, string, number | null]> = [
    // kimi-k2.7-code: 1T-param code-specialized variant. 262K ctx, vision + function calling.
    ['cloudflare', '@cf/moonshotai/kimi-k2.7-code',           'Kimi K2.7 Code (CF)',            2,  11, 'Frontier', null, null, null, null, '~10-20M', 262144],
    // glm-5.2: Z.ai's flagship agentic coding model. 262K ctx.
    ['cloudflare', '@cf/zai-org/glm-5.2',                    'GLM-5.2 (CF)',                   5,  11, 'Frontier', null, null, null, null, '~10-20M', 262144],
  ];
  const applyAdditions = db.transaction(() => {
    for (const a of additions) insert.run(...a);
    const missing = db.prepare(`
      SELECT m.id FROM models m
      LEFT JOIN fallback_config f ON m.id = f.model_db_id
      WHERE f.id IS NULL ORDER BY m.intelligence_rank ASC
    `).all() as { id: number }[];
    if (missing.length > 0) {
      const maxPriority = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config').get() as { mx: number }).mx;
      const addFb = db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');
      for (let i = 0; i < missing.length; i++) addFb.run(missing[i].id, maxPriority + i + 1);
    }
  });
  applyAdditions();
}

export function down(db: Database.Database): void {
  const deleteModel = db.prepare(`DELETE FROM models WHERE platform = ? AND model_id = ?`);
  const deleteFallback = db.prepare(`
    DELETE FROM fallback_config WHERE model_db_id IN (
      SELECT id FROM models WHERE platform = ? AND model_id = ?
    )
  `);

  // ── 1) Remove newly added models ──
  const removals: Array<[string, string]> = [
    ['cloudflare', '@cf/moonshotai/kimi-k2.7-code'],
    ['cloudflare', '@cf/zai-org/glm-5.2'],
  ];
  const applyRemovals = db.transaction(() => {
    for (const [p, m] of removals) {
      deleteFallback.run(p, m);
      deleteModel.run(p, m);
    }
    normalizeFallbackOrder(db);
  });
  applyRemovals();

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

  // ── 3) Re-add deprecated kimi-k2.5 ──
  const insert = db.prepare(`
    INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, size_label, rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const reAdds: Array<[string, string, string, number, number, string, number | null, number | null, number | null, number | null, string, number | null]> = [
    ['cloudflare', '@cf/moonshotai/kimi-k2.5', 'Kimi K2.5 (CF)', 3, 11, 'Frontier', null, null, null, null, '~10-20M', 262144],
  ];
  const applyReAdds = db.transaction(() => {
    for (const a of reAdds) insert.run(...a);
    const missing = db.prepare(`
      SELECT m.id FROM models m
      LEFT JOIN fallback_config f ON m.id = f.model_db_id
      WHERE f.id IS NULL ORDER BY m.intelligence_rank ASC
    `).all() as { id: number }[];
    if (missing.length > 0) {
      const maxPriority = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config').get() as { mx: number }).mx;
      const addFb = db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');
      for (let i = 0; i < missing.length; i++) addFb.run(missing[i].id, maxPriority + i + 1);
    }
  });
  applyReAdds();
}
