"""
Graph → Jekyll data artifacts + stub pages.

Reads graph.json, resolves node/edge associations, emits:
  _data/nav.json        — hierarchical tree for SSR nav/sub-nav
  _data/sitemap.json    — flat + nested for sitemap page
  _data/comboboxes.json — grouped option sets for any combobox surface
  _data/related.json    — per-node related-link sets
  assets/data/catalog.json — client-side search/catalog feed
  <url>/index.html      — stub page per graph node (skips home "/")
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
GRAPH_PATH = ROOT / "graph.json"
DATA_DIR = ROOT / "_data"
ASSETS_DATA_DIR = ROOT / "assets" / "data"


def load():
    return json.loads(GRAPH_PATH.read_text(encoding="utf-8"))


def index(graph):
    nodes = {n["id"]: n for n in graph["nodes"]}
    children = defaultdict(list)
    related = defaultdict(list)
    parents = {}

    for edge in graph["edges"]:
        if edge["rel"] == "child":
            children[edge["from"]].append(edge["to"])
            parents[edge["to"]] = edge["from"]
        elif edge["rel"] == "related":
            related[edge["from"]].append(edge["to"])
            related[edge["to"]].append(edge["from"])

    return nodes, children, related, parents


def build_tree(node_id, nodes, children, depth=0):
    if node_id not in nodes:
        return None
    node = nodes[node_id]
    kids = [
        build_tree(c, nodes, children, depth + 1)
        for c in children.get(node_id, [])
        if c in nodes
    ]
    return {
        "id": node["id"],
        "label": node["label"],
        "url": node["url"],
        "type": node["type"],
        "slots": node.get("slots", []),
        "meta": node.get("meta", {}),
        "children": [k for k in kids if k],
    }


def slot_filter(tree_nodes, slot):
    return [n for n in tree_nodes if slot in n.get("slots", [])]


def filter_tree(node, slot):
    if slot not in node.get("slots", []):
        return None
    kids = [filter_tree(c, slot) for c in node.get("children", [])]
    return {**node, "children": [k for k in kids if k]}


def emit_nav(root_tree):
    nav_nodes = [filter_tree(c, "nav") for c in root_tree["children"]]
    return [n for n in nav_nodes if n]


def emit_sitemap(root_tree):
    def flatten(node, acc):
        acc.append({"id": node["id"], "label": node["label"], "url": node["url"]})
        for c in node.get("children", []):
            flatten(c, acc)
        return acc

    nested = [filter_tree(c, "sitemap") for c in root_tree["children"]]
    nested = [n for n in nested if n]
    flat = []
    for n in nested:
        flatten(n, flat)
    return {"nested": nested, "flat": flat}


def emit_comboboxes(nodes, children):
    boxes = []
    for node in nodes.values():
        if "combobox" not in node.get("slots", []):
            continue
        options = [
            {"id": nodes[c]["id"], "label": nodes[c]["label"], "url": nodes[c]["url"]}
            for c in children.get(node["id"], [])
            if c in nodes and "combobox" in nodes[c].get("slots", [])
        ]
        boxes.append({
            "id": node["id"],
            "label": node.get("meta", {}).get("combobox_label", node["label"]),
            "options": options,
        })
    return boxes


def emit_related(nodes, related):
    return {
        nid: [
            {"id": nodes[r]["id"], "label": nodes[r]["label"], "url": nodes[r]["url"]}
            for r in rels
            if r in nodes
        ]
        for nid, rels in related.items()
    }


def emit_catalog(nodes):
    entries = [
        {
            "id": n["id"],
            "name": n["label"],
            "url": n["url"],
            "category": n["type"],
            "summary": n.get("meta", {}).get("summary", ""),
            "icon": n.get("meta", {}).get("icon"),
            "tags": n.get("meta", {}).get("tags", []),
            "preview": n.get("meta", {}).get("preview"),
        }
        for n in nodes.values()
        if "search" in n.get("slots", [])
    ]
    return {"version": "1.0.0", "entries": entries}


LAYOUT_MAP = {"article": "article", "tool": "tool", "data": "node"}

def emit_pages(nodes, children, parents):
    pages = {}
    for node in nodes.values():
        url = node["url"].strip("/")
        if not url:
            continue
        meta = node.get("meta", {})
        page_class = meta.get("page_class", "")
        layout = LAYOUT_MAP.get(page_class, "node")
        kids = [
            {"id": nodes[c]["id"], "label": nodes[c]["label"], "url": nodes[c]["url"]}
            for c in children.get(node["id"], [])
            if c in nodes
        ]
        breadcrumb = []
        cur = node["id"]
        while cur in parents:
            p = parents[cur]
            if p == "root":
                break
            breadcrumb.insert(0, {"label": nodes[p]["label"], "url": nodes[p]["url"]})
            cur = p
        front = {
            "layout": layout,
            "title": node["label"],
            "node_id": node["id"],
            "summary": meta.get("summary", ""),
            "page_class": page_class,
            "tags": meta.get("tags", []),
            "breadcrumb": breadcrumb,
            "children": kids,
        }
        if page_class == "tool":
            front["tool_script"] = f"/assets/js/tools/{node['id']}.js"
        pages[url] = {"path": ROOT / url / "index.html", "front": front}
    return pages


def write_pages(pages):
    for url, page in pages.items():
        path = page["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        front = page["front"]
        lines = ["---"]
        for k, v in front.items():
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        lines += ["---", ""]
        if front["children"]:
            lines.append('<ul class="node-children">')
            for c in front["children"]:
                lines.append(f'  <li><a href="{{{{ site.baseurl }}}}{c["url"]}">{c["label"]}</a></li>')
            lines.append("</ul>")
            lines.append("")
        path.write_text("\n".join(lines), encoding="utf-8")
        print(f"  wrote {path.relative_to(ROOT)}")


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}")


def main():
    graph = load()
    nodes, children, related, parents = index(graph)
    root_node = {"id": "root", "label": "root", "url": "/", "type": "root", "slots": [], "meta": {}}
    root_tree = build_tree("root", {"root": root_node, **nodes}, children)

    write(DATA_DIR / "nav.json",        emit_nav(root_tree))
    write(DATA_DIR / "sitemap.json",    emit_sitemap(root_tree))
    write(DATA_DIR / "comboboxes.json", emit_comboboxes(nodes, children))
    write(DATA_DIR / "related.json",    emit_related(nodes, related))
    write(ASSETS_DATA_DIR / "catalog.json", emit_catalog(nodes))
    write_pages(emit_pages(nodes, children, parents))

    print("done.")


if __name__ == "__main__":
    sys.exit(main())
