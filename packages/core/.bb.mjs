// src/recipes/index.ts
var MODIFIERS = /* @__PURE__ */ new Set([
  "fresh",
  "dried",
  "ground",
  "whole",
  "large",
  "small",
  "medium",
  "chopped",
  "sliced",
  "minced",
  "grated",
  "finely",
  "roughly",
  "ripe",
  "raw",
  "cooked",
  "unsalted",
  "salted",
  "plain",
  "extra",
  "virgin",
  "light",
  "dark",
  "hot",
  "cold",
  "warm",
  "boiling",
  "chilled",
  "room",
  "temperature",
  "good",
  "quality",
  "free",
  "range",
  "organic",
  "toasted",
  "roasted",
  "smoked",
  "frozen",
  "canned",
  "jarred",
  "tinned",
  "neutral",
  "fine",
  "coarse",
  "thick",
  "thin",
  "mild",
  "sweet",
  "sour",
  "bitter",
  "strong",
  "weak",
  "best",
  "leaf",
  "leaves",
  "clove",
  "cloves",
  "seed",
  "seeds",
  "pod",
  "pods",
  "stick",
  "sticks",
  "sprig",
  "sprigs",
  "piece",
  "pieces",
  "bunch",
  "head",
  "stalk",
  "stalks",
  "slice",
  "slices",
  "pinch",
  "handful",
  "knob",
  "strip",
  "strips"
]);
var PANTRY_STAPLES = /* @__PURE__ */ new Set([
  "water",
  "ice",
  "salt",
  "pepper",
  "oil",
  "sugar",
  "flour",
  "stock",
  "broth",
  "sauce",
  "paste",
  "juice",
  "zest",
  "powder",
  "spice",
  "herb",
  "seasoning",
  "garnish",
  "dressing",
  "batter",
  "dough",
  "mixture",
  "liquid"
]);
var COLLECTIVE_NOUNS = /* @__PURE__ */ new Set([
  "spice",
  "spices",
  "herb",
  "herbs",
  "vegetable",
  "vegetables",
  "aromatic",
  "aromatics",
  "seasoning",
  "seasonings",
  "ingredient",
  "ingredients",
  "topping",
  "toppings",
  "filling",
  "garnish",
  "garnishes",
  "marinade",
  "mixture",
  "remainder",
  "rest",
  "solids",
  "liquids",
  "greens",
  "produce"
]);
var COMPOSED_PREPARATIONS = /* @__PURE__ */ new Set([
  "bechamel",
  "b\xE9chamel",
  "roux",
  "ragu",
  "rag\xF9",
  "ragout",
  "caramel",
  "custard",
  "ganache",
  "praline",
  "dough",
  "batter",
  "slurry",
  "brine",
  "stock",
  "sauce",
  "paste",
  "marinade",
  "dressing",
  "glaze",
  "reduction",
  "sofrito",
  "mirepoix",
  "gremolata"
]);
var EQUIPMENT_WORDS = /* @__PURE__ */ new Set([
  "pan",
  "pot",
  "skillet",
  "wok",
  "saucepan",
  "stockpot",
  "casserole",
  "dish",
  "tray",
  "sheet",
  "rack",
  "bowl",
  "mortar",
  "pestle",
  "skewer",
  "string",
  "whisk",
  "spoon",
  "spatula",
  "knife",
  "board",
  "grater",
  "strainer",
  "sieve",
  "colander",
  "ricer",
  "blender",
  "processor",
  "mixer",
  "thermometer",
  "tin",
  "mould",
  "mold",
  "paper",
  "foil",
  "cloth",
  "towel",
  "jar",
  "lid",
  "oven",
  "griddle",
  "steamer",
  "basket",
  "ladle",
  "tongs",
  "peeler",
  "roller",
  "pin"
]);
var SYNONYMS = [
  ["scallion", "spring onion", "green onion"],
  ["coriander", "cilantro"],
  ["aubergine", "eggplant"],
  ["courgette", "zucchini"],
  ["chickpea", "garbanzo"],
  ["prawn", "shrimp"],
  ["beetroot", "beet"],
  ["rocket", "arugula"],
  ["cornflour", "cornstarch"],
  // Common name vs the formal/DOP name a list often uses (parmesan vs the
  // listed "Parmigiano-Reggiano"). Head token only — phrases split on
  // spaces/hyphens before folding.
  ["parmesan", "parmigiano"]
];
var synGroup = /* @__PURE__ */ new Map();
SYNONYMS.forEach((grp, i) => grp.forEach((w) => synGroup.set(w, i)));
function stem(w) {
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ves") && w.length > 4) return `${w.slice(0, -3)}f`;
  if (w.endsWith("oes") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}
var fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function contentWords(phrase) {
  return fold(phrase ?? "").toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !MODIFIERS.has(w)).map((w) => {
    const s = stem(w);
    const g = synGroup.get(s);
    return g === void 0 ? s : `syn${g}`;
  });
}
var headNoun = (item) => {
  const words = fold(item).toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/);
  return words[words.length - 1] ?? "";
};
function isNonIngredient(item) {
  const head = headNoun(item);
  if (EQUIPMENT_WORDS.has(head) || COLLECTIVE_NOUNS.has(head) || COMPOSED_PREPARATIONS.has(head)) return true;
  const words = contentWords(item);
  return words.length > 0 && words.every((w) => PANTRY_STAPLES.has(w));
}
function findPhantomIngredients(named, available, dishName = "") {
  const covered = /* @__PURE__ */ new Set();
  for (const ing of available) for (const w of contentWords(ing)) covered.add(w);
  for (const w of contentWords(dishName)) covered.add(w);
  const phantoms = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of named) {
    if (isNonIngredient(item)) continue;
    const words = contentWords(item);
    if (!words.length) continue;
    if (words.some((w) => covered.has(w))) continue;
    const sig = words.slice().sort().join("+");
    if (seen.has(sig)) continue;
    seen.add(sig);
    phantoms.push(item);
  }
  return phantoms;
}
function checkRecipeShoppingList(recipe, namedByLevel, now) {
  const shared = recipe.ingredients.filter((i) => !i.level);
  const findings = [];
  for (const level of Object.keys(namedByLevel)) {
    const named = namedByLevel[level] ?? [];
    const available = [...shared, ...recipe.ingredients.filter((i) => i.level === level)].map((i) => i.name);
    for (const term of findPhantomIngredients(named, available, recipe.name)) {
      findings.push({
        level,
        term,
        message: `The ${level} method uses "${term}" but it is not in the ingredients for that version.`
      });
    }
  }
  return { status: findings.length ? "fail" : "pass", checked_at: now, findings };
}
export {
  checkRecipeShoppingList,
  findPhantomIngredients
};
