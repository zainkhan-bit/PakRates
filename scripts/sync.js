// Fetches new prices and pushes them to GitHub.
//
// This runs from a scheduled task on the maintainer's computer, because OGRA's
// site returns HTTP 403 to GitHub's servers. A missed day is not lost: the next
// run picks up every publication that is not in the history yet.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const CACHE_DIR = ".cache";
const LOG_FILE = `${CACHE_DIR}/sync.log`;
const DATA_DIR = "docs/api";

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, `${line}\n`);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function sync() {
  const branch = git("branch", "--show-current");
  if (branch !== "main") {
    log(`Skipped: on branch ${branch}, not main.`);
    return 0;
  }

  git("pull", "--ff-only", "--quiet");

  const update = spawnSync(process.execPath, ["scripts/update.js"], { encoding: "utf8" });
  log(`${update.stdout}${update.stderr}`.trim());

  // Good records are saved even when another publication failed verification.
  if (git("status", "--porcelain", DATA_DIR)) {
    git("add", DATA_DIR);
    git("commit", "--quiet", "-m", "Update fuel prices", "--", DATA_DIR);
    git("push", "--quiet");
    log("Pushed new prices.");
  } else {
    log("No new prices to push.");
  }
  return update.status;
}

try {
  process.exitCode = sync();
} catch (error) {
  log(`Failed: ${error.stderr?.trim() || error.message}`);
  process.exitCode = 1;
}
