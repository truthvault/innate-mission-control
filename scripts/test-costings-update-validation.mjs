import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("../lib/costings/update-costings.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const tempDir = await mkdtemp(join(tmpdir(), "costings-validation-"));
const tempModule = join(tempDir, "update-costings-validation.ts");
await writeFile(tempModule, source.replace(/^import .*fetch-costings.*;\n/, ""), "utf8");
const moduleUrl = pathToFileURL(tempModule).href;
const { validateCostingUpdatePayload } = await import(moduleUrl);

const uuid = "11111111-1111-4111-8111-111111111111";

assert.equal(validateCostingUpdatePayload({ kind: "material", id: uuid, fields: { name: " Rimu slab " } }).ok, true);
assert.equal(validateCostingUpdatePayload({ kind: "material", id: uuid, fields: { madeUpField: "no" } }).ok, false);
assert.equal(validateCostingUpdatePayload({ kind: "productLine", id: uuid, fields: { quantity: "" } }).ok, true);
assert.equal(validateCostingUpdatePayload({ kind: "productLine", id: uuid, fields: { unitCostExGst: "not a number" } }).ok, false);
assert.equal(validateCostingUpdatePayload({ kind: "supplier", id: uuid, fields: { supplierType: "timber" } }).ok, true);
assert.equal(validateCostingUpdatePayload({ kind: "supplier", id: uuid, fields: { supplierType: "random" } }).ok, false);
assert.equal(validateCostingUpdatePayload({ kind: "currentPrice", id: uuid, fields: { approvedUnitCostExGst: "" } }).ok, false);

console.log("Costings update validation checks passed");
