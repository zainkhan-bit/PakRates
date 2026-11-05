// Fetches any OGRA publications we do not have yet and rebuilds docs/api/v1.
//
// A publication that fails verification is reported and left out. Good ones are
// still saved, and the run exits non-zero so the failure shows up in GitHub.

import fs from "node:fs";
import path from "node:path";
import { fetchPdf, fetchPublicationList, pause } from "../src/ogra.js";
import { readPublication } from "../src/parse.js";
import { buildCsv, buildLatest, mergeRecords, toRecord } from "../src/publish.js";

const API_DIR = "docs/api/v1";
const CACHE_DIR = ".cache/pdfs";
const HISTORY_FILE = path.join(API_DIR, "history.json");

const readHistory = () => (fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")) : []);

async function loadPdf(id) {
  const cached = path.join(CACHE_DIR, `${id}.pdf`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const bytes = await fetchPdf(id);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, bytes);
  await pause();
  return bytes;
}

function writeFiles(records) {
  fs.mkdirSync(API_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, `${JSON.stringify(records, null, 2)}\n`);
  fs.writeFileSync(path.join(API_DIR, "latest.json"), `${JSON.stringify(buildLatest(records), null, 2)}\n`);
  fs.writeFileSync(path.join(API_DIR, "history.csv"), buildCsv(records));
}

const history = readHistory();
const known = new Set(history.map((record) => record.id));
const list = await fetchPublicationList();
const missing = list.filter(({ id }) => !known.has(id));

const added = [];
const failed = [];
for (const { id, listedDate } of missing) {
  try {
    added.push(toRecord(id, await readPublication(await loadPdf(id))));
  } catch (error) {
    failed.push(`${id} (listed ${listedDate}): ${error.message}`);
  }
}

if (added.length > 0) writeFiles(mergeRecords(history, added));

console.log(`OGRA lists ${list.length}, we had ${history.length}, added ${added.length}.`);
if (failed.length > 0) {
  console.error(`Could not verify ${failed.length}:\n${failed.join("\n")}`);
  process.exitCode = 1;
}
