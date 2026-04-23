(function () {
  const CATALOG_URL = document.querySelector("[data-catalog-grid]")
    ?.dataset.catalogSource ?? "/assets/data/catalog.json";

  async function load() {
    const endpoint = document.querySelector("[data-catalog-endpoint]")?.dataset.catalogEndpoint
      ?? CATALOG_URL;

    let catalog;
    try {
      const res = await fetch(endpoint);
      catalog = await res.json();
    } catch {
      return;
    }

    hydrateSite(catalog);
    hydrateNav(catalog);
    hydrateCategories(catalog);
    hydrateGrid(catalog);
    wireSearch(catalog);
  }

  function hydrateSite(catalog) {
    document.querySelectorAll("[data-catalog-bind]").forEach((el) => {
      const key = el.dataset.catalogBind;
      const val = key.split(".").reduce((o, k) => o?.[k], catalog);
      if (val != null) el.textContent = val;
    });
  }

  function hydrateNav(catalog) {
    const nav = document.querySelector("[data-catalog-nav]");
    if (!nav || !catalog.categories?.length) return;
    nav.innerHTML = catalog.categories
      .map((c) => `<li><a href="#cat-${slug(c.id ?? c.label)}">${c.label}</a></li>`)
      .join("");
  }

  function hydrateCategories(catalog) {
    const section = document.querySelector("[data-catalog-categories]");
    if (!section || !catalog.categories?.length) return;
    section.innerHTML = catalog.categories
      .map(
        (c) => `<div class="category-card" id="cat-${slug(c.id ?? c.label)}">
          <h2>${c.label}</h2>
          ${c.description ? `<p>${c.description}</p>` : ""}
        </div>`
      )
      .join("");
  }

  function hydrateGrid(catalog) {
    const grid = document.querySelector("[data-catalog-grid]");
    const empty = document.querySelector("[data-catalog-empty]");
    if (!grid) return;
    if (!catalog.entries?.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.insertAdjacentHTML(
      "beforeend",
      catalog.entries.map(entryCard).join("")
    );
  }

  function entryCard(entry) {
    return `<article class="entry-card" data-entry-id="${entry.id ?? ""}">
      <h3>${entry.name ?? ""}</h3>
      ${entry.category ? `<span class="entry-category">${entry.category}</span>` : ""}
      ${entry.summary ? `<p>${entry.summary}</p>` : ""}
      ${entry.url ? `<a href="${entry.url}">View</a>` : ""}
    </article>`;
  }

  function wireSearch(catalog) {
    const input = document.querySelector("[data-catalog-search]");
    const results = document.querySelector("[data-catalog-results]");
    if (!input || !results || !catalog.entries?.length) return;

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.hidden = true; results.innerHTML = ""; return; }
      const hits = catalog.entries.filter(
        (e) => (e.name ?? "").toLowerCase().includes(q) || (e.summary ?? "").toLowerCase().includes(q)
      );
      results.hidden = !hits.length;
      results.innerHTML = hits.map(entryCard).join("");
    });
  }

  function slug(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  load();
})();
