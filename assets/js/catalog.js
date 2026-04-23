(function () {
  const BASE = document.currentScript?.dataset.baseurl ?? "";
  const CATALOG_URL = document.querySelector("[data-catalog-grid]")
    ?.dataset.catalogSource ?? BASE + "/assets/data/catalog.json";

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
    const href = entry.url ? BASE + entry.url : "";
    return `<article class="entry-card" data-entry-id="${entry.id ?? ""}">
      <h3>${entry.name ?? ""}</h3>
      ${entry.category ? `<span class="entry-category">${entry.category}</span>` : ""}
      ${entry.summary ? `<p>${entry.summary}</p>` : ""}
      ${href ? `<a href="${href}">View</a>` : ""}
    </article>`;
  }

  function searchRow(entry) {
    const href = entry.url ? BASE + entry.url : "";
    return `<a class="search-result-item" href="${href}" data-search-item>
      <span class="sri-name">${entry.name ?? ""}</span>
      ${entry.summary ? `<span class="sri-summary">${entry.summary}</span>` : ""}
    </a>`;
  }

  function wireSearch(catalog) {
    const input = document.querySelector("[data-catalog-search]");
    const results = document.querySelector("[data-catalog-results]");
    if (!input || !results || !catalog.entries?.length) return;

    let cursor = -1;

    const items = () => Array.from(results.querySelectorAll("[data-search-item]"));

    const highlight = (idx) => {
      items().forEach((el, i) => el.classList.toggle("is-active", i === idx));
      cursor = idx;
    };

    const dismiss = () => {
      results.hidden = true;
      results.innerHTML = "";
      cursor = -1;
    };

    input.addEventListener("input", () => {
      cursor = -1;
      const q = input.value.trim().toLowerCase();
      if (!q) { dismiss(); return; }
      const hits = catalog.entries.filter(
        (e) => (e.name ?? "").toLowerCase().includes(q) || (e.summary ?? "").toLowerCase().includes(q)
      );
      results.hidden = !hits.length;
      results.innerHTML = hits.map(searchRow).join("");
    });

    input.addEventListener("keydown", (e) => {
      const list = items();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight(Math.min(cursor + 1, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(Math.max(cursor - 1, 0));
      } else if (e.key === "Enter" && cursor >= 0) {
        e.preventDefault();
        list[cursor]?.click();
      } else if (e.key === "Escape") {
        dismiss(); input.blur();
      }
    });

    input.addEventListener("blur", () => setTimeout(dismiss, 150));

    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !results.contains(e.target)) dismiss();
    });
  }

  function slug(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function wireComboboxes() {
    document.querySelectorAll("[data-nav-combobox]").forEach((sel) => {
      sel.addEventListener("change", () => {
        if (sel.value) window.location.href = sel.value;
      });
    });
  }

  load();
  wireComboboxes();
})();
