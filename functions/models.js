// Centralized Anthropic model registry.
//
// Single source of truth for every Anthropic model alias used by Cloud
// Functions in this codebase. When Anthropic deprecates an alias (as
// happened with claude-sonnet-4-20250514 in v1.19.989, breaking the
// supplier portal extraction), the fix is to bump the constants here and
// redeploy — instead of grepping every model literal across the codebase.
//
// The matching client-side registry lives near the top of src/app.jsx
// as `ANTHROPIC_MODELS` — keep both in sync.
//
// MONITORED_MODELS is the list the daily synthetic monitor (v1.19.990,
// `monitorAnthropicModels` Cloud Function) probes every morning. Any model
// alias added here gets automatic deprecation detection — bump the
// constant and the monitor catches it on the next run.

const ANTHROPIC_MODELS = {
  // Vision-heavy reasoning: BOM extraction, layout/schematic analysis.
  OPUS: 'claude-opus-4-6',
  // Mid-tier balanced cost/accuracy: supplier-portal extraction, validation,
  // pricing analysis, BC item-browser locate, customer-review summary.
  SONNET: 'claude-sonnet-4-6',
  // Fast/cheap: page-type detection, BC item-card lookup, supplier quote
  // confirmation prompts. Two aliases — the dated one is the stable pin
  // (most callers); the un-dated alias is currently identical but kept
  // separate so an Anthropic split (e.g. dated → 4.5.x) is detectable.
  HAIKU: 'claude-haiku-4-5',
  HAIKU_DATED: 'claude-haiku-4-5-20251001',
};

// Models the synthetic-monitor Cloud Function probes daily. Order matters:
// listed earlier = probed first, so a global Anthropic outage shows up on
// the first model rather than after a long timeout cascade.
const MONITORED_MODELS = [
  ANTHROPIC_MODELS.OPUS,
  ANTHROPIC_MODELS.SONNET,
  ANTHROPIC_MODELS.HAIKU,
  ANTHROPIC_MODELS.HAIKU_DATED,
];

module.exports = { ANTHROPIC_MODELS, MONITORED_MODELS };
