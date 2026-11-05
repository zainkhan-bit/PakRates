// Reads an OGRA price publication PDF into structured rows.
//
// Every row in the PDF carries a formula letter (A, B, C={A+B}, ...), so the
// parser recomputes each formula from the extracted values. If a layout change
// ever misaligns a column, the numbers stop adding up and parsing fails rather
// than publishing a wrong price.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Titles come as "PETROL (MS) Price Effective 25 September 2026, 00:00 hours"
// and "Petrol (MS) Price Effective November 04, 2026, 00:00 hours".
const TITLE = /(petrol|diesel)\s*\((?:MS|HSD)\)\s*Price Effective\s+(.+?),?\s*(\d{1,2}:\d{2})\s*hours/i;
const DATE_HEADER = /^\d{1,2}-[A-Za-z]{3}-\d{2,4}\b/;
const NUMBER = /^-?\d[\d,]*(?:\.\d+)?$/;
const FORMULA = /^([A-Z])(?:=[{[(]?([A-Z0-9+\-*/]+)[}\])]?)?$/;

// OGRA rounds to two decimals, so a sum of several rounded rows can drift by a
// few paisa from the printed total.
const TOLERANCE = 0.03;
const ROW_REACH = 6;
const LABEL_REACH = 9;

export class ParseError extends Error {}

function toItems(content) {
  return content.items
    .filter((item) => item.str.trim())
    .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }));
}

function findColumns(items) {
  const unit = items.find((item) => item.text === "Unit");
  const value = items.find((item) => DATE_HEADER.test(item.text));
  const explanation = items.find((item) => item.text.startsWith("Formula Explanation"));
  if (!unit || !value) throw new ParseError("Could not find the table header");
  // Some PDFs merge the date and "Formula Explanation" into one header cell.
  return { unit: unit.x, value: value.x, explanation: explanation?.x ?? value.x + 30 };
}

function toRows(items) {
  const columns = findColumns(items);
  const inLabel = items.filter((item) => item.x < columns.unit - 2);
  const inFormula = items.filter((item) => item.x > columns.unit + 25 && item.x < columns.value - 5);
  const inValue = items.filter(
    (item) => item.x >= columns.value - 8 && item.x < columns.explanation - 2 && NUMBER.test(item.text),
  );

  return inValue
    .map((value) => {
      // The formula cell can arrive split, as "U", "=", "[R+S+T]".
      const formula = inFormula
        .filter((item) => Math.abs(item.y - value.y) <= ROW_REACH)
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join("")
        .replace(/\s/g, "");
      const match = formula.match(FORMULA);
      if (!match) throw new ParseError(`No formula letter beside value ${value.text}: "${formula}"`);
      const label = inLabel
        .filter((item) => Math.abs(item.y - value.y) <= LABEL_REACH)
        .sort((a, b) => b.y - a.y)
        .map((item) => item.text)
        .join(" ");
      return {
        letter: match[1],
        expression: match[2],
        label,
        value: Number(value.text.replaceAll(",", "")),
      };
    })
    .sort((a, b) => a.letter.localeCompare(b.letter));
}

// Evaluates "C*D/E" or "L+M+N+O" without eval: the PDF is untrusted input.
function evaluate(expression, values) {
  const read = (token) => (/^\d+$/.test(token) ? Number(token) : (values[token] ?? NaN));
  let total = 0;
  for (const [, sign, term] of expression.matchAll(/([+-]?)([^+-]+)/g)) {
    const [first, ...rest] = term.split(/(?=[*/])/);
    let product = read(first);
    for (const step of rest) {
      product = step[0] === "*" ? product * read(step.slice(1)) : product / read(step.slice(1));
    }
    total += sign === "-" ? -product : product;
  }
  return total;
}

// Some diesel PDFs price the product at a refinery/import weighted average,
// given in a note under the table, so their import row differs from its formula.
function findWeightedAverage(items) {
  const label = items.find((item) => item.text.startsWith("Weighted Average Price"));
  if (!label) return undefined;
  const value = items.find((item) => Math.abs(item.y - label.y) <= ROW_REACH && NUMBER.test(item.text));
  return value && Number(value.text.replaceAll(",", ""));
}

export function verifyFormulas(rows, context, weightedAverage) {
  const values = Object.fromEntries(rows.map((row) => [row.letter, row.value]));
  let checked = 0;
  for (const row of rows) {
    if (!row.expression) continue;
    const expected = evaluate(row.expression, values);
    // OGRA has left formulas pointing at rows it removed (W={U+V} on
    // 2026-11-04), so these are skipped here. summarise() still checks the total.
    if (Number.isNaN(expected)) continue;
    if (row.value === weightedAverage) {
      checked += 1;
      continue;
    }
    if (Math.abs(expected - row.value) > TOLERANCE) {
      throw new ParseError(
        `${context}: ${row.letter}={${row.expression}} should be ${expected.toFixed(2)}, PDF says ${row.value}`,
      );
    }
    checked += 1;
  }
  return checked;
}

function toIsoDate(text) {
  const date = new Date(`${text.replace(/\s+/g, " ")} UTC`);
  if (Number.isNaN(date.getTime())) throw new ParseError(`Bad effective date: ${text}`);
  return date.toISOString().slice(0, 10);
}

function pick(rows, pattern, context) {
  const row = rows.find((candidate) => pattern.test(candidate.label));
  if (!row) throw new ParseError(`${context}: no row matching ${pattern}`);
  return row.value;
}

const round = (value) => Math.round(value * 100) / 100;

// Turns one product's rows into the fields we publish. Finding rows by label
// gives a second check that does not rely on OGRA's formula letters.
export function summarise({ date, time, rows }, product) {
  const context = `${product} ${date}`;
  const need = (pattern) => pick(rows, pattern, context);
  const optional = (pattern) => rows.find((row) => pattern.test(row.label))?.value ?? 0;

  const total = need(/^Total (Petrol|Diesel) Price/i);
  const beforeLevies = need(/^Price before PL/i);
  const petroleumLevy = need(/^Petroleum Levy \(PL\)$/i);
  const levyThroughRefineries = optional(/through Refineries/i);
  const climateLevy = optional(/Climate Support Levy/i);
  const salesTax = need(/^Sales Tax/i);

  const summed = beforeLevies + petroleumLevy + levyThroughRefineries + climateLevy + salesTax;
  if (Math.abs(summed - total) > TOLERANCE) {
    throw new ParseError(`${context}: components add up to ${summed.toFixed(2)}, total says ${total}`);
  }

  const customsDuty = need(/^Customs Duty/i);
  const freightAndMargins = round(need(/^IFEM/i) + need(/^OMC.?s Margin/i) + need(/^Dealer.?s Margin/i));

  return {
    date,
    time,
    price: total,
    breakdown: {
      // Levy collected through refineries sits inside the import price, so it is
      // moved out of product cost to show the full levy OGRA lists.
      productCost: round(total - customsDuty - freightAndMargins - petroleumLevy - climateLevy - salesTax),
      customsDuty,
      freightAndMargins,
      petroleumLevy,
      climateLevy,
      salesTax,
    },
    market: {
      costAndFreightUsdPerBarrel: need(/^Cost & Freight$/i),
      exchangeRatePkrPerUsd: need(/Exchange Rate$/i),
    },
  };
}

export async function readPublication(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const pdf = await task.promise;
  const products = {};
  try {
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const items = toItems(await (await pdf.getPage(number)).getTextContent());
      const title = items.map((item) => item.text).join(" ").match(TITLE);
      if (!title) continue;
      const [, product, date, time] = title;
      const rows = toRows(items);
      const checked = verifyFormulas(rows, `${product} ${date}`, findWeightedAverage(items));
      if (checked < 5) throw new ParseError(`${product} ${date}: only ${checked} formulas found`);
      products[product.toLowerCase()] = { date: toIsoDate(date), time: time.padStart(5, "0"), rows };
    }
  } finally {
    await task.destroy();
  }
  return products;
}
