import assert from 'node:assert/strict';
import { KIE_CATALOG, SUPPORTED_MODELS } from '../src/types';

const today = new Date().toISOString().slice(0, 10);
const maxAgeDays = 45;

for (const entry of KIE_CATALOG) {
  const model = SUPPORTED_MODELS.find((item) => item.id === entry.id && item.category === entry.category);
  assert.ok(model, `Catalog entry has no model: ${entry.category}:${entry.id}`);
  assert.ok(entry.sourceUrl.startsWith('https://kie.ai/'), `Invalid Kie source URL: ${entry.id}`);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedAt), `Invalid verification date: ${entry.id}`);
  assert.ok(entry.verifiedAt <= today, `Verification date is in the future: ${entry.id}`);
  if (entry.requiresCreditEstimate) {
    assert.ok(model.creditEstimator, `Missing credit estimate: ${entry.category}:${entry.id}`);
  }

  const ageDays = Math.floor((Date.parse(today) - Date.parse(entry.verifiedAt)) / 86_400_000);
  assert.ok(ageDays <= maxAgeDays, `Catalog entry is stale (${ageDays} days): ${entry.category}:${entry.id}`);
}

console.log(`Kie catalog checks passed (${KIE_CATALOG.length} reviewed entries).`);
