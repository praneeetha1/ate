import json, re
from collections import defaultdict

# ── Unit list ────────────────────────────────────────────────────────────────
UNITS = [
    "tablespoon","tablespoons","tbsp","teaspoon","teaspoons","tsp",
    "cup","cups","c","ounce","ounces","oz","pound","pounds","lb","lbs",
    "gram","grams","g","kilogram","kilograms","kg",
    "liter","liters","l","milliliter","milliliters","ml",
    "pint","pints","pt","quart","quarts","qt","gallon","gallons",
    "can","cans","package","packages","pkg","bunch","bunches",
    "clove","cloves","slice","slices","piece","pieces",
    "head","heads","stalk","stalks","sprig","sprigs",
    "pinch","dash","serving","servings","stick","sticks","inch","inches",
]

FRACTION_MAP = {"½":"1/2","¼":"1/4","¾":"3/4","⅓":"1/3","⅔":"2/3",
                "⅛":"1/8","⅜":"3/8","⅝":"5/8","⅞":"7/8"}

def normalize_fractions(s):
    for k, v in FRACTION_MAP.items():
        s = s.replace(k, v)
    return s

def parse_ingredient(raw):
    raw = normalize_fractions(raw.strip())
    # Strip HTML tags and markdown links
    raw = re.sub(r'<[^>]+>', '', raw).strip()
    raw = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', raw)
    raw = raw.strip()
    if not raw or len(raw) < 2:
        return None
    unit_pat = "|".join(re.escape(u) for u in sorted(UNITS, key=len, reverse=True))
    pattern = re.compile(
        r'^([\d\s/\.]+(?:\s[\d/]+)?)\s*'
        r'(?:(' + unit_pat + r')s?\b\.?)?\s*'
        r'(.+)$', re.IGNORECASE
    )
    m = pattern.match(raw)
    if m:
        amount = m.group(1).strip()
        unit   = m.group(2).strip().lower() if m.group(2) else ""
        item   = re.sub(r'^[,;]+\s*', '', m.group(3).strip())
        return {"amount": amount, "unit": unit, "item": item}
    return {"amount": "", "unit": "", "item": raw}

# ── Category inference ───────────────────────────────────────────────────────
# Priority order matters — checked top-to-bottom, first match wins
CATEGORY_RULES = [
    ("Breakfast",         ["breakfast","brunch","pancake","waffle","muffin","granola",
                           "oatmeal","ebelskiver","french toast","eggs benedict"]),
    ("Dessert",           ["dessert","cake","pie","cookie","brownie","chocolate",
                           "pudding","ice cream","candy","cheesecake","tart","fudge",
                           "biscotti","meringue","sorbet"]),
    ("Soup & Stew",       ["soup","stew","chili","chowder","bisque","broth","ramen","pho"]),
    ("Salad",             ["salad","slaw","dressing","coleslaw"]),
    ("Drink",             ["drink","cocktail","smoothie","juice","tea","coffee",
                           "lemonade","mocktail","punch","milkshake"]),
    ("Snack & Appetizer", ["snack","appetizer","dip","spread","starter","finger food",
                           "hors d","bruschetta","crostini"]),
    ("Pasta & Noodles",   ["pasta","noodle","spaghetti","linguine","fettuccine","penne",
                           "lasagna","macaroni","spaetzle","gnocchi","ramen noodle"]),
    ("Bread & Baking",    ["bread","biscuit","roll","muffin","scone","cracker","focaccia",
                           "pretzel","bagel","flatbread"]),
    ("Side Dish",         ["sides","side","rice","pilaf","roasted vegetable",
                           "casserole","stuffing","couscous"]),
    ("Vegetarian",        ["vegetarian","vegan","tofu","tempeh","legume","lentil"]),
    ("Quick Meal",        ["sandwich","wrap","taco","pizza","quesadilla","burger",
                           "flatbread pizza","quick"]),
    ("Main Dish",         ["main","chicken","beef","pork","lamb","fish","seafood",
                           "salmon","shrimp","turkey","steak","roast","curry",
                           "stir fry","grill","bake","braise","roast"]),
]

def infer_category(tags, name, instructions=""):
    combined = " ".join(tags).lower() + " " + name.lower()
    for cat, keywords in CATEGORY_RULES:
        if any(kw in combined for kw in keywords):
            return cat
    return "Main Dish"

# ── Dietary tags ─────────────────────────────────────────────────────────────
MEAT_WORDS = ["chicken","beef","pork","lamb","turkey","bacon","ham","sausage",
              "prosciutto","lard","anchovy","fish","salmon","shrimp","tuna",
              "crab","lobster","clam","mussel","oyster","scallop","squid",
              "venison","duck","veal","rabbit","ground beef","ground pork"]

def infer_dietary(raw_tags, ingredients_raw):
    tags = set()
    raw_lower = [i.lower() for i in ingredients_raw]
    combined_ings = " ".join(raw_lower)

    if "vegetarian" in raw_tags:
        tags.add("vegetarian")
    elif not any(m in combined_ings for m in MEAT_WORDS):
        tags.add("vegetarian")

    return list(tags)

# ── Instruction → steps ──────────────────────────────────────────────────────
def split_steps(instructions):
    if not instructions:
        return []
    text = re.sub(r'\r\n|\r', '\n', instructions)
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    steps = []
    for para in paragraphs:
        if len(para) > 350:
            sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', para)
            steps.extend(s.strip() for s in sentences if s.strip())
        else:
            steps.append(para)
    cleaned = []
    for s in steps:
        s = re.sub(r'^(?:step\s+)?\d+[.:)]\s*', '', s, flags=re.IGNORECASE).strip()
        # Skip pure header lines like "TO MAKE SAUCE:" or "FILLING:"
        if s and not re.match(r'^[A-Z\s:]{5,}:$', s):
            cleaned.append(s)
    return cleaned

def total_minutes(recipe):
    seconds = (recipe.get("preptime") or 0) + (recipe.get("cooktime") or 0)
    return round(seconds / 60) if seconds > 0 else None

# ── Clean single recipe ───────────────────────────────────────────────────────
def clean_recipe(raw):
    name = (raw.get("name") or "").strip()
    if not name:
        return None
    instructions = (raw.get("instructions") or "").strip()
    if len(instructions) < 40:
        return None
    raw_ings = raw.get("ingredients") or []
    # Filter HTML artifacts and parse
    parsed_ings = []
    for ing_str in raw_ings:
        if not ing_str or re.match(r'^\s*$', ing_str):
            continue
        if re.match(r'^<', ing_str.strip()):     # pure HTML tag line → skip
            continue
        p = parse_ingredient(ing_str)
        if p and p["item"] and len(p["item"]) > 1:
            parsed_ings.append(p)
    if len(parsed_ings) < 2:
        return None
    steps = split_steps(instructions)
    if len(steps) < 1:
        return None
    tags = raw.get("tags") or []
    category = infer_category(tags, name, instructions)
    dietary  = infer_dietary(tags, [i["item"] for i in parsed_ings])
    result = {
        "name":        name,
        "category":    category,
        "dietary":     dietary,
        "ingredients": parsed_ings,
        "steps":       steps,
    }
    t = total_minutes(raw)
    if t and 0 < t < 600:    # skip implausible times (>10 hours)
        result["timeMinutes"] = t
    return result

# ── Main ──────────────────────────────────────────────────────────────────────
with open("recipes_raw.json") as f:
    raw_data = json.load(f)

cleaned, skipped = [], 0
for key, recipe in raw_data.items():
    r = clean_recipe(recipe)
    if r:
        cleaned.append(r)
    else:
        skipped += 1

print(f"Raw: {len(raw_data)}  |  Cleaned: {len(cleaned)}  |  Skipped: {skipped}")

# Take up to 300 recipes with good category diversity
TARGET = 300
by_cat = defaultdict(list)
for r in cleaned:
    by_cat[r["category"]].append(r)

cats = list(by_cat.keys())
print(f"Categories: {cats}")

# Distribute evenly, top up with remainder
per_cat = TARGET // len(cats)
sample  = []
for cat in cats:
    sample.extend(by_cat[cat][:per_cat])

# Fill remaining slots from whatever has leftovers, in category order
for cat in cats:
    if len(sample) >= TARGET:
        break
    extras = by_cat[cat][per_cat:]
    sample.extend(extras[:TARGET - len(sample)])

sample = sample[:TARGET]

with open("recipes.json", "w") as f:
    json.dump(sample, f, indent=2)

print(f"\nSaved {len(sample)} recipes to recipes.json")
print("\nCategory breakdown:")
cat_counts = defaultdict(int)
for r in sample:
    cat_counts[r["category"]] += 1
for cat in sorted(cat_counts):
    print(f"  {cat:<22} {cat_counts[cat]:>3}")

veg_count  = sum(1 for r in sample if "vegetarian" in r.get("dietary", []))
time_count = sum(1 for r in sample if "timeMinutes" in r)
quick      = sum(1 for r in sample if r.get("timeMinutes", 999) <= 30)
print(f"\nVegetarian: {veg_count}  |  Has time: {time_count}  |  Quick (≤30 min): {quick}")
