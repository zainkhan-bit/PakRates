// Talks to ogra.org.pk: lists the published price PDFs and downloads them.

const LIST_URL = "https://www.ogra.org.pk/price-publications";
const USER_AGENT = "PakRatesBot/0.1 (open data project; not used for AI training)";
const REQUEST_GAP_MS = 1000;

export function downloadUrl(id) {
  return `https://www.ogra.org.pk/download/${id}?lang=en`;
}

// Each list entry is a <p> title followed by its English and Urdu PDF links.
export function parsePublicationList(html) {
  const entry = /<p>[^<]*Effective Dated\s+([A-Za-z]+ \d{1,2}, \d{4})[^<]*<\/p>[\s\S]{0,600}?\/download\/(\d+)\?lang=en/g;
  const found = new Map();
  for (const [, label, id] of html.matchAll(entry)) {
    const date = new Date(`${label} UTC`);
    if (Number.isNaN(date.getTime())) throw new Error(`Bad date in OGRA list: "${label}"`);
    found.set(Number(id), { id: Number(id), listedDate: date.toISOString().slice(0, 10) });
  }
  return [...found.values()].sort((a, b) => b.id - a.id);
}

async function request(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

export async function fetchPublicationList() {
  const html = await (await request(LIST_URL)).text();
  const list = parsePublicationList(html);
  if (list.length === 0) throw new Error("OGRA list page had no publications. Has its layout changed?");
  return list;
}

export async function fetchPdf(id) {
  const response = await request(downloadUrl(id));
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error(`Download ${id} is not a PDF. The site may be blocking this request.`);
  }
  return bytes;
}

export const pause = () => new Promise((done) => setTimeout(done, REQUEST_GAP_MS));
