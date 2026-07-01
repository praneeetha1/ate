import json
import re

# ── Category inference ────────────────────────────────────────────────────────
CATEGORY_MAP = {
    "breakfast": ["breakfast", "brunch", "egg", "pancake", "waffle", "muffin", "oatmeal", "granola"],
    "Dessert": ["dessert", "cake", "pie", "cookie", "brownie", "chocolate", "pudding",
                "ice cream", "candy", "sweet", "cheesecake", "biscotti", "tart", "fudge"],
    "Soup & Stew": ["soup", "stew", "chili", "chowder", "bisque", "broth"],
    "Salad": ["salad", "slaw", "dressing"],
    "Snack & Appetizer": ["snack", "appetizer", "dip", "spread", "chips", "starter"],
    "Side Dish": ["sides", "side", "rice", "noodles", "pasta", "bread", "biscuit",
                  "casserole", "roasted vegetables"],
    "Breakfast": ["breakfast", "brunch", "pancake", "waffle", "muffin", "granola",
                  "oatmeal", "ebelskiver", "toast", "egg"],
    "Quick Meal": ["quick", "sandwich", "wrap", "taco", "pizza", "30 minute"],
    "Main Dish": ["main", "chicken", "beef", "pork", "lamb", "fish", "seafood",
                  "salmon", "shrimp", "turkey", "steak", "roast", "curry", "stir fry"],
    "Vegetarian": ["vegetarian", "vegan", "tofu", "legume", "bean", "lentil"],
    "Drink": ["drink", "cocktail", "smoothie", "juice", "tea", "coffee", "lemonade"],
}

PRIORITY_ORDER = [
    "Breakfast", "Dessert", "Soup & Stew", "Salad", "Snack & Appetizer",
    "Drink", "Vegetarian", "Side Dish", "Quick Meal", "Main Dish"
]

def infer_category(tags, name):
    combined = " ".join(tags).lower() + " " + name.lower()
    for cat in PRIORITY_ORDER:
        keywords = CATEGORY_MAP.get(cat, [])
        if any(kw in combined for kw in keywords):
            return cat
    return "Main Dish"

# ── Ingredient parsing ────────────────────────────────────────────────────────
UNITS = [
    "tablespoon", "tablespoons", "tbsp", "teaspoon", "teaspoons", "tsp",
    "cup", "cups", "c",
    "ounce", "ounces", "oz",
    "pound", "pounds", "lb", "lbs",
    "gram", "grams", "g",
    "kilogram", "kilograms", "kg",
    "liter", "liters", "l",
    "milliliter", "milliliters", "ml",
    "pint", "pints", "pt",
    "quart", "quarts", "qt",
    "gallon", "gallons",
    "can", "cans",
    "package", "packages", "pkg",
    "bunch", "bunches",
    "clove", "cloves",
    "slice", "slices",
    "piece", "pieces",
    "head", "heads",
    "stalk", "stalks",
    "sprig", "sprigs",
    "pinch", "dash",
    "serving", "servings",
    "stick", "sticks",
]

FRACTION_MAP = {"½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3",
                "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8"}

def normalize_fractions(s):
    for k, v in FRACTION_MAP.items():
        s = s.replace(k, v)
    return s

def parse_ingredient(raw):
    raw = normalize_fractions(raw.strip())
    # Strip markdown links like [text](url)
    raw = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', raw)
    # Try to match: amount (including fractions like "1 1/2") followed by optional unit then item
    unit_pattern = "|".join(re.escape(u) for u in sorted(UNITS, key=len, reverse=True))
    pattern = re.compile(
        r'^([\d\s/\.]+(?:\s[\d/]+)?)\s*'      # amount: "1", "1 1/2", "2/3", "1.5"
        r'(?:(' + unit_pattern + r')s?\b\.?)?\s*'  # optional unit
        r'(.+)$',                              # item (rest of string)
        re.IGNORECASE
    )
    m = pattern.match(raw)
    if m:
        amount = m.group(1).strip()
        unit = m.group(2).strip() if m.group(2) else ""
        item = m.group(3).strip()
        # Clean item: strip leading commas/punctuation and parenthetical prep notes
        item = re.sub(r'^[,;]+\s*', '', item)
        item = item.strip()
        # Normalize unit to lowercase
        unit = unit.lower() if unit else ""
        return {"amount": amount, "unit": unit, "item": item}
    else:
        # No number found — treat whole string as item
        return {"amount": "", "unit": "", "item": raw}

# ── Instructions → steps ──────────────────────────────────────────────────────
def split_steps(instructions):
    if not instructions:
        return []
    # Replace \r\n and multiple newlines with a single newline
    text = re.sub(r'\r\n', '\n', instructions)
    text = re.sub(r'\n{2,}', '\n\n', text)
    # Split on double newlines first (paragraph breaks)
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    steps = []
    for para in paragraphs:
        # If a paragraph is very long, split on sentence endings that look like step transitions
        if len(para) > 300:
            sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', para)
            steps.extend([s.strip() for s in sentences if s.strip()])
        else:
            steps.append(para)
    # Remove step-number prefixes like "Step 1:" or "1."
    cleaned = []
    for s in steps:
        s = re.sub(r'^(?:step\s+)?\d+[.:)]\s*', '', s, flags=re.IGNORECASE)
        if s:
            cleaned.append(s)
    return cleaned

# ── Time conversion ───────────────────────────────────────────────────────────
def total_minutes(recipe):
    seconds = (recipe.get("preptime") or 0) + (recipe.get("cooktime") or 0)
    if seconds > 0:
        return round(seconds / 60)
    return None

# ── Main cleaning ─────────────────────────────────────────────────────────────
def clean_recipe(raw):
    name = raw.get("name", "").strip()
    if not name:
        return None
    ingredients_raw = raw.get("ingredients", [])
    if len(ingredients_raw) < 2:
        return None
    instructions = raw.get("instructions", "")
    if not instructions or len(instructions) < 30:
        return None
    tags = raw.get("tags", [])
    category = infer_category(tags, name)
    ingredients = [parse_ingredient(i) for i in ingredients_raw if i.strip()]
    # Drop recipes with completely un-parseable ingredient lists
    if not ingredients:
        return None
    steps = split_steps(instructions)
    if not steps:
        return None
    result = {
        "name": name,
        "category": category,
        "ingredients": ingredients,
        "steps": steps,
    }
    t = total_minutes(raw)
    if t and t > 0:
        result["timeMinutes"] = t
    return result

# ── Run ───────────────────────────────────────────────────────────────────────
with open("recipes_raw.json") as f:
    raw_data = json.load(f)

cleaned = []
skipped = 0
for key, recipe in raw_data.items():
    result = clean_recipe(recipe)
    if result:
        cleaned.append(result)
    else:
        skipped += 1

# Take a diverse 80-recipe sample: spread across categories
from collections import defaultdict
by_cat = defaultdict(list)
for r in cleaned:
    by_cat[r["category"]].append(r)

sample = []
TARGET = 80
cats = list(by_cat.keys())
per_cat = max(1, TARGET // len(cats))

for cat in cats:
    sample.extend(by_cat[cat][:per_cat])

# Top up if we have fewer than TARGET
remaining = [r for r in cleaned if r not in sample]
sample.extend(remaining[:max(0, TARGET - len(sample))])
sample = sample[:TARGET]

with open("recipes.json", "w") as f:
    json.dump(sample, f, indent=2)

print(f"Total raw: {len(raw_data)}")
print(f"Cleaned successfully: {len(cleaned)}")
print(f"Skipped (too messy): {skipped}")
print(f"Saved to recipes.json: {len(sample)} recipes")
print(f"\nCategory breakdown:")
cat_counts = defaultdict(int)
for r in sample:
    cat_counts[r["category"]] += 1
for cat, count in sorted(cat_counts.items()):
    print(f"  {cat}: {count}")
print(f"\nSample recipe: {sample[0]['name']}")
print(f"  Ingredients: {sample[0]['ingredients'][:2]}")
print(f"  Steps: {len(sample[0]['steps'])} steps")
