# OSRS Overlay Bridge Protocol (v1)

Goal: the RuneLite plugin is a **thin, generic renderer**. All logic lives in an
external **service** that can be restarted/hot-reloaded without ever restarting
the RuneLite client. Iterate logic → bounce the service → plugin auto-reconnects.

## Roles & transport
- **Service = TCP server**, listens on `127.0.0.1:43594` (configurable). Holds ALL logic.
- **Plugin = TCP client**, auto-reconnects every 1s while disconnected. Holds ZERO
  domain logic — it only extracts requested state and draws returned directives.
- Wire format: **newline-delimited JSON** (one compact JSON object per line, UTF-8).
- Loopback only. No auth (localhost trust boundary). Never expose beyond 127.0.0.1.

## Lifecycle
1. Plugin connects → sends `hello`.
2. Service replies `subscribe` (declares exactly what state it wants — keeps the
   plugin generic and the per-tick payload small).
3. Each game tick (or on change) plugin sends `state` (only subscribed fields +
   always-on basics). Service replies `render`.
4. Plugin sends `event` messages out-of-band (menu clicks, animations, hits) for
   whatever event types the service subscribed to.
5. Service restart → socket drops → plugin clears overlays, retries connect. On
   reconnect the handshake repeats; service rebuilds state from its own snapshot.

## Messages

### plugin → service
```
{"t":"hello","proto":1,"client":"runelite-overlay-bridge","ver":"x.y.z"}
{"t":"state","seq":N,"tick":T,
 "player":{"plane":0,"x":2933,"y":10184,"anim":-1,"runEnergy":88,"world":358},
 "inv":[{"slot":0,"id":453,"qty":27}, ...],            // subscribed containers only
 "equip":[{"slot":3,"id":1234}],                       // if subscribed
 "varbits":{"5357":42000,"2074":13, ...},              // exactly the subscribed ids
 "varps":{"...":...},
 "bank":{"open":true,"items":[{"id":453,"qty":1000,"slot":4}]},  // if subscribed & open
 "objects":[{"id":9100,"plane":0,"x":1942,"y":4967}],  // subscribed ids in scene
 "npcs":[{"idx":12,"id":2省,"plane":0,"x":..,"y":..}],  // subscribed ids in scene
 "widgets":{"12.13":{"exists":true,"text":"Close"}}    // subscribed group.child probes
}
{"t":"event","name":"menuOptionClicked","tick":T,
 "option":"Withdraw-All","target":"Coal","id":453,"widgetId":786445,"menuAction":"CC_OP"}
{"t":"pong","seq":N}
```

### service → plugin
```
{"t":"subscribe","proto":1,
 "containers":["inventory","bank","equipment"],
 "varbits":[5357,2074],"varps":[],
 "objects":[9100,9095,9096,26707,29328,29329,29330],
 "npcs":[],
 "widgets":[[12,13]],           // probe these group.child for existence/text/bounds
 "events":["menuOptionClicked","animationChanged","hitsplatApplied"],
 "tickState":true               // send state every tick (vs only on change)
}
{"t":"render","seq":N,"ttlTicks":2,"directives":[ ...see vocab... ]}
{"t":"log","level":"info","msg":"..."}   // optional, shown in plugin debug panel
{"t":"ping","seq":N}
```

`render.seq` echoes the `state.seq` it answers (plugin drops stale renders).
`ttlTicks`: if no fresh render arrives within this many ticks, plugin clears
directives (fail-safe so a dead service doesn't leave stale highlights).

## Directive vocabulary (the stable contract)
The service names **semantic targets**; the plugin resolves them to canvas
geometry every frame (Perspective / WidgetItem bounds). Service never sees pixels.

```
{"kind":"tile","plane":0,"x":1942,"y":4967,"color":"#ffcc00","fill":"#33ffcc00","label":"stand"}
{"kind":"worldArrow","plane":0,"x":1942,"y":4967,"color":"#00ff88"}
{"kind":"object","id":9100,"color":"#00ff88","label":"Conveyor belt","outline":true}
{"kind":"object","plane":0,"x":1940,"y":4963,"color":"#00ff88"}      // by-loc when id ambiguous
{"kind":"npc","idx":12,"color":"#ff4444","label":"..."}
{"kind":"invSlot","slot":5,"color":"#ffcc00","label":"empty bag"}    // highlight an inventory cell
{"kind":"invItem","id":453,"color":"#ffcc00","label":"Coal"}         // first matching inv cell
{"kind":"bankItem","id":453,"color":"#ffcc00","label":"Withdraw coal"}// live bank widget item
{"kind":"bankItemPredicted","id":453,"x":123,"y":45,"color":"#88ffcc00"} // cached-layout ghost (bank closed)
{"kind":"widget","group":12,"child":13,"color":"#ff8800","label":"Close"} // e.g. bank close btn
{"kind":"widgetPredicted","group":12,"child":13,"x":..,"y":..,"color":"..."}
{"kind":"text","anchor":"topRight","lines":["Bars/hr: 2280","Coffer: 42k (35m)"]}   // HUD panel
{"kind":"menuHint","option":"Withdraw-X","target":"Coal","color":"#ffcc00"}          // tint a menu row
```
Rules:
- Unknown `kind` → plugin ignores it (forward-compat; new directives don't need a
  plugin rebuild if they reuse existing kinds, and unknown ones fail silent).
- Colors are `#rgb`/`#rrggbb`/`#aarrggbb`. `fill` optional (translucent).
- `label` optional; drawn near the target.
- Predicted variants carry cached canvas coords the service learned earlier (the
  plugin still owns discovery — it reports discovered bounds back via state so the
  service can persist and later re-issue them as predictions).

## Discovery feedback (plugin → service)
So the service can predict things it can't compute (bank item slots, close-button
bounds), the plugin reports discovered canvas geometry when available:
```
"discovered":{"bankItems":[{"id":453,"x":..,"y":..,"w":36,"h":32}],
              "widgets":{"12.13":{"x":..,"y":..,"w":24,"h":24}}}
```
Service persists these; when the source is offscreen/closed it re-issues them as
`*Predicted` directives. Plugin never decides *when* — only reports *where when seen*.

## Why this keeps the plugin thin
- The plugin has: socket client + reconnect, subscription-driven state extraction,
  a directive renderer, discovery reporting. **No thresholds, no policy, no ids
  hardcoded** beyond what a subscription names. It never changes when logic changes.
- The service has: everything else (BF policy, coal math, hotspots, close-button
  timing, action logging, trip computer). Restart it freely; the client stays up.
- A second logic domain (guide-chain) is just another service on another port with
  a different subscription + directive stream — same plugin.
```
```
```
