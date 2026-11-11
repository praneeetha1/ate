"""
Add each Wikibooks recipe's lead photo to recipes.json, with its credit.

The photos live on Wikimedia Commons, and every file carries its own licence
and author — separate from the page's CC BY-SA. Only freely reusable licences
are taken (CC0, public domain, CC BY, CC BY-SA); anything else, GFDL-only
included, is skipped rather than guessed at. The image stays on Wikimedia's
servers: we store a thumbnail URL and the credit, never a copy.

Usage:
    python3 scripts/wikibooks_images.py          # report only
    python3 scripts/wikibooks_images.py --write  # update recipes.json
"""

import argparse
import html
import json
import pathlib
import re
import urllib.parse

from import_wikibooks import api

RECIPES = pathlib.Path(__file__).resolve().parent.parent / "src/data/recipes.json"
FREE = re.compile(r"^(cc0|public domain|pd\b|cc by(-sa)? \d)", re.I)


def title_of(url):
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ")


def chunks(xs, n=50):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def lead_images(titles):
    """{page title: 'File:…'} for pages that have a lead image."""
    out = {}
    for batch in chunks(titles):
        q = api(action="query", prop="pageimages", piprop="name", redirects=1, titles="|".join(batch))["query"]
        back = {r["to"]: r["from"] for r in q.get("redirects", [])} | {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q["pages"]:
            if p.get("pageimage"):
                t = p["title"]
                out[back.get(t, t)] = "File:" + p["pageimage"]
    return out


def file_info(files):
    """{'File:…': (thumb url, credit dict) or reason it was skipped}."""
    out = {}
    for batch in chunks(sorted(set(files))):
        q = api(action="query", prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=640, titles="|".join(batch))["query"]
        norm = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q["pages"]:
            name = norm.get(p["title"], p["title"])
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                out[name] = "no file info"
                continue
            meta = ii.get("extmetadata", {})
            lic = meta.get("LicenseShortName", {}).get("value", "")
            if not FREE.match(lic):
                out[name] = f"licence not free to reuse: {lic or 'unknown'}"
                continue
            artist = html.unescape(re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", ""))).strip()
            out[name] = (ii["thumburl"], {
                "author": artist or "Unknown",
                "license": lic,
                "licenseUrl": meta.get("LicenseUrl", {}).get("value", ""),
                "fileUrl": ii["descriptionurl"],
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    recipes = json.loads(RECIPES.read_text())
    wb = [r for r in recipes if r.get("source") == "Wikibooks Cookbook"]
    leads = lead_images([title_of(r["sourceUrl"]) for r in wb])
    infos = file_info(leads.values())

    added = 0
    for r in wb:
        f = leads.get(title_of(r["sourceUrl"]))
        got = infos.get(f) if f else "page has no photo"
        shown = "" if r.get("hidden") else "  [visible]"
        if isinstance(got, tuple):
            r["image"], r["imageCredit"] = got
            added += 1
            print(f"+ {r['name']}{shown}: {got[1]['license']}, {got[1]['author']}")
        else:
            print(f"- {r['name']}{shown}: {got}")
    print(f"\n{added} of {len(wb)} Wikibooks recipes get a photo")

    if args.write:
        RECIPES.write_text(json.dumps(recipes, ensure_ascii=False, indent=2) + "\n")
        print("recipes.json updated")


if __name__ == "__main__":
    main()
