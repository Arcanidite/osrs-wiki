# OSRS Wiki — Dev KB

Running log of features, integrations, and decisions. Add an entry when something non-obvious is added.

---

## Structure

| Path | Purpose |
|---|---|
| `_data/catalog.json` | Content registry — entries, categories, API source |
| `_data/site.yml` | Site-level config (name, tagline, logo, api_endpoint) |
| `_data/nav.yml` | Nav links |
| `assets/js/catalog.js` | Runtime hydration — fetches catalog, binds to DOM |
| `assets/css/main.css` | Base styles |
| `_layouts/default.html` | Shell layout |
| `_includes/catalog-grid.html` | Entry grid partial, accepts `source` override |
| `_includes/header.html` | Nav + search bar |

---

## Links

- **Repo**: https://github.com/Arcanidite/osrs-wiki
- **Pages**: https://arcanidite.github.io/osrs-wiki/

---

## Features

### 2026-04-22 — Initial scaffold
- Jekyll + GitHub Pages (minima base, `github-pages` gem)
- Headless/data-driven: all content sourced from `_data/` or a live API endpoint — nothing baked into HTML
- `catalog.js` fetches at runtime, hydrates categories, entry grid, and search
- To point at a live API: set `api_endpoint` in `_data/site.yml` — the JS picks it up automatically
- Nav populates from `_data/nav.yml`; search filters live against catalog entries client-side

---

<!-- Add entries below as features are built out -->
