// PORTED FROM THE COMPANION, 28 Jul. Lives in core so the extension dashboard
// and the IDE read the SAME logic — the two surfaces are meant to be identical,
// and a third copy of a 400-line classifier is how that stops being true.
//
// Core holds no HealthProfile by design (see types.ts), so where the companion
// passed a profile these take the kitchen numbers they actually used.
//
/**
 * Which part of the shop an ingredient comes from.
 *
 * There is no aisle column in the database and there should not be one: an
 * aisle is a property of a SHOP, not of an ingredient. Tesco and a Chinese
 * supermarket file fish sauce in different places, and a recipe corpus that
 * spans forty cuisines would need a different answer per country. So this is a
 * presentation-time classifier over the ingredient name, deliberately kept
 * local and deterministic — it never calls a model, it works on a plane, and
 * the same list always groups the same way.
 *
 * Built from the actual corpus rather than imagination: the 1,733 distinct
 * normalised ingredient names across 10,815 recipe lines were pulled and
 * ordered by frequency, and the rules below were written against the head of
 * that distribution. Coverage is measured, not assumed — see the coverage
 * script in the health planning notes.
 */

/**
 * Reduce an ingredient name to the thing you actually buy.
 *
 * "finely chopped yellow onion", "yellow onion" and "1 yellow onion, sliced"
 * are one line on a shopping list. Only PREP words go — how it was cut never
 * changes what it is, but "smoked" paprika and "unsalted" butter are different
 * products and must survive.
 *
 * This is a deliberate copy of normaliseIngredient in the platform's
 * recipes/nutrition module. The companion is a separate package that has to
 * work with no network, so it cannot import it; and the two must agree exactly
 * or an ingredient would group one way for nutrition and another for shopping.
 * Kept next to aisleFor so the pair cannot drift — every key that reaches the
 * classifier came out of here.
 */
const PREP_WORDS = new Set([
  'chopped', 'sliced', 'minced', 'grated', 'finely', 'roughly', 'diced',
  'crushed', 'shredded', 'cubed', 'julienned', 'halved', 'quartered', 'peeled',
  'trimmed', 'washed', 'rinsed', 'drained', 'beaten', 'melted', 'softened',
  'room', 'temperature', 'optional', 'plus', 'more', 'for', 'to', 'taste',
  'serve', 'garnish', 'about', 'approximately', 'good', 'quality', 'best',
  'fresh',
]);

export function normaliseIngredientName(raw: string): string {
  return raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/,.*$/, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !PREP_WORDS.has(w))
    .map((w) => w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1'))
    .join(' ')
    .trim();
}

export type Aisle =
  | 'produce'
  | 'meat_fish'
  | 'dairy_eggs'
  | 'bakery'
  | 'cupboard'
  | 'spices'
  | 'tins_jars'
  | 'oils_vinegars'
  | 'frozen'
  | 'other';

/** The order a list is walked in the shop. Produce first because it is what
 *  you want on top of the trolley, frozen last because it should spend the
 *  least time out of the freezer. */
export const AISLE_ORDER: Aisle[] = [
  'produce',
  'meat_fish',
  'dairy_eggs',
  'bakery',
  'cupboard',
  'spices',
  'tins_jars',
  'oils_vinegars',
  'frozen',
  'other',
];

/**
 * Things nobody puts on a shopping list.
 *
 * Water is the third most common ingredient in the corpus (320 lines across
 * "water", "warm water", "cold water", "ice water", "filtered water"). Printing
 * "1.4 litres water" at the top of a shopping list is noise that makes the
 * whole list look automated and stupid, so these are dropped before grouping.
 * Dropping is honest here in a way it would not be for food: the recipe still
 * lists the water, we simply do not ask anyone to buy it.
 */
const NOT_SHOPPED = new Set(['water', 'ice', 'ice cube', 'cold water', 'hot water']);

export function isNotShopped(key: string): boolean {
  if (NOT_SHOPPED.has(key)) return true;
  // "warm water", "filtered water", "boiling water" — anything ending in water
  // that is not a named liquid such as "coconut water" or "rose water".
  if (/(^|\s)water$/.test(key)) {
    return !/(coconut|rose|orange blossom|barley|tonic|soda|sparkling|mineral|coconut)\s+water$/.test(key);
  }
  return false;
}

/**
 * term -> aisle.
 *
 * Matching is specificity-first: every term is tried longest-phrase-first, so
 * "coconut milk" reaches tins_jars before "milk" can claim it for dairy, and
 * "coriander seed" reaches spices before "coriander" claims it for produce.
 * That ordering is computed once below, not hand-maintained here, so entries
 * can be added in whatever grouping reads best.
 */
const RULES: Array<[Aisle, string[]]> = [
  // ---- phrases that must beat their own head noun -------------------------
  ['spices', [
    'coriander seed', 'ground coriander', 'coriander powder', 'whole coriander seed',
    'cumin seed', 'ground cumin', 'cumin powder',
    'mustard seed', 'fennel seed', 'celery seed', 'nigella seed', 'caraway seed',
    'dried thyme', 'dried oregano', 'dried mint', 'dried basil', 'dried rosemary',
    'dried parsley', 'dried dill', 'dried sage', 'dried chily', 'dried chili',
    'dried red chili', 'dried chile', 'dried herb', 'dried marjoram',
    'garlic powder', 'onion powder', 'ginger powder', 'ground ginger',
    'chili powder', 'chile powder', 'chily powder', 'red chili powder',
    'chili flake', 'chile flake', 'red pepper flake', 'pepper flake',
    'black pepper', 'white pepper', 'black peppercorn', 'green peppercorn',
    'sichuan peppercorn', 'szechuan peppercorn', 'cayenne pepper',
    'turmeric powder', 'ground turmeric',
    'bay leaf', 'curry leaf', 'kaffir lime leaf', 'lime leaf',
    'green cardamom pod', 'black cardamom', 'cardamom pod',
    'whole clove', 'ground clove', 'ground cinnamon', 'cinnamon stick',
    'ground nutmeg', 'ground allspice', 'allspice berry', 'star anise',
    'saffron thread', 'vanilla bean', 'vanilla pod',
    'garam masala', 'curry powder', 'five spice', 'chinese five spice',
    'italian seasoning', 'herbes de provence', 'ras el hanout', 'baharat',
    'zaatar', 'za atar', 'sumac', 'asafoetida', 'fenugreek', 'ajwain',
    'juniper berry', 'mace', 'paprika', 'smoked paprika', 'sweet paprika',
    'chinese five spice powder', 'shichimi', 'togarashi', 'msg',
    'aleppo pepper', 'gochugaru', 'chaat masala', 'tandoori masala',
  ]],
  ['tins_jars', [
    'coconut milk', 'coconut cream', 'evaporated milk', 'condensed milk',
    'canned tomato', 'tinned tomato', 'chopped tomato', 'crushed tomato',
    'plum tomato', 'tomato paste', 'tomato puree', 'tomato sauce', 'passata',
    'soy sauce', 'light soy sauce', 'dark soy sauce', 'fish sauce',
    'oyster sauce', 'hoisin sauce', 'hoisin', 'sriracha', 'worcestershire sauce',
    'shrimp paste', 'curry paste', 'red curry paste', 'green curry paste',
    'tamarind paste', 'tamarind concentrate', 'tamarind pulp',
    'pomegranate molasse', 'pomegranate molasses', 'peanut butter',
    'chicken stock', 'beef stock', 'vegetable stock', 'fish stock',
    'chicken broth', 'beef broth', 'vegetable broth', 'stock cube', 'bouillon',
    'dijon mustard', 'wholegrain mustard', 'english mustard', 'yellow mustard',
    'canned chickpea', 'tinned chickpea', 'canned bean', 'baked bean',
    'coconut water',
  ]],
  ['oils_vinegars', [
    'olive oil', 'extra virgin olive oil', 'vegetable oil', 'sunflower oil',
    'neutral oil', 'neutral vegetable oil', 'neutral cooking oil', 'cooking oil',
    'sesame oil', 'toasted sesame oil', 'canola oil', 'rapeseed oil',
    'peanut oil', 'groundnut oil', 'coconut oil', 'mustard oil', 'avocado oil',
    'corn oil', 'rice bran oil', 'chili oil', 'chile oil',
    'rice vinegar', 'rice wine vinegar', 'white vinegar', 'malt vinegar',
    'apple cider vinegar', 'cider vinegar', 'red wine vinegar',
    'white wine vinegar', 'balsamic vinegar', 'sherry vinegar', 'black vinegar',
    'distilled vinegar', 'coconut vinegar',
  ]],
  ['dairy_eggs', [
    'sour cream', 'heavy cream', 'double cream', 'single cream',
    'whipping cream', 'clotted cream', 'creme fraiche', 'cream cheese',
    'greek yogurt', 'plain yogurt', 'natural yogurt', 'whole milk',
    'egg yolk', 'egg white', 'large egg', 'hard boiled egg', 'clarified butter',
    'unsalted butter', 'salted butter', 'buttermilk',
  ]],
  ['bakery', [
    'puff pastry', 'filo pastry', 'phyllo pastry', 'shortcrust pastry',
    'spring roll wrapper', 'wonton wrapper', 'rice paper',
  ]],
  ['cupboard', [
    'all purpose flour', 'plain flour', 'bread flour', 'self raising flour',
    'rice flour', 'gram flour', 'chickpea flour', 'corn flour', 'cornflour',
    'whole wheat flour', 'wholemeal flour', 'semolina flour', 'tapioca flour',
    'glutinous rice flour', 'potato starch', 'tapioca starch', 'corn starch',
    'cornstarch', 'baking powder', 'baking soda', 'bicarbonate of soda',
    'instant yeast', 'active dry yeast', 'dry yeast', 'fresh yeast',
    'granulated sugar', 'caster sugar', 'brown sugar', 'palm sugar',
    'icing sugar', 'powdered sugar', 'white sugar', 'demerara sugar',
    'coconut sugar', 'rock sugar', 'jaggery',
    'vanilla extract', 'almond extract', 'sea salt', 'fine sea salt',
    'kosher salt', 'coarse sea salt', 'fine salt', 'table salt', 'rock salt',
    'flaky sea salt', 'black salt', 'kala namak',
    'sesame seed', 'sunflower seed', 'pumpkin seed', 'poppy seed', 'chia seed',
    'flax seed', 'linseed', 'desiccated coconut', 'shredded coconut',
    'maple syrup', 'golden syrup', 'corn syrup', 'rice syrup', 'agave',
    'dark chocolate', 'milk chocolate', 'cocoa powder', 'chocolate chip',
    'shaoxing wine', 'rice wine', 'mirin', 'sake', 'dry white wine',
    'dry red wine', 'white wine', 'red wine',
  ]],
  ['produce', [
    'garlic clove', 'spring onion', 'green onion', 'red onion', 'white onion',
    'yellow onion', 'sweet potato', 'new potato', 'russet potato',
    'roma tomato', 'cherry tomato', 'vine tomato', 'sun dried tomato',
    'red bell pepper', 'green bell pepper', 'yellow bell pepper', 'bell pepper',
    'scotch bonnet pepper', 'scotch bonnet', 'birds eye chili', 'green chili',
    'red chili', 'green chile', 'red chile', 'thai chili', 'serrano',
    'jalapeno', 'habanero', 'poblano', 'ancho', 'chipotle',
    'flat leaf parsley', 'curly parsley', 'ginger root', 'fresh ginger',
    'lemon juice', 'lime juice', 'orange juice', 'lemon zest', 'lime zest',
    'orange zest', 'mint leaf', 'basil leaf', 'curry leaves', 'banana leaf',
    'celery stalk', 'spring greens', 'pak choi', 'bok choy', 'chinese cabbage',
    'napa cabbage', 'bean sprout', 'beansprout', 'baby spinach',
    'butternut squash', 'kabocha squash',
  ]],
  ['meat_fish', [
    'ground beef', 'ground pork', 'ground lamb', 'ground chicken',
    'ground turkey', 'minced beef', 'minced pork', 'minced lamb',
    'pork shoulder', 'pork belly', 'pork loin', 'pork rib', 'lamb shoulder',
    'lamb shank', 'lamb leg', 'beef chuck', 'beef brisket', 'beef short rib',
    'beef shin', 'chicken thigh', 'chicken breast', 'chicken wing',
    'chicken drumstick', 'whole chicken', 'chicken skin', 'duck breast',
    'duck leg', 'streaky bacon', 'smoked bacon', 'salmon fillet',
    'cod fillet', 'white fish', 'sea bass', 'fish fillet', 'fish head',
    'bone marrow', 'oxtail', 'beef bone', 'chicken bone',
  ]],
  ['frozen', [
    'frozen pea', 'frozen spinach', 'frozen berry', 'frozen fruit',
    'frozen vegetable', 'ice cream', 'puff pastry sheet',
  ]],

  // ---- single-token fallbacks ---------------------------------------------
  ['produce', [
    'onion', 'shallot', 'garlic', 'ginger', 'galangal', 'lemongrass',
    'turmeric root', 'carrot', 'potato', 'tomato', 'tomatoe', 'cucumber',
    'celery', 'leek', 'scallion', 'chive', 'cilantro', 'coriander', 'parsley',
    'dill', 'mint', 'basil', 'thyme', 'rosemary', 'sage', 'oregano', 'tarragon',
    'marjoram', 'watercress', 'rocket', 'arugula', 'lettuce', 'spinach', 'kale',
    'cabbage', 'broccoli', 'cauliflower', 'mushroom', 'courgette', 'zucchini',
    'aubergine', 'eggplant', 'pumpkin', 'squash', 'beetroot', 'beet', 'radish',
    'turnip', 'swede', 'parsnip', 'fennel', 'asparagus', 'artichoke', 'okra',
    'sprout', 'chard', 'endive', 'shallot', 'chili', 'chile', 'chily',
    'pepper corn', 'capsicum', 'lemon', 'lime', 'orange', 'apple', 'banana',
    'avocado', 'mango', 'pineapple', 'papaya', 'grape', 'strawberry',
    'raspberry', 'blueberry', 'blackberry', 'cherry', 'peach', 'pear', 'plum',
    'apricot', 'fig', 'pomegranate', 'melon', 'watermelon', 'kiwi', 'lychee',
    'guava', 'passionfruit', 'plantain', 'cassava', 'yam', 'taro', 'daikon',
    'jicama', 'kohlrabi', 'samphire', 'nettle', 'sorrel', 'shiso', 'perilla',
    'corn', 'sweetcorn', 'cob', 'pea', 'edamame', 'green bean', 'runner bean',
    'mangetout', 'sugar snap',
  ]],
  ['meat_fish', [
    'chicken', 'beef', 'pork', 'lamb', 'mutton', 'veal', 'duck', 'turkey',
    'goose', 'goat', 'rabbit', 'venison', 'bacon', 'sausage', 'chorizo',
    'pancetta', 'prosciutto', 'ham', 'salami', 'mince', 'steak', 'brisket',
    'liver', 'kidney', 'tripe', 'trotter', 'gizzard', 'lardon', 'suet', 'lard',
    'shrimp', 'prawn', 'fish', 'salmon', 'tuna', 'cod', 'haddock', 'mackerel',
    'sardine', 'trout', 'halibut', 'snapper', 'tilapia', 'monkfish', 'squid',
    'calamari', 'octopus', 'mussel', 'clam', 'crab', 'lobster', 'scallop',
    'oyster', 'cockle', 'whitebait', 'eel', 'roe',
  ]],
  ['dairy_eggs', [
    'milk', 'butter', 'ghee', 'cream', 'yogurt', 'yoghurt', 'curd', 'cheese',
    'paneer', 'feta', 'parmesan', 'pecorino', 'mozzarella', 'cheddar',
    'ricotta', 'mascarpone', 'halloumi', 'gruyere', 'manchego', 'brie',
    'stilton', 'egg', 'custard', 'kefir', 'labneh', 'quark',
  ]],
  ['bakery', [
    'bread', 'baguette', 'ciabatta', 'sourdough', 'tortilla', 'pita', 'naan',
    'roti', 'chapati', 'paratha', 'brioche', 'bun', 'croissant', 'muffin',
    'crumpet', 'bagel', 'pastry', 'filo', 'phyllo', 'crouton', 'focaccia',
    'lavash', 'injera',
  ]],
  ['cupboard', [
    'flour', 'sugar', 'salt', 'rice', 'pasta', 'spaghetti', 'noodle', 'macaroni',
    'penne', 'linguine', 'tagliatelle', 'lasagne', 'vermicelli', 'udon', 'soba',
    'ramen', 'couscous', 'bulgur', 'quinoa', 'barley', 'oat', 'oatmeal',
    'polenta', 'semolina', 'cornmeal', 'starch', 'yeast', 'gelatin', 'gelatine',
    'agar', 'lentil', 'dal', 'dhal', 'chickpea', 'bean', 'pulse', 'split pea',
    'breadcrumb', 'panko', 'cracker', 'biscuit', 'honey', 'syrup', 'molasses',
    'molasse', 'treacle', 'jaggery', 'chocolate', 'cocoa', 'cacao', 'vanilla',
    'almond', 'cashew', 'peanut', 'walnut', 'pistachio', 'hazelnut', 'pecan',
    'macadamia', 'pine nut', 'candlenut', 'chestnut', 'nut', 'raisin',
    'sultana', 'currant', 'date', 'prune', 'apricot dried', 'cranberry',
    'coconut', 'kombu', 'nori', 'wakame', 'dashi', 'seaweed', 'tofu', 'tempeh',
    'seitan', 'wine', 'sake', 'mirin', 'stock', 'broth', 'extract', 'essence',
    'colouring', 'coloring', 'sprinkle', 'marshmallow',
  ]],
  ['spices', [
    'pepper', 'peppercorn', 'cumin', 'turmeric', 'cinnamon', 'cardamom',
    'clove', 'nutmeg', 'allspice', 'anise', 'fennel seed', 'fenugreek',
    'saffron', 'masala', 'spice', 'seasoning', 'herb', 'powder', 'flake',
  ]],
  ['tins_jars', [
    'sauce', 'paste', 'puree', 'mustard', 'mayonnaise', 'mayo', 'ketchup',
    'miso', 'gochujang', 'doubanjiang', 'tahini', 'harissa', 'chutney',
    'pickle', 'gherkin', 'caper', 'olive', 'jam', 'marmalade', 'preserve',
    'anchovy', 'relish', 'salsa', 'pesto', 'hummus', 'concentrate', 'tinned',
    'canned', 'jarred',
  ]],
  ['oils_vinegars', ['oil', 'vinegar', 'shortening', 'margarine']],
  ['frozen', ['frozen']],

  // ---- the measured tail --------------------------------------------------
  // Everything below was added because it turned up in the UNCLASSIFIED list
  // when the classifier was run over the whole corpus, not because it seemed
  // likely. Three systematic classes account for most of it:
  //
  //  1. Artifacts of the shared normaliser, which strips a trailing "s" from
  //     every word: "citrus"->"citru", "octopus"->"octopu", "ras el hanout"->
  //     "ra el hanout", "leaves"->"leave", "potatoes"->"potatoe". The
  //     normaliser is shared with the nutrition matcher and is not worth
  //     destabilising for this, so the mangled forms are listed as aliases.
  //  2. British spellings the first pass missed — chilli, chilly, pimenton.
  //  3. A genuinely global corpus: forty cuisines bring their own pantry.
  ['produce', [
    'tomatillo', 'collard', 'collard green', 'bamboo shoot', 'horseradish',
    'horseradish root', 'cavolo nero', 'kangkung', 'culantro', 'calamansi',
    'pandan', 'pandan leaf', 'pandan leave', 'huacatay', 'guasca', 'jute leaf',
    'vine leaf', 'ti leaf', 'oak leaf', 'spearmint', 'curry leave',
    'bay leave', 'potatoe', 'citru', 'berry', 'fruit', 'leaf', 'leave',
    'chilli', 'chilly', 'green chilli', 'red chilli', 'ladyfinger',
    'moringa', 'soybean', 'sprouted bean',
  ]],
  ['meat_fish', [
    'meat', 'ground meat', 'minced meat', 'fat', 'fatback', 'back fat',
    'rendered fat', 'tallow', 'suet', 'belly', 'shoulder', 'bone', 'drumstick',
    'guanciale', 'chourico', 'kielbasa', 'smoked kielbasa', 'black pudding',
    'jamon', 'jamon serrano', 'jamon cocido', 'lomo', 'cecina', 'bresaola',
    'coppa', 'speck', 'morcilla', 'longaniza', 'sobrasada',
    'herring', 'pickled herring', 'carp', 'stockfish', 'crawfish',
    'crawfish tail', 'crayfish', 'ground crayfish', 'yellowtail', 'caviar',
    'sturgeon caviar', 'tarama', 'octopu', 'demi glace', 'katsuobushi',
    'bonito', 'niboshi', 'anchovie',
  ]],
  ['dairy_eggs', [
    'queso fresco', 'queso', 'parmigiano', 'parmigiano reggiano', 'reggiano',
    'crema mexicana', 'crema', 'kajmak', 'kashk', 'niter kibbeh', 'skyr',
    // Turned up by running real recipes through the list: a corpus this global
    // writes ingredients in the language the dish is cooked in.
    'manteca', 'muzzarella', 'mozzarela', 'requeson', 'cuajada', 'nata',
    'pecorino romano cheese', 'parmesan cheese', 'cheddar cheese',
    'rennet', 'vegetable rennet', 'vegetarian rennet',
  ]],
  ['bakery', [
    'flatbread', 'lumpia wrapper', 'dumpling wrapper', 'wrapper',
    'mandarin pancake wrapper', 'matzo', 'matzo meal', 'gingersnap',
    // "pan lactal" but never a bare "pan" — that token also means the thing
    // you cook in, and "pan drippings" is not a bakery item.
    'cooky', 'cookie', 'sponge finger', 'pan lactal', 'pandesal',
    'bolillo', 'telera', 'arepa', 'pao', 'baozi', 'mantou',
  ]],
  ['cupboard', [
    'masa', 'masa harina', 'hominy', 'white hominy', 'maize meal',
    'coarse maize meal', 'wheat berry', 'couscou', 'maltose', 'sweetener',
    'granulated sweetener', 'sparkling water', 'soda water', 'mineral water',
    'sparkling mineral water', 'tonic water', 'rose water', 'rosewater',
    'orange blossom water', 'sherry', 'dry sherry', 'vodka', 'cognac',
    'cachaca', 'aquavit', 'brandy', 'rum', 'whisky', 'whiskey', 'espresso',
    'brewed espresso', 'coffee', 'tea', 'dried shiitake', 'shiitake',
    'dried lily bud', 'lily bud', 'dried tangerine peel', 'egusi', 'egusi seed',
    'starter', 'active starter', 'starter culture', 'lye', 'calcium chloride',
  ]],
  ['spices', [
    'cassia', 'cassia bark', 'pimenton', 'cayenne', 'berbere', 'annatto',
    'annatto seed', 'korarima', 'carom', 'carom seed', 'kasuri methi',
    'khmeli suneli', 'quatre epice', 'bouquet garni', 'nigella',
    // "chilies" comes out of the shared normaliser as "chily", so every dried
    // form needs that spelling too or it goes to the greengrocer.
    'dried red chily', 'dried green chily', 'whole dried chily',
    'dried chile de arbol', 'chily powder', 'chily flake', 'kashmiri chily',
    'kashmiri chili', 'kashmiri chilli', 'dried red chilli', 'dried chilli',
    'ra el hanout', 'dried rose petal', 'dried culinary rose petal',
    'rose petal', 'dried spearmint', 'aonori', 'wasabi', 'sansho',
    'marigold petal', 'dried marigold petal', 'blue fenugreek', 'epazote',
  ]],
  // Caught by running a real week through the list: "Canned red kidney beans"
  // was being sent to the butcher, because "kidney" is offal before it is a
  // bean. Phrases outrank single tokens, so naming the bean fixes it without
  // giving up the offal.
  ['cupboard', [
    'kidney bean', 'red kidney bean', 'black bean', 'pinto bean', 'borlotti bean',
    'cannellini bean', 'butter bean', 'broad bean', 'haricot bean', 'mung bean',
    'fava bean', 'adzuki bean', 'black eyed pea', 'split pea', 'yellow split pea',
    'black gram', 'split black gram', 'green gram', 'urad dal', 'toor dal',
    'chana dal', 'moong dal', 'masoor dal',
  ]],
  ['tins_jars', [
    'canned kidney bean', 'canned red kidney bean', 'tinned kidney bean',
    'canned black bean', 'canned butter bean', 'canned cannellini bean',
    'tamari', 'kecap manis', 'kecap mani', 'kecap', 'doenjang', 'belacan',
    'umeboshi', 'sambal', 'sambal ulek', 'sambal oelek', 'kimchi',
    'kimchi juice', 'sauerkraut', 'cornichon', 'aioli', 'applesauce',
    'apple sauce', 'japanese curry roux', 'curry roux', 'tenkasu', 'iru',
    'kudampuli', 'kaya', 'tamarind', 'tamarind juice', 'calamansi juice',
    'prepared horseradish', 'glace', 'jus',
  ]],
];

/** Flattened, specificity-ordered. Longer phrases win over their head nouns
 *  without anyone having to keep the table in the right order by hand. */
const TERMS: Array<{ term: string; words: number; aisle: Aisle }> = RULES
  .flatMap(([aisle, terms]) => terms.map((term) => ({
    term,
    words: term.split(' ').length,
    aisle,
  })))
  .sort((a, b) => (b.words - a.words) || (b.term.length - a.term.length));

/**
 * Classify a NORMALISED ingredient key (the output of normaliseIngredient).
 *
 * Single-word terms match whole tokens so "pea" never matches "peanut"; multi-
 * word terms match as a phrase anywhere in the key so "extra virgin olive oil"
 * and "good olive oil" both land on oils.
 */
export function aisleFor(key: string): Aisle {
  if (!key) return 'other';
  const tokens = new Set(key.split(' '));
  for (const { term, words, aisle } of TERMS) {
    if (words === 1) {
      if (tokens.has(term)) return aisle;
    } else if (key.includes(term)) {
      return aisle;
    }
  }
  return 'other';
}
