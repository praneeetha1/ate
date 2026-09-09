"""
Import South Asian recipes from the Wikibooks Cookbook into the catalog shape.

Wikibooks is the only source of any volume that is genuinely free to reuse:
its Cookbook is community-authored under CC-BY-SA 4.0, not scraped from a
recipe blog. Every "6,000 Indian recipes" dataset on the usual dataset sites
traces back to one scrape of a single copyrighted site, relicensed by an
uploader with no right to do so — so this importer exists instead.

CC-BY-SA is share-alike, which is why each imported recipe carries its own
`source` / `sourceUrl` / `license` fields rather than the file carrying one
blanket licence: the obligation attaches per recipe, and the catalog's original
300 are not covered by it. See LICENSE-DATA.md.

Only the factual parts are imported — the ingredient list, the numbered
procedure, and the summary box. The article prose around them is left behind:
the catalog has nowhere to put it, and the recipe is the part that's wanted.

Usage:
    python3 scripts/import_wikibooks.py            # writes the JSON + a report
    python3 scripts/import_wikibooks.py --merge    # also appends to recipes.json
"""

import argparse
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

API = "https://en.wikibooks.org/w/api.php"

# Wikimedia asks that automated clients identify themselves and say how to get
# in touch; an anonymous or browser-spoofing agent may be refused outright.
UA = "ate-recipe-app/1.0 (personal recipe app; https://en.wikibooks.org/wiki/Cookbook)"

# Namespace 102 is the Cookbook namespace. The recipes are not in the main
# article namespace, which is why a plain category query returns nothing.
COOKBOOK_NS = 102

CATEGORIES = [
    "Indian recipes",
    "South Indian recipes",
    "Bengali recipes",
    "Punjabi recipes",
    "Pakistani recipes",
]

# Pages in the Indian categories that are not Indian cooking, or are a
# Westernised shortcut version of a dish. Excluded by name so that re-running
# the import doesn't quietly put them back after they've been culled.
EXCLUDE = {
    "Cookbook:Chicken Curry (Mediterranean-inspired)",  # says so itself
    "Cookbook:Curry Fried Rice",                         # soy sauce, Chinese style
    "Cookbook:Gulab Jamun (Fried Milk Balls in Syrup)",  # built on Bisquick
    "Cookbook:Kedgeree (Rice and Smoked Fish)",          # Anglo-Scottish
    "Cookbook:Masala Chai II",                           # cocoa and vanilla
    "Cookbook:Pear Chutney",                             # pears, allspice, pectin
    "Cookbook:Saffron Rice",                             # celery and molasses
}

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "recipes.wikibooks.json"
CATALOG = ROOT / "src" / "data" / "recipes.json"

# ── wikitext → plain text ────────────────────────────────────────────────────

FRACTION_MAP = {
    "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3",
    "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5",
    "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6",
}


def strip_templates(s):
    """Remove {{...}} calls, innermost first so nested ones come out too."""
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    return s


def delink(s):
    """
    [[Cookbook:Tablespoon|tablespoon]] -> tablespoon, [[Cookbook:Dal]] -> Dal.

    The display half of a piped link is what the sentence actually reads, so it
    wins; an unpiped link keeps its target with the namespace prefix dropped.
    """
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[(?:[Cc]ookbook:)?([^\]|]*)\]\]", r"\1", s)
    # External links: [http://x label] -> label
    s = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\]", "", s)
    return s


def decomment(s):
    """Drop refs and HTML comments. Runs before headings are located, because
    a heading can carry a citation inside it ("== Procedure<ref>…</ref> ==")."""
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S | re.I)
    s = re.sub(r"<ref[^>]*/>", "", s, flags=re.I)
    return re.sub(r"<!--.*?-->", "", s, flags=re.S)


# A vulgar fraction glued to the digit before it: "1½" is one and a half, and
# mapping the symbol in place would read it as the eleven-halves of "11/2".
GLUED_FRACTION_RE = re.compile(rf"(\d)\s*([{''.join(FRACTION_MAP)}])")


def plain(s):
    """Wikitext to something a person can read in a recipe step."""
    s = decomment(s)
    s = delink(strip_templates(s))
    # A pipe surviving delink() means the source wrote a link's target and
    # label as plain text — "(Citrus macroptera|citrus macroptera)". The label
    # is the readable half, so keep that and drop the target.
    s = re.sub(r"\(([^()|]*)\|([^()|]*)\)", r"(\2)", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    # Entities first, so &frac12; becomes ½ in time to be split and mapped.
    s = html.unescape(s)
    s = GLUED_FRACTION_RE.sub(r"\1 \2", s)
    for k, v in FRACTION_MAP.items():
        s = s.replace(k, v)
    # En/em dashes in ranges read as hyphens once the markup is gone.
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip()


# ── ingredient lines ────────────────────────────────────────────────────────

# Canonical form per unit, so "tablespoons"/"tbsp." all land on one spelling.
# The values match what the existing catalog already uses.
UNITS = {
    "tablespoon": "tablespoon", "tablespoons": "tablespoon", "tbsp": "tbsp",
    "tbsps": "tbsp", "tbs": "tbsp", "teaspoon": "teaspoon",
    "teaspoons": "teaspoon", "tsp": "tsp", "tsps": "tsp",
    "cup": "cup", "cups": "cup",
    "ounce": "ounce", "ounces": "ounce", "oz": "oz",
    "pound": "pound", "pounds": "pound", "lb": "lb", "lbs": "lb",
    "gram": "gram", "grams": "gram", "g": "g",
    "kilogram": "kilogram", "kilograms": "kilogram", "kg": "kg",
    "litre": "liter", "litres": "liter", "liter": "liter", "liters": "liter",
    "l": "l", "millilitre": "ml", "millilitres": "ml",
    "milliliter": "ml", "milliliters": "ml", "ml": "ml",
    "pint": "pint", "pints": "pint", "quart": "quart", "quarts": "quart",
    "can": "can", "cans": "can", "package": "package", "packages": "package",
    "packet": "package", "packets": "package",
    "bunch": "bunch", "bunches": "bunch",
    "clove": "clove", "cloves": "clove",
    "slice": "slice", "slices": "slice",
    "piece": "piece", "pieces": "piece",
    "head": "head", "heads": "head", "stalk": "stalk", "stalks": "stalk",
    "sprig": "sprig", "sprigs": "sprig",
    "pinch": "pinch", "pinches": "pinch", "dash": "dash",
    "stick": "stick", "sticks": "stick", "inch": "inch", "inches": "inch",
    "handful": "handful", "handfuls": "handful",
    "drop": "drop", "drops": "drop",
}

UNIT_RE = "|".join(sorted((re.escape(u) for u in UNITS), key=len, reverse=True))

# A leading quantity: "1", "1 1/2", "1/2", "4-5", "2.5". A range keeps only its
# low end, because parseFrac() in the app reads "4-5" as 4 anyway — storing the
# range would print a number the app never uses.
#
# Ordered longest-first, and that order is the whole point: with the bare
# "\d+" branch first, "1/2 tsp salt" matches just the "1" and leaves an item
# reading "/2 tsp salt". Mixed numbers before fractions before plain digits.
_QTY = r"\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?"
AMOUNT_RE = re.compile(rf"^({_QTY})(?:\s*-\s*(?:{_QTY}))?")

# Only ever applied directly after an amount. A unit word standing on its own
# is the ingredient, not a measure of it — "Cloves, chopped" is the spice, and
# reading its first word as a unit would drop the ingredient entirely.
UNIT_AFTER_AMOUNT_RE = re.compile(rf"^({UNIT_RE})s?\b\.?", re.IGNORECASE)


def parse_ingredient(raw):
    """One '* ...' bullet into {amount, unit, item}, or None if it isn't one."""
    s = plain(raw)
    s = re.sub(r"^[*:;#\s]+", "", s).strip()
    if len(s) < 2:
        return None

    amount, unit = "", ""
    m = AMOUNT_RE.match(s)
    if m:
        amount = m.group(1)
        s = s[m.end():].lstrip()
        mu = UNIT_AFTER_AMOUNT_RE.match(s)
        if mu:
            unit = mu.group(1)
            s = s[mu.end():].lstrip()
    item = s

    # "1 pinch of turmeric" and "2 cups of milk" leave a dangling "of".
    item = re.sub(r"^(?:of|de)\s+", "", item, flags=re.I).strip()
    item = item.strip(" .,;-")

    # A bullet whose whole content was a quantity ("* 2 cups") has no item to
    # shop for; and a heading bullet ("* For the dough:") has no quantity. Both
    # are noise rather than ingredients.
    if not item:
        return None
    if re.match(r"^for the\b", item, re.I) or item.endswith(":"):
        return None

    return {
        "amount": amount.strip(),
        "unit": UNITS.get(unit.lower(), unit.lower()) if unit else "",
        "item": item,
    }


# ── sections ────────────────────────────────────────────────────────────────

HEADING_RE = re.compile(r"^(={2,})\s*(.+?)\s*\1\s*$", re.M)


def section(text, *names):
    """
    The body under the first heading matching any of `names`, at any level.

    Stops at the next heading of the same or shallower depth, so the steps
    under a recipe's "=== Gravy ===" sub-headings stay with its Procedure
    rather than being cut off at the first one.

    Matched on a prefix of the cleaned heading text, because a heading is not
    always just its name — "== Procedure<ref>…</ref> ==" and "== Ingredients
    (for 4) ==" both have to be recognised.
    """
    wanted = tuple(n.lower() for n in names)
    heads = [
        (m.end(), m.start(), len(m.group(1)), plain(m.group(2)).lower().strip(" :"))
        for m in HEADING_RE.finditer(text)
    ]
    for i, (body_at, _start, depth, title) in enumerate(heads):
        if not title.startswith(wanted):
            continue
        for nxt_body_at, nxt_start, nxt_depth, _t in heads[i + 1:]:
            if nxt_depth <= depth:
                return text[body_at:nxt_start]
        return text[body_at:]
    return ""


def summary_fields(text):
    """The {{recipesummary}} / {{Recipe summary}} box as a dict of lowercase keys."""
    m = re.search(r"\{\{\s*recipe[ _]?summary\s*(.*?)\}\}", text, re.I | re.S)
    if not m:
        return {}
    out = {}
    # Split on pipes that aren't inside a nested link or template.
    body, depth = m.group(1), 0
    field = ""
    for ch in body:
        if ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
        if ch == "|" and depth <= 0:
            out.update(_kv(field))
            field = ""
        else:
            field += ch
    out.update(_kv(field))
    return out


def _kv(field):
    if "=" not in field:
        return {}
    k, v = field.split("=", 1)
    return {k.strip().lower(): v.strip()}


def parse_int(s):
    """The first whole number in a string, low end of any range."""
    m = re.search(r"\d+", s or "")
    return int(m.group()) if m else None


def parse_minutes(s):
    """'1 hour 20 minutes' -> 80. Returns None when there's nothing to read."""
    if not s:
        return None
    s = plain(s).lower()
    total = 0
    for n, unit in re.findall(r"(\d+(?:\.\d+)?)\s*(hour|hr|minute|min|day)", s):
        n = float(n)
        total += n * {"hour": 60, "hr": 60, "minute": 1, "min": 1, "day": 1440}[unit]
    if total:
        return int(total)
    # A bare number in a time field means minutes.
    lone = re.fullmatch(r"\s*(\d+)\s*", s)
    return int(lone.group(1)) if lone else None


# ── categories ──────────────────────────────────────────────────────────────

# Wikibooks names a course; the catalog names a section. Anything unmapped
# falls back to Main Dish, and the report lists it so this table can grow.
COURSE = {
    "main course recipes": "Main Dish",
    "main dish recipes": "Main Dish",
    "main courses": "Main Dish",
    "side dish recipes": "Side Dish",
    "side dishes": "Side Dish",
    "condiment recipes": "Side Dish",
    "sauce recipes": "Side Dish",
    "chutney recipes": "Side Dish",
    "pickle recipes": "Side Dish",
    "marinade recipes": "Side Dish",
    "spice mix recipes": "Side Dish",
    "dessert recipes": "Dessert",
    "recipes for dessert": "Dessert",
    "desserts": "Dessert",
    "sweets": "Dessert",
    "confection recipes": "Dessert",
    "pudding recipes": "Dessert",
    "snack recipes": "Snack & Appetizer",
    "snacks": "Snack & Appetizer",
    "appetizer recipes": "Snack & Appetizer",
    "appetizers": "Snack & Appetizer",
    "fritter recipes": "Snack & Appetizer",
    "bread recipes": "Bread & Baking",
    "flatbread recipes": "Bread & Baking",
    "breads": "Bread & Baking",
    "beverage recipes": "Drink",
    "beverages": "Drink",
    "drink recipes": "Drink",
    "breakfast recipes": "Breakfast",
    "salad recipes": "Salad",
    "salads": "Salad",
    "soup recipes": "Soup & Stew",
    "soups": "Soup & Stew",
    "stew recipes": "Soup & Stew",
}

DIET = {
    "vegan recipes": ["vegan", "vegetarian"],
    "vegetarian recipes": ["vegetarian"],
    "lacto-vegetarian recipes": ["vegetarian"],
    "ovo-lacto vegetarian recipes": ["vegetarian"],
    "naturally gluten-free recipes": ["gluten-free"],
    "gluten-free recipes": ["gluten-free"],
}


def categories_of(text):
    return [c.strip().lower() for c in re.findall(r"\[\[Category:([^\]|]+)", text, re.I)]


# ── API ─────────────────────────────────────────────────────────────────────

def api(**params):
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001 - retry anything transient
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1} after {e}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))


def category_titles(category):
    """Page titles in a category, following continuation."""
    titles, cont = [], {}
    while True:
        d = api(
            action="query", list="categorymembers",
            cmtitle=f"Category:{category}", cmnamespace=COOKBOOK_NS,
            cmlimit="500", **cont,
        )
        titles += [m["title"] for m in d.get("query", {}).get("categorymembers", [])]
        if "continue" not in d:
            return titles
        cont = d["continue"]


def wikitext(titles):
    """{title: wikitext} for up to 50 titles per request, as the API allows."""
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = api(
            action="query", titles="|".join(batch),
            prop="revisions", rvprop="content", rvslots="main",
        )
        for p in d.get("query", {}).get("pages", []):
            revs = p.get("revisions")
            if revs:
                out[p["title"]] = revs[0]["slots"]["main"]["content"]
        print(f"  fetched {min(i + 50, len(titles))}/{len(titles)}")
        time.sleep(0.4)  # be a polite API client
    return out


# ── assembly ────────────────────────────────────────────────────────────────

def build(title, text, report):
    ing_src = section(text, "Ingredients", "Ingredient")
    proc_src = section(text, "Procedure", "Directions", "Method",
                       "Preparation", "Instructions")

    ingredients = []
    for line in ing_src.splitlines():
        if not line.lstrip().startswith("*"):
            continue
        parsed = parse_ingredient(line)
        if parsed:
            ingredients.append(parsed)

    steps = []
    for line in proc_src.splitlines():
        stripped = line.lstrip()
        if not stripped.startswith("#"):
            continue
        # "#:" is a continuation note under the previous numbered step, not a
        # step of its own — append it rather than renumbering the recipe.
        cont = stripped.startswith("#:") or stripped.startswith("#*")
        # plain() renders the markup but leaves the list markers, and a step
        # that still reads "# Soak the rice" shows the wikitext to the cook.
        s = re.sub(r"^[#*:;\s]+", "", plain(stripped)).strip()
        if not s:
            continue
        if cont and steps:
            steps[-1] += " " + s
        else:
            steps.append(s)

    # A recipe with no ingredients or no method isn't a recipe the app can
    # show: the pantry has nothing to match and the modal has nothing to read.
    if len(ingredients) < 2 or len(steps) < 1:
        report["skipped"].append(
            f"{title} (ingredients={len(ingredients)}, steps={len(steps)})"
        )
        return None

    fields = summary_fields(text)
    cats = categories_of(text)

    course = None
    for key in (fields.get("category", ""), *cats):
        hit = COURSE.get(plain(key).lower())
        if hit:
            course = hit
            break
    if not course:
        summary_cat = plain(fields.get("category", "")).lower()
        if summary_cat:
            report["unmapped"][summary_cat] += 1
        course = "Main Dish"

    dietary = []
    for c in cats:
        for tag in DIET.get(c, []):
            if tag not in dietary:
                dietary.append(tag)

    name = re.sub(r"^Cookbook:", "", title).strip()
    slug = urllib.parse.quote(title.replace(" ", "_"), safe=":()_,'!")

    recipe = {
        "name": name,
        "category": course,
        "dietary": dietary,
        "ingredients": ingredients,
        "steps": steps,
        "source": "Wikibooks Cookbook",
        "sourceUrl": f"https://en.wikibooks.org/wiki/{slug}",
        "license": "CC-BY-SA-4.0",
    }

    servings = parse_int(plain(fields.get("servings", "")))
    if servings:
        recipe["servings"] = servings
    minutes = parse_minutes(fields.get("time", ""))
    if minutes:
        recipe["timeMinutes"] = minutes
    return recipe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--merge", action="store_true",
                    help="append the imported recipes to src/data/recipes.json")
    args = ap.parse_args()

    print("Collecting titles…")
    titles = []
    for c in CATEGORIES:
        found = category_titles(c)
        print(f"  {c}: {len(found)}")
        titles += found
    titles = sorted(set(titles))
    print(f"{len(titles)} unique pages\n")

    print("Fetching wikitext…")
    pages = wikitext(titles)
    print(f"{len(pages)} pages fetched\n")

    report = {"skipped": [], "unmapped": Counter()}
    recipes, seen = [], set()

    existing = {r["name"].lower() for r in json.loads(CATALOG.read_text())}

    for title in titles:
        if title in EXCLUDE:
            report["skipped"].append(f"{title} (excluded: not Indian cooking)")
            continue
        text = pages.get(title)
        if not text:
            report["skipped"].append(f"{title} (no content)")
            continue
        # A redirect has no recipe of its own; the target is in the list too.
        if re.match(r"\s*#redirect", text, re.I):
            continue
        r = build(title, text, report)
        if not r:
            continue
        key = r["name"].lower()
        # Catalog names have to stay unique: keyForName() resolves saved
        # ratings and notes by name for anything created before recipe keys.
        if key in seen or key in existing:
            report["skipped"].append(f"{title} (duplicate name)")
            continue
        seen.add(key)
        recipes.append(r)

    OUT.write_text(json.dumps(recipes, indent=2, ensure_ascii=False) + "\n")

    lines = sum(len(r["ingredients"]) for r in recipes)
    print(f"── {len(recipes)} recipes, {lines} ingredient lines -> {OUT.relative_to(ROOT)}")
    print(f"   with servings:  {sum('servings' in r for r in recipes)}")
    print(f"   with time:      {sum('timeMinutes' in r for r in recipes)}")
    print(f"   with diet tags: {sum(bool(r['dietary']) for r in recipes)}")
    print(f"   categories:     {dict(Counter(r['category'] for r in recipes))}")
    if report["unmapped"]:
        print(f"\n   unmapped courses (fell back to Main Dish): {dict(report['unmapped'])}")
    if report["skipped"]:
        print(f"\n   skipped {len(report['skipped'])}:")
        for s in report["skipped"][:40]:
            print(f"     - {s}")

    if args.merge:
        catalog = json.loads(CATALOG.read_text())
        catalog += recipes
        CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
        print(f"\n── merged: recipes.json now holds {len(catalog)} recipes")


if __name__ == "__main__":
    main()
