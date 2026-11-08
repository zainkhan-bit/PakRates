<h1 align="center">PakRates</h1>

<p align="center"><strong>Pakistan's official petrol and diesel prices, with every rupee explained.</strong></p>

<p align="center">
  <a href="https://zainkhan-bit.github.io/PakRates/"><img alt="Live petrol price" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fzainkhan-bit.github.io%2FPakRates%2Fapi%2Fv1%2Flatest.json&query=%24.petrol.price&prefix=Rs%20&label=petrol&color=2a78d6"></a>
  <a href="https://zainkhan-bit.github.io/PakRates/"><img alt="Live diesel price" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fzainkhan-bit.github.io%2FPakRates%2Fapi%2Fv1%2Flatest.json&query=%24.diesel.price&prefix=Rs%20&label=diesel&color=eb6834"></a>
  <a href="https://github.com/zainkhan-bit/PakRates/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/zainkhan-bit/PakRates/actions/workflows/test.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-0a6b45"></a>
</p>

<p align="center">
  <a href="https://zainkhan-bit.github.io/PakRates/"><strong>Open the live site</strong></a> ·
  <a href="#use-the-data"><strong>Use the free API</strong></a> ·
  <a href="https://zainkhan-bit.github.io/PakRates/api/v1/history.csv"><strong>Download the CSV</strong></a>
</p>

![PakRates showing the petrol price, its breakdown and price history](docs/preview.png)

## The receipt your petrol pump never prints

The news tells you the price changed. It rarely tells you why. OGRA publishes the full breakdown of every litre, but only as PDFs. PakRates turns those PDFs into data anyone can read and use.

One litre of petrol, effective 5 November 2026:

| Item | Rs |
|---|---:|
| Fuel cost | 225.49 |
| Freight and margins | 25.36 |
| Petroleum levy | 80.00 |
| Climate levy | 5.00 |
| Customs duty | 26.15 |
| Sales tax | 0.00 |
| **Total** | **362.00** |

Rs 111.15 of that litre, or 31%, was levies and customs duty.

## What you get

- **The price, explained.** Every petrol and diesel price comes with its full breakdown.
- **Free data.** JSON and CSV files, with no API key and no sign-up.
- **Price history.** Every OGRA publication since 21 July 2026.
- **Numbers you can check.** Each record links to its source PDF.

## Use the data

Base URL: `https://zainkhan-bit.github.io/PakRates/api/v1/`

| File | What it has |
|---|---|
| [`latest.json`](https://zainkhan-bit.github.io/PakRates/api/v1/latest.json) | Current prices, change from the previous publication, and breakdown |
| [`history.json`](https://zainkhan-bit.github.io/PakRates/api/v1/history.json) | Every published price |
| [`history.csv`](https://zainkhan-bit.github.io/PakRates/api/v1/history.csv) | The same history for spreadsheets |

**curl**

```bash
curl https://zainkhan-bit.github.io/PakRates/api/v1/latest.json
```

**JavaScript**

```js
const response = await fetch("https://zainkhan-bit.github.io/PakRates/api/v1/latest.json");
const { petrol, diesel } = await response.json();

console.log(petrol.price, diesel.price);
console.log(petrol.breakdown.petroleumLevy);
```

**Python**

```python
import requests

data = requests.get("https://zainkhan-bit.github.io/PakRates/api/v1/latest.json").json()

print(data["petrol"]["price"], data["diesel"]["price"])
```

<details>
<summary>Example response</summary>

```json
{
  "effectiveDate": "2026-11-05",
  "effectiveTime": "00:00",
  "currency": "PKR",
  "unit": "litre",
  "source": "https://www.ogra.org.pk/download/17955?lang=en",
  "petrol": {
    "price": 362,
    "breakdown": {
      "productCost": 225.49,
      "customsDuty": 26.15,
      "freightAndMargins": 25.36,
      "petroleumLevy": 80,
      "climateLevy": 5,
      "salesTax": 0,
      "roundingAdjustment": 0
    },
    "market": {
      "costAndFreightUsdPerBarrel": 136.97,
      "exchangeRatePkrPerUsd": 276.89
    },
    "previousPrice": 369.06,
    "change": -7.06
  },
  "diesel": {
    "...": "same shape as petrol"
  }
}
```

</details>

## How accuracy is protected

A wrong fuel price is worse than a missing one, so PakRates refuses to publish numbers it cannot verify.

1. **OGRA's formulas are recomputed.** Each PDF row has a formula such as `V={P+S+T+U}`. PakRates recalculates every one. If a layout change misaligns a column, the numbers stop adding up and the record is rejected.
2. **The total is checked a second way.** Rows are also found by label, and their sum must match the printed total.
3. **Failures are loud.** A rejected publication is left out and the update exits with an error.
4. **Every record links to its source PDF**, so anyone can check it.

## What the numbers mean

- **Price** is OGRA's maximum ex-depot price, excluding secondary freight. Pump prices can differ slightly by location.
- **productCost** is the landed cost at Karachi plus the exchange rate adjustment, minus any levy collected through refineries.
- **freightAndMargins** is IFEM plus the oil marketing company and dealer margins.
- **petroleumLevy** is the full levy OGRA lists, including any part collected through refineries.
- **roundingAdjustment** is the amount OGRA adds or removes to round the price to a whole rupee. It started on 7 November 2026 and is 0 before that.

The history starts on 21 July 2026 because that is as far back as OGRA's price publications go. The older OGRA notifications sampled so far (2019, 2024 and 2026) cover kerosene only.

## Run it yourself

Needs Node.js 20 or newer.

```bash
npm ci
npm test
npm run update
```

`npm run update` adds any new publications to `docs/api/v1`. The site is plain HTML in `docs/`.

`npm run sync` does the same, then commits and pushes any new data. A scheduled task on the maintainer's computer runs it, because OGRA's site returns HTTP 403 to GitHub's servers. GitHub Actions only runs the tests.

## Contributing

Ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

If PakRates is useful to you, a star helps other people find it.

## Data source and license

All prices come from the [Oil and Gas Regulatory Authority](https://www.ogra.org.pk/price-publications). PakRates is independent and is not affiliated with OGRA or the Government of Pakistan. OGRA's site asks that its content is not used to train AI models. PakRates does not do this, and please respect that request when reusing the data.

Code is under the [MIT License](LICENSE).
