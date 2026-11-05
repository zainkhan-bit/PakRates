// Renders the page from the same history.json the public API serves.

const SEGMENTS = [
  {
    name: "Product cost",
    color: "--seg-1",
    amount: (b) => b.productCost,
    detail: () => "Fuel landed at Karachi, with exchange rate adjustment",
  },
  {
    name: "Freight and margins",
    color: "--seg-2",
    amount: (b) => b.freightAndMargins,
    detail: () => "Inland freight, plus oil company and dealer margins",
  },
  {
    name: "Levies and sales tax",
    color: "--seg-3",
    amount: (b) => b.petroleumLevy + b.climateLevy + b.salesTax,
    detail: (b) =>
      `Petroleum levy ${money(b.petroleumLevy)}, climate levy ${money(b.climateLevy)}, sales tax ${money(b.salesTax)}`,
  },
  {
    name: "Customs duty",
    color: "--seg-4",
    amount: (b) => b.customsDuty,
    detail: () => "Charged on imported fuel",
  },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);

const plain = (value) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value) => `Rs ${plain(value)}`;
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);

function formatDate(iso, options = { day: "numeric", month: "short", year: "numeric" }) {
  return toDate(iso).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

// Tooltip

const tooltip = $("tooltip");

function showTooltip(x, y, title, rows) {
  tooltip.replaceChildren(element("div", "title", title));
  for (const { value, label, color } of rows) {
    const row = element("div", "row");
    const key = element("span", "line-key");
    key.style.setProperty("--color", `var(${color})`);
    row.append(key, element("strong", "", value), element("span", "", label));
    tooltip.append(row);
  }
  tooltip.hidden = false;
  const { width, height } = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x + 14), innerWidth - width - 8);
  const top = y - height - 12 > 8 ? y - height - 12 : y + 16;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

const hideTooltip = () => {
  tooltip.hidden = true;
};

// Headline prices

function renderPrice(product, latest, previous) {
  const { price } = latest[product];
  $(`${product}-price`).textContent = plain(price);
  if (!previous) return;
  const change = Math.round((price - previous[product].price) * 100) / 100;
  const since = `from ${formatDate(previous.effectiveDate, { day: "numeric", month: "short" })}`;
  $(`${product}-change`).textContent =
    change === 0 ? `No change ${since}` : `${change > 0 ? "▲ Up" : "▼ Down"} ${money(Math.abs(change))} ${since}`;
}

// Breakdown

function renderBreakdown(product, record) {
  const { price, breakdown } = record[product];
  const government = breakdown.petroleumLevy + breakdown.climateLevy + breakdown.salesTax + breakdown.customsDuty;
  const share = Math.round((government / price) * 100);

  const headline = $("breakdown-headline");
  headline.replaceChildren(
    element("strong", "", `${money(government)} of every litre of ${product}`),
    ` goes to levies, tax and customs duty. That is ${share}% of the ${money(price)} price.`,
  );

  const stack = $("stack");
  const legend = $("legend");
  stack.replaceChildren();
  legend.replaceChildren();
  stack.setAttribute("aria-label", `${product} price breakdown. The values are listed below.`);

  for (const segment of SEGMENTS) {
    const amount = segment.amount(breakdown);
    const percent = Math.round((amount / price) * 100);

    const bar = element("div", "segment");
    bar.style.flexGrow = amount;
    bar.style.setProperty("--color", `var(${segment.color})`);
    bar.tabIndex = 0;
    const describe = (x, y) =>
      showTooltip(x, y, segment.name, [{ value: money(amount), label: `${percent}%`, color: segment.color }]);
    bar.addEventListener("pointermove", (event) => describe(event.clientX, event.clientY));
    bar.addEventListener("pointerleave", hideTooltip);
    bar.addEventListener("focus", () => {
      const box = bar.getBoundingClientRect();
      describe(box.left + box.width / 2, box.top);
    });
    bar.addEventListener("blur", hideTooltip);
    stack.append(bar);

    const item = element("li");
    const swatch = element("span", "swatch");
    swatch.style.setProperty("--color", `var(${segment.color})`);
    item.append(
      swatch,
      element("span", "name", segment.name),
      element("span", "value", money(amount)),
      element("span", "detail", segment.detail(breakdown)),
    );
    legend.append(item);
  }

  // Government rows are the last two segments, so the bracket lines up under them.
  const others = element("div");
  others.style.flexGrow = price - government;
  const bracket = element("div", "government", `Government ${share}%`);
  bracket.style.flexGrow = government;
  $("bracket").replaceChildren(others, bracket);
}

// History chart

function niceRange(values) {
  const step = Math.max(...values) - Math.min(...values) > 120 ? 40 : 20;
  const low = Math.floor(Math.min(...values) / step) * step;
  const high = Math.ceil(Math.max(...values) / step) * step;
  const ticks = [];
  for (let tick = low; tick <= high; tick += step) ticks.push(tick);
  return { low, high, ticks };
}

function monthStarts(first, last) {
  const months = [];
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function drawHistory(root, records) {
  const width = root.clientWidth;
  if (width === 0) return;
  const height = width < 520 ? 260 : 320;
  const margin = { top: 12, right: 66, bottom: 28, left: 36 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const prices = records.flatMap((record) => [record.petrol.price, record.diesel.price]);
  const { low, high, ticks } = niceRange(prices);
  const first = toDate(records[0].effectiveDate);
  const last = toDate(records.at(-1).effectiveDate);
  const xOf = (date) => margin.left + ((date - first) / (last - first)) * plotWidth;
  const yOf = (value) => margin.top + (1 - (value - low) / (high - low)) * plotHeight;

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    height,
    role: "img",
    tabindex: 0,
    "aria-label": "Line chart of petrol and diesel prices. Use the left and right arrow keys to move between dates.",
  });

  for (const tick of ticks) {
    const y = yOf(tick);
    chart.append(
      svg("line", { class: "grid", x1: margin.left, x2: margin.left + plotWidth, y1: y, y2: y }),
      svg("text", { x: margin.left - 8, y: y + 4, "text-anchor": "end" }, tick),
    );
  }

  for (const month of monthStarts(first, last)) {
    const label = month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    chart.append(svg("text", { x: xOf(month), y: height - 8, "text-anchor": "middle" }, label));
  }

  for (const product of ["petrol", "diesel"]) {
    const path = records
      .map((record, index) => {
        const x = xOf(toDate(record.effectiveDate)).toFixed(1);
        return `${index === 0 ? "M" : "L"}${x} ${yOf(record[product].price).toFixed(1)}`;
      })
      .join("");
    const end = records.at(-1)[product].price;
    chart.append(
      svg("path", { class: `series ${product}`, d: path }),
      svg("circle", { class: `dot ${product}`, cx: xOf(last), cy: yOf(end), r: 4 }),
      svg("text", { class: "end-label", x: xOf(last) + 10, y: yOf(end) + 4 }, plain(end)),
    );
  }

  const crosshair = svg("line", { class: "crosshair", y1: margin.top, y2: margin.top + plotHeight, visibility: "hidden" });
  const markers = ["petrol", "diesel"].map((product) => ({
    product,
    node: svg("circle", { class: `dot ${product}`, r: 4, visibility: "hidden" }),
  }));
  chart.append(crosshair, ...markers.map((marker) => marker.node));

  let active = records.length - 1;

  function select(index, pointer) {
    active = Math.max(0, Math.min(records.length - 1, index));
    const record = records[active];
    const x = xOf(toDate(record.effectiveDate));
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("visibility", "visible");
    for (const { product, node } of markers) {
      node.setAttribute("cx", x);
      node.setAttribute("cy", yOf(record[product].price));
      node.setAttribute("visibility", "visible");
    }
    const box = chart.getBoundingClientRect();
    showTooltip(pointer?.x ?? box.left + x, pointer?.y ?? box.top + margin.top + 40, formatDate(record.effectiveDate), [
      { value: money(record.diesel.price), label: "Diesel", color: "--diesel" },
      { value: money(record.petrol.price), label: "Petrol", color: "--petrol" },
    ]);
  }

  function clear() {
    crosshair.setAttribute("visibility", "hidden");
    for (const { node } of markers) node.setAttribute("visibility", "hidden");
    hideTooltip();
  }

  function nearestIndex(clientX) {
    const x = clientX - chart.getBoundingClientRect().left;
    let best = 0;
    records.forEach((record, index) => {
      const distance = Math.abs(xOf(toDate(record.effectiveDate)) - x);
      if (distance < Math.abs(xOf(toDate(records[best].effectiveDate)) - x)) best = index;
    });
    return best;
  }

  chart.addEventListener("pointermove", (event) =>
    select(nearestIndex(event.clientX), { x: event.clientX, y: event.clientY }),
  );
  chart.addEventListener("pointerleave", clear);
  chart.addEventListener("focus", () => select(active));
  chart.addEventListener("blur", clear);
  chart.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    select(active + (event.key === "ArrowRight" ? 1 : -1));
  });

  root.replaceChildren(chart);
}

function renderTable(records) {
  const rows = [...records].reverse().map((record) => {
    const row = element("tr");
    const source = element("a", "", "PDF");
    source.href = record.source;
    source.rel = "noopener";
    const link = element("td");
    link.append(source);
    row.append(
      element("td", "", formatDate(record.effectiveDate)),
      element("td", "", plain(record.petrol.price)),
      element("td", "", plain(record.diesel.price)),
      link,
    );
    return row;
  });
  $("table-body").replaceChildren(...rows);
}

function renderApi() {
  const base = new URL("api/v1/", document.baseURI).href;
  $("example").textContent = [
    `const response = await fetch("${base}latest.json");`,
    "const { petrol, diesel } = await response.json();",
    "",
    "console.log(petrol.price, diesel.price);",
    "console.log(petrol.breakdown.petroleumLevy);",
  ].join("\n");
}

function linkRepository() {
  const [owner] = location.hostname.split(".github.io");
  const [repository] = location.pathname.split("/").filter(Boolean);
  if (!location.hostname.endsWith(".github.io") || !repository) return;
  const link = $("repo-link");
  link.href = `https://github.com/${owner}/${repository}`;
  link.hidden = false;
}

async function start() {
  linkRepository();
  renderApi();

  const response = await fetch("api/v1/history.json");
  if (!response.ok) throw new Error(`history.json returned ${response.status}`);
  const records = await response.json();
  const latest = records.at(-1);
  const previous = records.at(-2);

  renderPrice("petrol", latest, previous);
  renderPrice("diesel", latest, previous);
  $("effective-date").textContent = formatDate(latest.effectiveDate);
  $("source-link").href = latest.source;
  $("history-range").textContent =
    `${records.length} official publications, ${formatDate(records[0].effectiveDate)} to ${formatDate(latest.effectiveDate)}. Rs per litre.`;

  renderBreakdown("petrol", latest);
  const buttons = document.querySelectorAll(".toggle button");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
      renderBreakdown(button.dataset.product, latest);
    });
  }

  const chart = $("chart");
  new ResizeObserver(() => drawHistory(chart, records)).observe(chart);
  renderTable(records);
}

start().catch((error) => {
  console.error(error);
  document.querySelector(".lede").textContent = "Prices could not be loaded. Please try again shortly.";
});
