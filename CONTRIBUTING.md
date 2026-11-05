# Contributing to PakRates

Thanks for helping. Ideas, bug reports and pull requests are all welcome.

## Good places to start

- Electricity tariffs and a bill calculator from NEPRA data
- Kerosene and light diesel oil prices
- An Urdu version of the site

## Run it locally

Needs Node.js 20 or newer.

```bash
npm ci
npm test
npm run update
```

To preview the site, serve the `docs` folder with any static server:

```bash
python -m http.server 8765 --directory docs
```

## Rules for pull requests

- **Never weaken a check to make a price pass.** If a PDF does not add up, find out why first.
- **Add a test.** If OGRA changes its PDF layout, add the new PDF to `test/fixtures` with a test.
- **Keep data sourced.** Every published number must link back to an official document.
- **Run `npm test`** before opening the pull request.
