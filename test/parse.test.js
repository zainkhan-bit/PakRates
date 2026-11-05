import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ParseError, readPublication, summarise, verifyFormulas } from "../src/parse.js";
import { toRecord } from "../src/publish.js";

const load = (id) => readPublication(fs.readFileSync(`test/fixtures/${id}.pdf`));

test("reads the latest format, where levy is split through refineries", async () => {
  const record = toRecord(17909, await load(17909));
  assert.equal(record.effectiveDate, "2026-11-04");
  assert.equal(record.effectiveTime, "00:00");
  assert.equal(record.petrol.price, 369.06);
  assert.equal(record.diesel.price, 391.52);
  assert.deepEqual(record.petrol.breakdown, {
    productCost: 232.55,
    customsDuty: 26.15,
    freightAndMargins: 25.36,
    petroleumLevy: 80,
    climateLevy: 5,
    salesTax: 0,
  });
  assert.deepEqual(record.petrol.market, { costAndFreightUsdPerBarrel: 141.01, exchangeRatePkrPerUsd: 276.91 });
});

test("reads a formula cell that arrives split across items", async () => {
  const record = toRecord(17871, await load(17871));
  assert.equal(record.effectiveDate, "2026-11-03");
  assert.equal(record.petrol.price, 374.51);
  assert.equal(record.diesel.price, 395.2);
});

test("reads an upper case title and a merged header cell", async () => {
  const record = toRecord(16677, await load(16677));
  assert.equal(record.effectiveDate, "2026-09-26");
  assert.equal(record.petrol.price, 391.3);
  assert.equal(record.diesel.price, 408.53);
});

test("accepts a diesel import price set by OGRA's weighted average note", async () => {
  const record = toRecord(15243, await load(15243));
  assert.equal(record.effectiveDate, "2026-08-12");
  assert.equal(record.diesel.price, 382.25);
});

test("breakdown always adds up to the price", async () => {
  for (const id of [17909, 17871, 16677, 15243]) {
    const record = toRecord(id, await load(id));
    for (const { price, breakdown } of [record.petrol, record.diesel]) {
      const sum = Object.values(breakdown).reduce((total, value) => total + value, 0);
      assert.ok(Math.abs(sum - price) < 0.011, `${id}: ${sum} vs ${price}`);
    }
  }
});

test("rejects a value that breaks a formula", () => {
  const rows = [
    { letter: "A", value: 100 },
    { letter: "B", value: 20 },
    { letter: "C", expression: "A+B", value: 125 },
  ];
  assert.throws(() => verifyFormulas(rows, "test"), ParseError);
});

test("the weighted average exception only covers the listed value", () => {
  const rows = [
    { letter: "A", value: 100 },
    { letter: "B", expression: "A+1", value: 90 },
  ];
  assert.throws(() => verifyFormulas(rows, "test", 89), ParseError);
  assert.equal(verifyFormulas(rows, "test", 90), 1);
});

test("skips a formula that points at a removed row", () => {
  const rows = [
    { letter: "V", value: 0 },
    { letter: "W", expression: "U+V", value: 391.52 },
  ];
  assert.equal(verifyFormulas(rows, "test"), 0);
});

test("rejects a total that its components do not reach", async () => {
  const { petrol } = await load(17909);
  const rows = petrol.rows.map((row) => (row.label.startsWith("Total") ? { ...row, value: 400 } : row));
  assert.throws(() => summarise({ ...petrol, rows }, "petrol"), ParseError);
});
