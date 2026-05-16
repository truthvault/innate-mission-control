import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(source, /newOrderPalette/, 'PlanClient should centralise the new-order colour palette');
assert.match(source, /clayBg/, 'New-order palette should include a distinct clay background colour');
assert.match(source, /clayBorder/, 'New-order palette should include a matching clay border colour');
assert.match(source, /clayAccent/, 'New-order palette should include a stronger clay accent colour');
assert.match(source, /clayStripe/, 'Suggested day cards should include a stronger clay left accent stripe');
assert.match(source, /newOrderPalette\.clayBg/, 'New-order box/cards should use the shared clay background token');
assert.match(source, /newOrderPalette\.clayBorder/, 'New-order box/cards should use the shared clay border token');
assert.match(source, /newOrderPalette\.clayAccent/, 'New-order box/cards should use the shared clay accent token');

console.log('plan new-order colour tests passed');
