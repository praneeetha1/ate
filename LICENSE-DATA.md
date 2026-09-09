# Recipe data licences

`src/data/recipes.json` is a mixed-licence file. Every recipe that came from
somewhere carries its own `source`, `sourceUrl` and `license` fields, so the
licence attaches per recipe rather than to the file as a whole. Recipes with no
`license` field are the catalog's originals and are not covered by anything
below.

## Wikibooks Cookbook — CC BY-SA 4.0

161 recipes are derived from the [Wikibooks
Cookbook](https://en.wikibooks.org/wiki/Cookbook), imported by
[`scripts/import_wikibooks.py`](scripts/import_wikibooks.py). They are marked:

```json
"source": "Wikibooks Cookbook",
"sourceUrl": "https://en.wikibooks.org/wiki/Cookbook:<page>",
"license": "CC-BY-SA-4.0"
```

Wikibooks text is licensed under the [Creative Commons
Attribution-ShareAlike 4.0 International
licence](https://creativecommons.org/licenses/by-sa/4.0/). Each recipe's
`sourceUrl` is the attribution: the page history behind it names the authors.

**What share-alike means here.** These recipes are adapted, not copied verbatim
— the ingredient lines are re-parsed into fields and the wiki markup is
stripped — which makes them a derivative work. So:

- If you redistribute them, in this app or anywhere else, they stay under
  CC BY-SA 4.0 and you must keep the attribution and say they were changed.
- Keep the `source` / `sourceUrl` / `license` fields on any recipe that has
  them, and surface the attribution wherever the recipe is shown publicly.
- Share-alike does **not** reach the app's source code, the catalog's original
  recipes, or recipes a user writes themselves. It travels with these 161 rows.

Only the functional parts were imported — the ingredient list, the numbered
method, and the summary box. The surrounding article prose was left behind.

## A note on what was deliberately not used

The large "Indian recipes" datasets circulating on the usual dataset-sharing
sites were all rejected. Several are stamped CC0 or CC BY while their own
descriptions state they were crawled from a single copyrighted recipe site;
the uploader had no right to relicense that content, so the licence on the
dataset is not worth the metadata field it sits in. Others (RecipeNLG,
Recipe1M+) are explicitly research- or non-commercial-only.

Wikibooks was chosen because it is the rare case of recipe data that is both
structured and genuinely free: it is written by its contributors under a
licence that permits reuse, rather than scraped from someone who never agreed
to any of this.
