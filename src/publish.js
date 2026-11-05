// Turns parsed publications into the files served at docs/api/v1.

import { downloadUrl } from "./ogra.js";
import { summarise } from "./parse.js";

const PRODUCTS = ["petrol", "diesel"];
const CSV_FIELDS = ["productCost", "customsDuty", "freightAndMargins", "petroleumLevy", "climateLevy", "salesTax"];

export function toRecord(id, publication) {
  const [petrol, diesel] = PRODUCTS.map((product) => {
    if (!publication[product]) throw new Error(`Publication ${id} has no ${product} page`);
    return summarise(publication[product], product);
  });
  if (petrol.date !== diesel.date) {
    throw new Error(`Publication ${id} has mismatched dates: ${petrol.date}, ${diesel.date}`);
  }
  const product = ({ price, breakdown, market }) => ({ price, breakdown, market });
  return {
    id,
    effectiveDate: petrol.date,
    effectiveTime: petrol.time,
    source: downloadUrl(id),
    petrol: product(petrol),
    diesel: product(diesel),
  };
}

// Oldest first. If OGRA reissues a date, the later upload wins.
export function mergeRecords(existing, incoming) {
  const byDate = new Map();
  for (const record of [...existing, ...incoming].sort((a, b) => a.id - b.id)) {
    byDate.set(record.effectiveDate, record);
  }
  return [...byDate.values()].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function buildLatest(records) {
  const latest = records.at(-1);
  const previous = records.at(-2);
  const withChange = (product) => {
    const before = previous?.[product].price ?? null;
    const change = before === null ? null : Math.round((latest[product].price - before) * 100) / 100;
    return { ...latest[product], previousPrice: before, change };
  };
  return {
    effectiveDate: latest.effectiveDate,
    effectiveTime: latest.effectiveTime,
    currency: "PKR",
    unit: "litre",
    source: latest.source,
    petrol: withChange("petrol"),
    diesel: withChange("diesel"),
  };
}

export function buildCsv(records) {
  const fields = PRODUCTS.flatMap((product) => [
    `${product}_price`,
    ...CSV_FIELDS.map((field) => `${product}_${field}`),
  ]);
  const rows = records.map((record) =>
    [
      record.effectiveDate,
      ...PRODUCTS.flatMap((product) => [
        record[product].price,
        ...CSV_FIELDS.map((field) => record[product].breakdown[field]),
      ]),
      record.source,
    ].join(","),
  );
  return `${["date", ...fields, "source"].join(",")}\n${rows.join("\n")}\n`;
}
