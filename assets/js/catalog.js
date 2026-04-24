(function () {
  const BASE = document.currentScript?.dataset.baseurl ?? "";
  const CATALOG_URL = document.querySelector("[data-catalog-grid]")
    ?.dataset.catalogSource ?? BASE + "/assets/data/catalog.json";

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async function load() {
    const endpoint = document.querySelector("[data-catalog-endpoint]")?.dataset.catalogEndpoint
      ?? CATALOG_URL;
    let catalog;
    try {
      const res = await fetch(endpoint);
      catalog = await res.json();
    } catch { return; }

    hydrateSite(catalog);
    hydrateNav(catalog);
    hydrateCategories(catalog);
    hydrateGrid(catalog);
    wireSearch(catalog);
    window.SpriteAtlas?.load(BASE).then(() => hydrateSprites(document));
  }

  // ── Hydration ────────────────────────────────────────────────────────────

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
      .map((c) => `<div class="category-card" id="cat-${slug(c.id ?? c.label)}">
        <h2>${c.label}</h2>
        ${c.description ? `<p>${c.description}</p>` : ""}
      </div>`)
      .join("");
  }

  function hydrateGrid(catalog) {
    const grid = document.querySelector("[data-catalog-grid]");
    const empty = document.querySelector("[data-catalog-empty]");
    if (!grid) return;
    if (!catalog.entries?.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    grid.insertAdjacentHTML("beforeend", catalog.entries.map(entryCard).join(""));
  }

  function entryCard(entry) {
    const href = entry.url ? BASE + entry.url : "";
    return `<article class="entry-card" data-entry-id="${entry.id ?? ""}">
      ${entry.item_id != null ? `<span class="ec-icon">${iconEl(entry.icon, entry.name, entry.item_id)}</span>` : ""}
      <h3>${entry.name ?? ""}</h3>
      ${entry.category ? `<span class="entry-category">${entry.category}</span>` : ""}
      ${entry.summary ? `<p>${entry.summary}</p>` : ""}
      ${href ? `<a href="${href}">View</a>` : ""}
    </article>`;
  }

  // ── Icon ─────────────────────────────────────────────────────────────────

  function iconEl(icon, label, itemId) {
    if (itemId != null) return `<span class="sri-sprite" data-item-id="${itemId}">${(label ?? "?")[0].toUpperCase()}</span>`;
    if (!icon) return `<span class="sri-badge">${(label ?? "?")[0].toUpperCase()}</span>`;
    if (icon.path) return `<img class="sri-icon" src="${BASE}${icon.path}" alt="${label ?? ""}">`;
    return `<span class="sri-badge" data-icon="${icon.name}">${(label ?? icon.name)[0].toUpperCase()}</span>`;
  }

  // ── Sprite hydration ──────────────────────────────────────────────────────

  function hydrateSprites(root) {
    if (!window.SpriteAtlas?.ready) return;
    root.querySelectorAll(".sri-sprite[data-item-id]").forEach((el) => {
      const css = SpriteAtlas.css(+el.dataset.itemId);
      if (!css) return;
      el.style.background = css;
      el.style.backgroundSize = "auto";
      el.textContent = "";
    });
  }

  // ── Search result row ────────────────────────────────────────────────────

  function searchRow(entry) {
    const href = entry.url ? BASE + entry.url : "";
    const hasPreview = !!(entry.preview?.excerpt || entry.preview?.stats?.length);
    return `<a class="search-result-item" href="${href}" data-search-item${hasPreview ? ` data-has-preview` : ""}>
      <span class="sri-lead">
        ${iconEl(entry.icon, entry.label ?? entry.name, entry.item_id)}
        <span class="sri-text">
          <span class="sri-name">${entry.name ?? ""}</span>
          ${entry.summary ? `<span class="sri-summary">${entry.summary}</span>` : ""}
        </span>
      </span>
      ${entry.tags?.length ? `<span class="sri-tags">${entry.tags.map((t) => `<span class="sri-tag">${t}</span>`).join("")}</span>` : ""}
    </a>`;
  }

  // ── Preview lightbox ─────────────────────────────────────────────────────

  const preview = (() => {
    const el = document.createElement("div");
    el.id = "search-preview";
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    document.body.appendChild(el);

    let _entry = null;

    function show(entry, anchorRect) {
      _entry = entry;
      const p = entry.preview ?? {};
      const stats = (p.stats ?? [])
        .map((s) => `<tr><th>${s.label}</th><td>${s.value}</td></tr>`)
        .join("");
      el.innerHTML = `
        <div class="sp-header">
          ${iconEl(entry.icon, entry.name)}
          <strong class="sp-name">${entry.name}</strong>
        </div>
        ${p.image ? `<img class="sp-image" src="${BASE}${p.image}" alt="${entry.name}">` : ""}
        ${p.excerpt ? `<p class="sp-excerpt">${p.excerpt}</p>` : ""}
        ${stats ? `<table class="sp-stats">${stats}</table>` : ""}
      `;
      el.hidden = false;
      position(anchorRect);
    }

    function position(anchorRect) {
      const pad = 8;
      const vw = window.innerWidth, vh = window.innerHeight;
      const pw = el.offsetWidth, ph = el.offsetHeight;
      let left = anchorRect.right + pad;
      let top = anchorRect.top;
      if (left + pw > vw - pad) left = anchorRect.left - pw - pad;
      if (top + ph > vh - pad) top = vh - ph - pad;
      el.style.left = Math.max(pad, left) + "px";
      el.style.top = Math.max(pad, top) + "px";
    }

    function hide() { el.hidden = true; _entry = null; }

    return { show, hide, el };
  })();

  // ── Search wiring ────────────────────────────────────────────────────────

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
      preview.hide();
    };

    const render = (q) => {
      cursor = -1;
      if (!q) { dismiss(); return; }
      const hits = catalog.entries.filter(
        (e) => (e.name ?? "").toLowerCase().includes(q)
          || (e.summary ?? "").toLowerCase().includes(q)
          || (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
      if (!hits.length) { dismiss(); return; }

      // group by first tag, ungrouped last
      const groups = hits.reduce((acc, e) => {
        const key = e.tags?.[0] ?? "";
        (acc[key] = acc[key] ?? []).push(e);
        return acc;
      }, {});

      results.innerHTML = Object.entries(groups)
        .map(([tag, entries]) =>
          `${tag ? `<div class="sri-group-label">${tag}</div>` : ""}` +
          entries.map(searchRow).join("")
        )
        .join("");
      results.hidden = false;
      hydrateSprites(results);
    };

    input.addEventListener("input", (e) => render(e.target.value.trim().toLowerCase()));

    input.addEventListener("keydown", (e) => {
      const list = items();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight(Math.min(cursor + 1, list.length - 1));
        showPreviewForCursor(list, catalog);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(Math.max(cursor - 1, 0));
        showPreviewForCursor(list, catalog);
      } else if (e.key === "Enter" && cursor >= 0) {
        e.preventDefault();
        list[cursor]?.click();
      } else if (e.key === "Escape") {
        dismiss(); input.blur();
      }
    });

    results.addEventListener("mouseover", (e) => {
      const item = e.target.closest("[data-search-item]");
      if (!item || !item.dataset.hasPreview) return;
      const id = item.querySelector("[data-entry-id]")?.dataset.entryId
        ?? [...items()].indexOf(item);
      const entry = catalog.entries.find((en) =>
        BASE + en.url === item.getAttribute("href")
      );
      if (entry?.preview) preview.show(entry, item.getBoundingClientRect());
    });

    results.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget?.closest("[data-search-item]") &&
          !e.relatedTarget?.closest("#search-preview")) {
        preview.hide();
      }
    });

    preview.el.addEventListener("mouseleave", () => preview.hide());

    input.addEventListener("blur", () => setTimeout(dismiss, 150));

    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !results.contains(e.target)) dismiss();
    });
  }

  function showPreviewForCursor(list, catalog) {
    if (cursor < 0 || cursor >= list.length) { preview.hide(); return; }
    const item = list[cursor];
    if (!item.dataset.hasPreview) { preview.hide(); return; }
    const entry = catalog.entries.find((en) => BASE + en.url === item.getAttribute("href"));
    if (entry?.preview) preview.show(entry, item.getBoundingClientRect());
    else preview.hide();
  }

  // ── Comboboxes ───────────────────────────────────────────────────────────

  function wireComboboxes() {
    document.querySelectorAll("[data-nav-combobox]").forEach((sel) => {
      sel.addEventListener("change", () => { if (sel.value) window.location.href = sel.value; });
    });
  }

  function slug(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  load();
  wireComboboxes();
})();
