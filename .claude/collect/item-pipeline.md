## [router:item-req-grant-pipeline] assets/js/tools/progression-router.js:L725–L731
  function normalizeReqs(reqs) {
    if (!reqs || typeof reqs !== "object") return { skills: {} };
    if (reqs.skills !== undefined || reqs.items !== undefined ||
        reqs.equipment !== undefined || reqs.inv_free !== undefined ||
        reqs.constraints !== undefined) return { ...reqs, tags: reqs.tags ?? [] };
    return { skills: reqs, tags: [] };   // legacy flat form
  }

## [router:item-req-grant-pipeline] assets/js/tools/progression-router.js:L428–L514
  function makeTagReqBox(initialTags) {
    const box      = document.createElement("div");
    box.className  = "region-tagbox";
    const tagsSpan = document.createElement("span");
    tagsSpan.className = "rtb-tags";
    const input    = document.createElement("input");
    input.className = "rtb-input"; input.type = "text"; input.placeholder = "tag…";
    const dropdown = document.createElement("ul");
    dropdown.className = "rtb-dropdown"; dropdown.hidden = true;
    box.append(tagsSpan, input, dropdown);

    const addTag = (tag) => {
      const t = tag.trim();
      if (!t) return;
      const span = document.createElement("span");
      span.className = "rtb-tag"; span.dataset.tag = t; span.tabIndex = 0;
      const rm = document.createElement("button");
      rm.className = "rtb-tag-rm"; rm.textContent = "✕"; rm.setAttribute("aria-label", "Remove");
      rm.addEventListener("click", () => span.remove());
      span.addEventListener("keydown", (e) => {
        if (e.key === "Delete" || e.key === "Backspace") { span.remove(); input.focus(); }
      });
      span.append(t, rm);
      tagsSpan.appendChild(span);
    };

    const renderOption = (r, q) => {
      const li = document.createElement("li");
      li.className = "rtb-option";
      li.dataset.tag = r.tag;
      li.innerHTML = q ? highlightTag(r.tag, r.indices, r.serial) : escHtml(r.tag);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addTag(li.dataset.tag);
        input.value = "";
        dropdown.hidden = true;
      });
      return li;
    };

    const showDropdown = (q) => {
      const current = new Set([...tagsSpan.querySelectorAll(".rtb-tag[data-tag]")].map((s) => s.dataset.tag));
      const pool = collectGrantedTags().filter((t) => !current.has(t));
      const results = q
        ? rankTags(q, pool)
        : pool.map((tag) => ({ tag, score: 0, serial: false, indices: [] })).sort((a, b) => a.tag.length - b.tag.length);
      if (!results.length) { dropdown.hidden = true; return; }
      dropdown.innerHTML = "";
      results.forEach((r) => dropdown.appendChild(renderOption(r, q)));
      dropdown.hidden = false;
      const opts = [...dropdown.querySelectorAll(".rtb-option")];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIdx + 1, opts.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIdx - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const active = activeIdx >= 0 ? opts[activeIdx] : null;
        if (active) { addTag(active.dataset.tag); input.value = ""; dropdown.hidden = true; activeIdx = -1; }
        else if (input.value.trim()) { addTag(input.value.trim()); input.value = ""; dropdown.hidden = true; }
      } else if (e.key === "Escape") {
        dropdown.hidden = true; activeIdx = -1;
      } else if (e.key === "Backspace" && input.value === "") {
        const last = tagsSpan.querySelector(".rtb-tag:last-of-type");
        if (last) last.remove();
      }
    });

    initialTags.forEach(addTag);

    box.readTags = () => [...tagsSpan.querySelectorAll(".rtb-tag[data-tag]")].map((s) => s.dataset.tag);
    return box;
  }

## [router:item-req-grant-pipeline] assets/js/tools/progression-router.js:L710–L721
  function appendReqRow(container, skill, level) {
    const row = document.createElement("div");
    row.className = "ge-req-row";
    row.innerHTML = `
      <select class="ge-req-skill">
        ${skillNames.map((sk) => `<option value="${sk}"${sk === skill ? " selected" : ""}>${sk}</option>`).join("")}
      </select>
      <input class="ge-req-level" type="number" min="1" max="99" value="${level ?? 1}" style="width:3.5rem">
      <button class="btn btn-ghost ge-req-rm" style="font-size:var(--fs-xs);padding:1px var(--sp-q)">✕</button>`;
    row.querySelector(".ge-req-rm").addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

## [router:item-req-grant-pipeline] assets/js/tools/progression-router.js:L517–L591
  function openGoalEditor(idx) {
    const ul = els.goalQueue();
    const card = ul?.querySelector(`.goal-card[data-idx="${idx}"]`);
    if (!card) return;
    const goal = goalQueue[idx];

    const form = document.createElement("li");
    form.className = "goal-edit-form";
    form.innerHTML = `
      <div class="goal-edit-row">
        <input class="ge-label" type="text" value="${escHtml(goal.label)}" placeholder="Goal label">
        <input class="ge-terminal" type="text" value="${escHtml(goal.terminal ?? "")}" placeholder="Terminal step id (opt)">
      </div>
      <div class="ins-skill-section ins-skill-section--req">
        <div class="ins-skill-header">
          <span class="ins-skill-title req">Requirements</span>
          <button class="btn btn-ghost ge-add-req">+ skill</button>
        </div>
        <div class="ge-reqs"></div>
        <div class="ge-tag-reqs-wrap"></div>
      </div>
      <div class="ins-skill-section ins-skill-section--grant">
        <div class="ins-skill-header">
          <span class="ins-skill-title grant">Grants</span>
          <button class="btn btn-ghost ge-add-grant">+ skill</button>
        </div>
        <div class="ins-skill-pills ge-grants"></div>
        <div class="ge-tag-grants-wrap"></div>
      </div>
      <div class="goal-edit-actions">
        <button class="btn btn-primary ge-save">Save</button>
        <button class="btn btn-ghost ge-cancel">Cancel</button>
      </div>`;

    const reqsContainer  = form.querySelector(".ge-reqs");
    const grantsWrap     = form.querySelector(".ge-grants");
    const tagBox         = makeTagReqBox(normalizeReqs(goal.reqs).tags ?? []);
    form.querySelector(".ge-tag-reqs-wrap").appendChild(tagBox);

    Object.entries(normalizeReqs(goal.reqs).skills ?? {}).forEach(([sk, lvl]) => appendReqRow(reqsContainer, sk, lvl));
    const existingGrants = goal.grants ?? {};
    const tagGrantBox    = makeTagReqBox(Object.entries(existingGrants).filter(([, v]) => v === true).map(([k]) => k));
    tagGrantBox.classList.add("region-tagbox--grant");
    form.querySelector(".ge-tag-grants-wrap").appendChild(tagGrantBox);
    Object.entries(existingGrants).forEach(([k, v]) => {
      if (typeof v === "number") grantsWrap.appendChild(makeSkillPill(k, v, "grant"));
    });

    form.querySelector(".ge-add-req").addEventListener("click", () => appendReqRow(reqsContainer));
    form.querySelector(".ge-add-grant").addEventListener("click", () => grantsWrap.appendChild(makeSkillPill(skillNames[0], 1, "grant")));

    form.querySelector(".ge-cancel").addEventListener("click", () => form.replaceWith(card));
    form.querySelector(".ge-save").addEventListener("click", () => {
      const label = form.querySelector(".ge-label").value.trim();
      if (!label) return;
      const reqs = { skills: {}, tags: [] };
      reqsContainer.querySelectorAll(".ge-req-row").forEach((row) => {
        const sk  = row.querySelector(".ge-req-skill").value;
        const lvl = parseInt(row.querySelector(".ge-req-level").value, 10);
        if (sk && lvl > 1) reqs.skills[sk] = lvl;
      });
      reqs.tags = tagBox.readTags();
      const grants = readSkillPills(grantsWrap);
      tagGrantBox.readTags().forEach((t) => { grants[t] = true; });
      mergeTags(reqs.tags);
      mergeTags(Object.keys(grants).filter((k) => grants[k] === true));
      goalQueue[idx] = { ...goal, label, reqs, grants, terminal: form.querySelector(".ge-terminal").value.trim() || null };
      store.saveGoals(goalQueue);
      renderGoalQueue();
      renderStepBank();
      recompute();
    });

    card.replaceWith(form);
  }

## [router:item-req-grant-pipeline] assets/js/tools/progression-router.js:L1131–L1233
  function buildStepForm(opts) {
    const { afterIdx = -1, onCommit, onCancel } = opts;

    const li = document.createElement("li");
    li.className = "goal-card ins-step-card";

    function showCard() {
      li.innerHTML = `
        <span class="goal-card-body">
          <span class="goal-card-label ins-card-label">New step</span>
          <span class="goal-card-reqs"></span>
        </span>
        <span class="goal-card-btns">
          <button class="btn btn-ghost ins-card-edit" title="Configure step">✎</button>
          <button class="btn btn-ghost ins-card-cancel" title="Cancel">✕</button>
        </span>`;
      li.querySelector(".ins-card-edit").addEventListener("click", showForm);
      li.querySelector(".goal-card-body").addEventListener("click", showForm);
      li.querySelector(".ins-card-cancel").addEventListener("click", (e) => {
        e.stopPropagation();
        if (onCancel) onCancel();
      });
    }

    function showForm() {
      li.innerHTML = `
        <div class="ins-step-body">
          <input class="ins-label" type="text" placeholder="Step label…">
          <input class="ins-detail" type="text" placeholder="Detail (optional)">
        </div>
        <div class="ins-skill-section ins-skill-section--req">
          <div class="ins-skill-header">
            <span class="ins-skill-title req">Requirements</span>
            <button class="btn btn-ghost ins-add-req">+ skill</button>
          </div>
          <div class="ins-skill-pills ins-reqs"></div>
          <div class="ins-tag-reqs-wrap"></div>
        </div>
        <div class="ins-skill-section ins-skill-section--grant">
          <div class="ins-skill-header">
            <span class="ins-skill-title grant">Grants</span>
            <button class="btn btn-ghost ins-add-grant">+ skill</button>
          </div>
          <div class="ins-skill-pills ins-grants"></div>
          <div class="ins-tag-grants-wrap"></div>
        </div>
        <div class="goal-edit-actions">
          <button class="btn btn-primary ins-add">Add</button>
          <button class="btn btn-ghost ins-cancel">Cancel</button>
        </div>`;

      const reqWrap   = li.querySelector(".ins-reqs");
      const grantWrap = li.querySelector(".ins-grants");
      const tagBox    = makeTagReqBox([]);
      li.querySelector(".ins-tag-reqs-wrap").appendChild(tagBox);

      const tagGrantBox = makeTagReqBox([]);
      tagGrantBox.classList.add("region-tagbox--grant");
      li.querySelector(".ins-tag-grants-wrap").appendChild(tagGrantBox);

      li.querySelector(".ins-add-req").addEventListener("click", () => reqWrap.appendChild(makeSkillPill(skillNames[0], 1, "req")));
      li.querySelector(".ins-add-grant").addEventListener("click", () => grantWrap.appendChild(makeSkillPill(skillNames[0], 1, "grant")));
      li.querySelector(".ins-cancel").addEventListener("click", showCard);
      li.querySelector(".ins-add").addEventListener("click", () => {
        const label = li.querySelector(".ins-label").value.trim();
        if (!label) return;
        const anchorStep = afterIdx >= 0 ? currentPath[afterIdx] : null;
        const grants = (() => {
          const g = readSkillPills(grantWrap);
          tagGrantBox.readTags().forEach((t) => { g[t] = true; });
          return g;
        })();
        const step = {
          id:         `custom-${Date.now()}`,
          label,
          detail:     li.querySelector(".ins-detail").value.trim(),
          reqs:       { skills: readSkillPills(reqWrap), tags: tagBox.readTags() },
          grants,
          _custom:    true,
          _goalLabel: anchorStep?._goalLabel ?? "",
          _reqs:      {},
        };
        mergeTags(step.reqs.tags ?? []);
        mergeTags(Object.keys(step.grants).filter((k) => step.grants[k] === true));
        const baseSkills  = window._routerLastPath?.profile?.skills ?? {};
        const skillsAtPos = currentPath.slice(0, afterIdx + 1)
          .reduce((sk, s) => applyGrants(s.grants, sk), { ...baseSkills });
        const prereqs = synthPrereqs(step, skillsAtPos);
        let insertAt = afterIdx;
        prereqs.forEach((pre) => {
          const preAnchor = insertAt >= 0 ? currentPath[insertAt]?.id ?? "start" : "start";
          pinnedInserts.push({ anchor: preAnchor, step: pre });
          currentPath.splice(insertAt + 1, 0, pre);
          insertAt++;
        });
        pinnedInserts.push({ anchor: anchorStep?.id ?? "start", step });
        onCommit(step, insertAt);
      });
    }

    showCard();
    return li;
  }

## [router:item-req-grant-pipeline] assets/js/tools/progression-router.js:L1712–L1742
  function makeSkillPill(sk, lvl, tint) {
    const pill = document.createElement("span");
    pill.className = `ins-skill-pill ins-skill-pill--${tint}`;
    const icon = document.createElement("span");
    icon.className = "ins-skill-icon";
    icon.textContent = sk.charAt(0).toUpperCase();
    const sel = document.createElement("select");
    sel.className = "ins-pill-sk";
    skillNames.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = skillLabel(s);
      if (s === sk) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => { icon.textContent = sel.value.charAt(0).toUpperCase(); });
    const input = document.createElement("input");
    input.type = "number"; input.className = "ins-pill-lvl"; input.min = 1; input.max = 99; input.value = lvl ?? 1;
    const rm = document.createElement("button");
    rm.className = "btn btn-ghost ins-pill-rm"; rm.textContent = "✕";
    rm.addEventListener("click", () => pill.remove());
    pill.append(icon, sel, input, rm);
    return pill;
  }

  function readSkillPills(container) {
    return Object.fromEntries(
      [...container.querySelectorAll(".ins-skill-pill")].map((p) => [
        p.querySelector(".ins-pill-sk").value, +p.querySelector(".ins-pill-lvl").value,
      ])
    );
  }