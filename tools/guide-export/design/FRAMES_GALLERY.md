# FRAMES GALLERY — captured frames/gifs as first-class step resources

Design only (build = **Lane F1**, named in §6). Makes the scenario-capture
harness's outputs (SME_NOTES §15: `frame_login.png`, `login.gif`,
`frames/frame_NNN.png`, produced by `spike/run.sh` at rev 236) attachable to
checklist steps, browsable in the web view, and safe for the plugin.

Position in the capture hierarchy (GRANULARITY §7b, unchanged): wiki page (cited)
→ cache data (by id) → **simulated-viewport capture** — frames are tier-3
artifacts and inherit its honesty bar: *recorded with the state that produced
them; never happenstance screencaps*. A frame without provenance does not ship,
same rule as rates.

Ground truth for the provenance shape: the harness already emits it —
`spike/out/observed.json` = `{"js5_rev": 236, "login_rev": 236, "user":
"protobot", "ingame": ["protobot", 3232, 3296]}`.

---

## 1. SCHEMA — `media[]` on steps (additive-nullable)

New optional array on steps.jsonl rows AND on emitted guide-JSON steps; enrich
passes it through verbatim (same pattern as `refs[]`, shipped 79b46062). Every
existing row stays valid untouched.

```jsonc
"media": [
  {
    "kind": "png",                          // "png" | "gif"
    "path": "media/3f2a9c/login-fresh.png", // guide-source-relative; exclusive with url
    "url": null,                            // absolute URL (rare; loopback/pages only)
    "caption": "Login screen immediately after tutorial exit",
    "state": {                              // REQUIRED — the state that produced it
      "harness": "spike/run.sh",            // producing script / run id
      "rev": 236,                           // content revision pin (§13 of SME_NOTES)
      "scenario": "login-fresh",            // scenario id (P6 scenario format FK when it lands; free string until then)
      "tile": [3232, 3296, 0],              // player pos, or null (login screen / interface-only)
      "varbits": {},                        // the state-vector subset that matters; "??" where unknown
      "captured": "2026-07-12T09:14:00Z"
    }
  }
]
```

Rules:

- **`state{}` is mandatory** per entry. Missing/unknown members are `"??"` or
  null — but the object itself must exist. Lint enforces (§6 verify).
- **Content-addressed paths**: files live under `media/<sha256[0:6]>/<name>` in
  the guide source (git source-of-truth + local overrides, per the guide-chain
  data model). Content addressing is what makes the serving cache immutable (§4).
- GIFs are the *assembled* artifact (Pillow `assemble_gif.py`); the source frame
  sequence stays in the capture workspace, referenced by `state.harness` — the
  guide repo carries only the ship-grade artifact.
- `media[]` order is display order; the first entry is the step's thumbnail
  everywhere a single image is wanted (plugin panel, compact rows).
- Equal-grade rule untouched: media decorates a step; it never creates sub-items.

## 2. AUTHORING FLOW

Capture (harness, P5 now / P6 for in-world) → `observed.json` + frames → author
copies the ship frame into the guide source under its content hash, writes the
`media[]` entry with `state{}` transcribed from `observed.json` (rev, user→
scenario, ingame→tile) → lint validates → enrich passes through → web/plugin
render. No pipeline pass changes; P0–P11 are untouched.

---

## 3. WEB VIEW — side gallery pane + lightbox

The guide-chain web shell (`WebFragments.shell()`) has two htmx swap zones today:
`#plan` (re-polled every 2s) and `#detail` (re-polled every 2s, `hx-swap=
outerHTML`). Anything stateful placed *inside* them is destroyed on every poll.

**The gallery therefore lives OUTSIDE the swap zones**, exactly like the wikibox
pattern (wiki refs alongside the step, in a pane the swaps can't clobber):

- **Gallery pane**: a sibling `<aside id="gallery">` in the shell, next to
  `#detail`. It re-fetches `GET /fragments/gallery/{gid}/{sid}` only on a
  `step-focus-changed` event (fired from the existing `htmx:afterSwap` hook in
  `app.js` when the detail step key changes) and on `guide-store-changed` — NOT
  on the 2s poll. Steps without media collapse the pane to nothing.
- **Thumbnails**: CSS grid `repeat(auto-fill, minmax(96px, 1fr))`, `img {
  max-width: 100%; }`, `loading="lazy"`. GIF thumbs animate natively (acceptable;
  a first-frame poster route is a later nicety, not in F1). Each thumb shows the
  caption on title/hover and a tiny rev chip (`r236`).
- **Lightbox**: one overlay element in the shell (outside swap zones), following
  the established lightbox pattern — the router editor's `loadout-lightbox`
  (full-screen overlay div, click-outside or ✕ to close) is the reference
  implementation; the guide-chain web gets its structural twin (`#media-lightbox`,
  plain JS in `app.js`, no htmx). Clicking a thumb opens it with: full-size
  media, caption, `state{}` rendered as chips (rev · scenario · tile ·
  captured), and the step's wiki `refs[]` links — **frames render alongside wiki
  refs in one lightbox family**, so the "what does this look like" and "where is
  this sourced" answers live on the same surface.
- Poll-safety invariant (verify step in §6): an open lightbox and the gallery
  scroll position must survive `#plan`/`#detail` swaps.
- **Router web view** (assets/js/router/editor): steps carrying `media[]` get the
  same thumb strip in the step card; the existing loadout-lightbox generalizes to
  the shared media lightbox. Same schema, zero planner coupling (pass-through
  field, like hints/checkpoints).

## 4. SERVING PATTERN — lazy blob route, same family as `/icon` and `/wiki/page`

One route added to `GuideWebServer`:

```
GET /media/{guideId}/{stepId}/{n}   →  bytes of step.media[n]
```

- **Resolution is manifest-driven, never path-driven**: the handler looks up the
  loaded Guide → step → `media[n]` and reads the file from the guide source's
  local checkout. Arbitrary paths are unreachable by construction — the same
  whitelist discipline `serveStatic` already applies ("never expose arbitrary
  classpath entries"), extended to the media dir.
- `Content-Type` by `kind` (`image/png` / `image/gif`); `Cache-Control:
  max-age=31536000, immutable` — sound because paths are content-addressed (§1);
  404 when the guide/step/index/file is absent (honest degradation: the thumb
  slot renders a "capture pending" placeholder, the step is unaffected).
- **Lazy**: bytes are read per-request off the request-thread pool; nothing is
  preloaded, nothing embedded in `/api/state.json` (state.json carries only the
  `media[]` descriptors). Loopback-only inherited from the server bind.
- Note for the build: `/icon` (item icons by cache id) and `/wiki/page` (cached
  wiki blobs) are this route's siblings in the design vocabulary — GRANULARITY
  §7b's icon-blob store and the wikibox refs pane. **Grep-verified 2026-07-12:
  neither route exists in `GuideWebServer.java` yet** — they are planned family
  members, not code to copy. `/media` lands the family's shared shape first
  (manifest-driven resolution + typed content + immutable cache + 404-honest);
  whichever of the three lands next reuses it.

## 5. PLUGIN-SIDE NOTE

- `GuideStep` gains `public List<GuideMedia> media;` (`GuideMedia`: `kind`,
  `path`, `url`, `caption`, `state` as `Map<String,Object>`) — additive JSON,
  unknown-field-safe exactly like the Lane 1 fields.
- The RuneLite side panel renders **at most one small thumbnail** for the current
  step (first media entry, `ImageIcon` downscaled, cached off the client thread)
  with an "open in web view" affordance to the gallery. Full-size browsing is a
  web-view concern.
- **Overlays never draw media.** Media is reference imagery, not screen
  furniture — the overlay-only guidance rule (highlight-only, no input injection)
  is untouched.

## 6. BUILD LANE — **Lane F1: frames gallery** (sequenced after SYNTHESIS Lane 4)

Shares plugin files with Lane 4, so it follows it; independent of Lanes M1–M3
(MATERIALIZATION.md) except the shared PlanRow render file with M3 — F1 and M3
coordinate on `WebFragments.java` or land in either order, both additive.

- **Files**: `runelite-guide-chain/schema/guide.schema.json` (+`media[]`);
  `data/GuideStep.java` + new `data/GuideMedia.java`;
  `web/GuideWebServer.java` (`/media` route); `web/WebFragments.java` (gallery
  fragment + shell `#gallery` aside + `#media-lightbox` element);
  `web/app.js`/`app.css` (step-focus event, lightbox open/close, grid);
  `tools/guide-export/enrich.py` (media pass-through, one clause beside refs);
  fixture guide with `frame_login.png` + `login.gif` copied content-addressed.
- **Harness dependency**: login-screen frames are available NOW (P5 done);
  in-world frames gate on P6 (`sme:p6-game-packets` → `sme:p6-capture-oracle`).
  F1 does not wait for P6 — it ships against P5 artifacts and P6 output drops in
  with zero schema change (that is what `state.scenario` is reserved for).
- **Verify**: (1) lint — every `media[].state` object present, `kind` ∈ enum,
  content-hash dir matches file hash; (2) `GuideWebMain` standalone: thumbs
  render for the fixture step, lightbox opens with state chips (`r236`) and wiki
  refs, click-outside closes; (3) poll-safety: lightbox stays open and gallery
  scroll survives a forced `#plan`+`#detail` swap cycle; (4) `/media` returns
  404 on bad guide/step/index and never serves outside the media dir;
  (5) plugin sideload (`-ea` per Lane 4): panel thumbnail renders, no
  client-thread I/O (assert via the existing dev assertions).
