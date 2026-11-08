import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parsePublicationList } from "../src/ogra.js";
import { buildCsv, buildLatest, mergeRecords } from "../src/publish.js";

const breakdown = {
  productCost: 200,
  customsDuty: 20,
  freightAndMargins: 25,
  petroleumLevy: 50,
  climateLevy: 5,
  salesTax: 0,
  roundingAdjustment: 0,
};
const record = (id, effectiveDate, petrol, diesel) => ({
  id,
  effectiveDate,
  effectiveTime: "00:00",
  source: `https://example.test/${id}`,
  petrol: { price: petrol, breakdown },
  diesel: { price: diesel, breakdown },
});

test("reads English links from the OGRA list, skipping Urdu ones", () => {
  const html = `
    <p>Price Publications Effective Dated November 04, 2026</p></div>
    <a href="https://www.ogra.org.pk/download/17909?lang=en">EN</a>
    <a href="https://www.ogra.org.pk/download/17910?lang=ur">UR</a>
    <p>,Price Publication Effective Dated July 21, 2026</p></div>
    <a href="https://www.ogra.org.pk/download/14672?lang=en">EN</a>`;
  assert.deepEqual(parsePublicationList(html), [
    { id: 17909, listedDate: "2026-11-04" },
    { id: 14672, listedDate: "2026-07-21" },
  ]);
});

test("merge sorts by date and a reissued date keeps the later upload", () => {
  const merged = mergeRecords(
    [record(2, "2026-02-01", 300, 310), record(1, "2026-01-01", 290, 300)],
    [record(3, "2026-02-01", 305, 315)],
  );
  assert.deepEqual(merged.map((item) => item.id), [1, 3]);
});

test("latest reports the change from the previous publication", () => {
  const latest = buildLatest([record(1, "2026-01-01", 300.1, 310), record(2, "2026-01-02", 295.05, 310)]);
  assert.equal(latest.effectiveDate, "2026-01-02");
  assert.equal(latest.petrol.previousPrice, 300.1);
  assert.equal(latest.petrol.change, -5.05);
  assert.equal(latest.diesel.change, 0);
});

test("latest has no change for the very first publication", () => {
  const latest = buildLatest([record(1, "2026-01-01", 300, 310)]);
  assert.equal(latest.petrol.previousPrice, null);
  assert.equal(latest.petrol.change, null);
});

test("csv has one row per record and matching columns", () => {
  const [header, row] = buildCsv([record(1, "2026-01-01", 300, 310)]).trim().split("\n");
  assert.equal(header.split(",").length, row.split(",").length);
  assert.match(row, /^2026-01-01,300,200,/);
});

test("published history is ordered and every record adds up", () => {
  const history = JSON.parse(fs.readFileSync("docs/api/v1/history.json", "utf8"));
  assert.ok(history.length > 0);
  history.forEach((item, index) => {
    if (index > 0) assert.ok(item.effectiveDate > history[index - 1].effectiveDate, item.effectiveDate);
    for (const { price, breakdown: parts } of [item.petrol, item.diesel]) {
      const sum = Object.values(parts).reduce((total, value) => total + value, 0);
      assert.ok(Math.abs(sum - price) < 0.011, `${item.effectiveDate}: ${sum} vs ${price}`);
    }
  });
});
