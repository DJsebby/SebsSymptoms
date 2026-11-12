// Food names → comparable keys, plus the common trigger groups (dairy, wheat, eggs …)
// that a food belongs to, guessed from its name. A wrong guess can be switched off in
// the app (Triggers → the group → tap the food).

// "Crème Fraîche " → "creme fraiche"
export const normKey = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Simple plurals ("eggs" → "egg", "berries" → "berry") are merged, but only when the
// other form has been logged too. Returns Map(plural key → singular key).
export function pluralMap(keys) {
  const all = new Set(keys);
  const map = new Map();
  for (const k of keys) {
    const options = [];
    if (k.endsWith('ies')) options.push(k.slice(0, -3) + 'y');
    if (k.endsWith('es')) options.push(k.slice(0, -2));
    if (k.endsWith('s') && !k.endsWith('ss')) options.push(k.slice(0, -1));
    const hit = options.find(o => o.length >= 2 && o !== k && all.has(o));
    if (hit) map.set(k, hit);
  }
  return map;
}

// Whole words only: "egg" must not match "eggplant", "nut" must not match "doughnut".
const words = list => new RegExp(`(?:^|[^a-z0-9])(?:${list.join('|')})(?![a-z0-9])`);

const PLANT = '(?:oat|almond|soy|soya|coconut|rice|cashew|hazelnut|macadamia|pea|hemp|plant(?:[- ]based)?|vegan|dairy[- ]free|non[- ]dairy)';
const MILKY = '(?:milks?|lattes?|cappuccinos?|flat whites?|mochas?|cream|creamer|ice ?creams?|yogh?urts?|cheeses?|butter|hot chocolates?|chai lattes?|milkshakes?|custards?)';
const NOT_ALCOHOL = ['non[- ]?alcoholic', 'alcohol[- ]free', 'zero alcohol', 'mocktails?', 'virgin', 'ginger beer', 'root beer', 'ginger ale',
  '(?:wine|cider|rice wine|malt) vinegar', 'na beer'];

const group = (id, label, about, inc, exc = []) => ({ id, label, about, inc: words(inc), exc: exc.length ? words(exc) : null });

export const FOOD_GROUPS = [
  group('dairy', 'Dairy', 'milk, cheese, yoghurt, butter, cream, ice cream and milky coffees', [
    'milk', 'milks', 'milky', 'cheeses?', 'cheesy', 'yogh?urts?', 'butter', 'buttery', 'buttermilk', 'cream', 'creamy', 'creamer',
    'ice ?creams?', 'gelato', 'lattes?', 'cappuccinos?', 'flat whites?', 'mochas?', 'macchiatos?', 'piccolos?', 'cortados?',
    'chai lattes?', 'hot chocolates?', 'milkshakes?', 'thickshakes?', 'custards?', 'whey', 'kefir', 'ghee', 'parmesan', 'parmigiano',
    'pecorino', 'mozzarella', 'cheddar', 'feta', 'brie', 'camembert', 'ricotta', 'mascarpone', 'hall?oumi', 'paneer', 'gouda', 'labneh',
    'quark', 'burrata', 'gruyere', 'emmental', 'bocconcini', 'raita', 'tzatziki', 'alfredo', 'carbonara', 'bechamel', 'mornay', 'queso',
    'pizzas?', 'lasagnes?', 'lasagnas?', 'cheesecakes?', 'tiramisu', 'panna cotta', 'creme brulee', 'creme fraiche', 'sour cream',
    'butter chicken', 'korma', 'cheeseburgers?', 'condensed milk', 'viet(?:namese)? ic(?:e|ed) coffees?', 'mac (?:and|n|&) cheese', 'milk chocolate', 'white chocolate', 'parmi', 'parmigiana', 'quiches?',
  ], [
    `${PLANT}[\\s-]+${MILKY}`, 'peanut butter', 'almond butter', 'nut butter', 'cashew butter', 'cocoa butter', 'shea butter',
    'apple butter', 'butter beans?', 'cream of tartar', 'cream soda', 'dairy[- ]free', 'non[- ]dairy', 'vegan',
  ]),
  group('wheat', 'Wheat & gluten', 'bread, pasta, noodles, cereal, pastry, cakes, beer and anything crumbed or battered', [
    'breads?', 'breadcrumbs?', 'toast', 'toasts', 'toasties?', 'sandwich(?:es)?', 'sangas?', 'buns?', 'bread rolls?', 'burgers?', 'wraps?',
    'pitt?as?', 'naans?', 'rotis?', 'chapatis?', 'parathas?', 'flatbreads?', 'focaccia', 'ciabatta', 'baguettes?', 'sourdough', 'bagels?',
    'hamburgers?', 'cheeseburgers?', 'pumpernickel', 'bolani', 'curry puffs?', 'croissants?', 'pastry', 'pastries', 'danish', 'muffins?', 'crumpets?', 'pancakes?', 'pikelets?', 'waffles?', 'crepes?', 'scones?',
    'biscuits?', 'cookies?', 'crackers?', 'cakes?', 'cupcakes?', 'brownies?', 'donuts?', 'doughnuts?', 'pies?', 'sausage rolls?',
    'pasties?', 'quiches?', 'pizzas?', 'pasta', 'pastas', 'spaghetti', 'penne', 'fusilli', 'linguine', 'fettuccine', 'macaroni',
    'mac (?:and|n|&) cheese', 'lasagnes?', 'lasagnas?', 'ravioli', 'tortellini', 'gnocchi', 'noodles?', 'ramen', 'udon', 'soba',
    'chow mein', 'lo mein', 'couscous', 'bulgh?[ua]r', 'tabbouleh', 'freekeh', 'semolina', 'barley', 'rye', 'spelt', 'farro', 'seitan',
    'flour', 'wheat', 'gluten', 'cereals?', 'weet[- ]?bix', 'beers?', 'lagers?', 'ales?', 'stouts?', 'ipas?', 'pretzels?', 'dumplings?',
    'gyozas?', 'wontons?', 'bao', 'spring rolls?', 'tempura', 'battered', 'crumbed', 'breaded', 'schnitzels?', 'nuggets?',
    'fish (?:and|n|&) chips', 'katsu', 'calzones?', 'empanadas?', 'tortillas?', 'burritos?', 'quesadillas?', 'croutons?', 'stuffing',
    'parmi', 'parmigiana',
  ], [
    'gluten[- ]free', 'gf', 'rice (?:noodles?|paper|crackers?|cakes?|bread|pasta)', 'corn (?:tortillas?|chips|bread|cakes?)',
    'cauliflower (?:rice|pizza|crust)', 'zucchini (?:noodles|pasta)', 'zoodles', 'buckwheat', 'ginger beer', 'root beer', 'ginger ale',
  ]),
  group('eggs', 'Eggs', 'eggs, mayonnaise, aioli, custard, meringue and egg dishes', [
    'eggs?', 'omelett?es?', 'omelets?', 'frittatas?', 'quiches?', 'mayo', 'mayonnaise', 'aioli', 'meringues?', 'pavlovas?', 'hollandaise',
    'bearnaise', 'carbonara', 'french toast', 'custards?', 'eggnog', 'scrambled', 'shakshuka', 'creme brulee', 'tiramisu',
  ], ['eggplants?', 'egg[- ]free', 'vegan', 'no eggs?']),
  group('soy', 'Soy', 'soy milk, tofu, tempeh, edamame, miso and soy sauce', [
    'soy', 'soya', 'soybeans?', 'tofu', 'tempeh', 'edamame', 'miso', 'natto', 'tamari', 'teriyaki', 'tvp',
  ], ['soy[- ]free']),
  group('peanuts', 'Peanuts', 'peanuts, peanut butter and satay', [
    'peanuts?', 'peanut butter', 'satay', 'groundnuts?', 'snickers', 'reeses?',
  ], ['peanut[- ]free']),
  group('treenuts', 'Tree nuts', 'almonds, cashews, walnuts, hazelnuts, pistachios, pesto, Nutella and almond milk', [
    'nuts?', 'mixed nuts', 'almonds?', 'cashews?', 'walnuts?', 'pecans?', 'pistachios?', 'hazelnuts?', 'macadamias?', 'brazil nuts?',
    'pine nuts?', 'praline', 'marzipan', 'frangipane', 'nutella', 'pesto', 'baklava', 'nougat', 'trail mix', 'nut butter',
  ], ['coconuts?', 'nutmeg', 'butternut', 'doughnuts?', 'donuts?', 'peanuts?', 'nut[- ]free', 'water chestnuts?']),
  group('fish', 'Fish', 'fish, tuna, salmon, sushi and fish sauce', [
    'fish', 'fishes', 'salmon', 'tuna', 'cod', 'barramundi', 'snapper', 'sardines?', 'anchov(?:y|ies)', 'mackerel', 'trout', 'whiting',
    'flathead', 'hoki', 'basa', 'tilapia', 'haddock', 'halibut', 'swordfish', 'kingfish', 'bream', 'perch', 'herrings?', 'kippers?',
    'sushi', 'sashimi', 'poke', 'fish sauce', 'caviar', 'roe', 'bonito', 'dashi', 'seafood',
  ], ['swedish fish', 'shellfish']),
  group('shellfish', 'Shellfish', 'prawns, shrimp, crab, lobster, mussels, oysters, squid and other seafood', [
    'shellfish', 'prawns?', 'shrimps?', 'crabs?', 'lobsters?', 'crayfish', 'yabb(?:y|ies)', 'scampi', 'langoustines?', 'mussels?',
    'oysters?', 'clams?', 'scallops?', 'squid', 'calamari', 'octopus', 'cuttlefish', 'pipis?', 'cockles?', 'abalone', 'seafood',
  ], ['oyster mushrooms?', 'crab apples?']),
  group('sesame', 'Sesame', 'sesame seeds and oil, tahini and hummus', [
    'sesame', 'tahini', 'hummus', 'houmous', 'hommus', 'halva', 'baba ganoush', 'furikake', 'gomasio',
  ]),
  group('alcohol', 'Alcohol', 'beer, wine, cider, spirits and cocktails', [
    'alcohol', 'beers?', 'lagers?', 'ales?', 'stouts?', 'ipas?', 'pints?', 'schooners?', 'ciders?', 'wines?', 'champagne', 'prosecco',
    'cava', 'spritz(?:es)?', 'aperol', 'campari', 'vodka', 'gin', 'rum', 'whisk(?:e)?y', 'bourbon', 'scotch', 'tequila', 'mezcal',
    'brandy', 'cognac', 'sake', 'soju', 'liqueurs?', 'baileys', 'kahlua', 'cocktails?', 'margaritas?', 'mojitos?', 'negronis?',
    'martinis?', 'daiquiris?', 'cosmopolitans?', 'mimosas?', 'sangria', 'g&t', 'gin and tonic', 'jager(?:bombs?|meister)?',
    'old fashioned', 'bloody mary',
  ], NOT_ALCOHOL),
  group('citrus', 'Citrus', 'oranges, lemons, limes, grapefruit, mandarins and their juice', [
    'oranges?', 'orange juice', 'oj', 'lemons?', 'lemonade', 'limes?', 'grapefruits?', 'mandarins?', 'tangerines?', 'clementines?',
    'satsumas?', 'yuzu', 'kumquats?', 'citrus', 'margaritas?', 'mojitos?', 'key lime pie',
  ], ['orange (?:capsicum|pepper|sweet potato|lentils?)']),
  group('tomato', 'Tomato', 'tomatoes, tomato sauce, ketchup, salsa, pizza and pasta sauces', [
    'tomato(?:es)?', 'ketchup', 'salsa', 'passata', 'marinara', 'napoli(?:tana)?', 'bolognese', 'bolognaise', 'arrabbiata', 'shakshuka',
    'gazpacho', 'bruschetta', 'pizzas?', 'lasagnes?', 'lasagnas?', 'chill?i con carne', 'pasta sauce', 'puttanesca', 'parmi',
    'parmigiana', 'bloody mary',
  ]),
  group('chocolate', 'Chocolate', 'chocolate, cocoa, Nutella, brownies, mochas and chocolate bars', [
    'chocolates?', 'choc', 'cocoa', 'cacao', 'nutella', 'brownies?', 'mochas?', 'hot chocolates?', 'milo', 'kit ?kats?', 'tim ?tams?',
    'mars bars?', 'snickers', 'twix', 'm&ms?', 'maltesers', 'cadbury',
  ]),
  group('spicy', 'Spicy food', 'chilli, hot sauce, curries and other spicy food', [
    'spicy', 'chill(?:i|ies|is)', 'chili(?:es|s)?', 'jalapenos?', 'habaneros?', 'sriracha', 'hot sauce', 'tabasco', 'harissa',
    'peri[- ]?peri', 'piri[- ]?piri', 'gochujang', 'kimchi', 'vindaloo', 'curry', 'curries', 'laksa', 'tom yum', 'szechuan', 'sichuan',
    'buffalo wings', 'hot wings', 'cayenne', 'nduja', 'sambal', 'chipotle', 'wasabi',
  ]),
  group('coffee', 'Coffee', 'coffee of any kind, including decaf', [
    'coffees?', 'espressos?', 'lattes?', 'cappuccinos?', 'flat whites?', 'long blacks?', 'short blacks?', 'americanos?', 'macchiatos?',
    'mochas?', 'piccolos?', 'cortados?', 'affogatos?', 'cold brews?', 'iced coffees?', 'espresso martinis?', 'frappes?',
    'frappuccinos?', 'decaf',
  ], ['chai lattes?', 'matcha lattes?', 'turmeric lattes?', 'golden lattes?', 'beetroot lattes?', 'hot chocolates?']),
  group('histamine', 'Cured & fermented', 'cured meats, aged cheese, smoked fish and fermented foods, which are high in histamine', [
    'salami', 'pepperoni', 'chorizo', 'prosciutto', 'pancetta', 'bacon', 'ham', 'pastrami', 'jamon', 'sopressa', 'cured meats?',
    'deli meats?', 'hot dogs?', 'frankfurts?', 'frankfurters?', 'kabana', 'cabanossi', 'smoked salmon', 'kimchi', 'sauerkraut',
    'kombucha', 'pickles?', 'pickled', 'miso', 'blue cheese', 'aged cheese', 'parmesan', 'parmigiano', 'red wine', 'soy sauce',
    'leftovers?', 'bismarck herring', 'rollmops?',
  ]),
];

export const GROUP_BY_ID = Object.fromEntries(FOOD_GROUPS.map(g => [g.id, g]));

// The ids of every group a food (already normalised with normKey) belongs to.
export function groupsOf(key) {
  const out = [];
  for (const g of FOOD_GROUPS) if (g.inc.test(key) && !(g.exc && g.exc.test(key))) out.push(g.id);
  return out;
}

// True when two logged names are the same food ("Egg" and "eggs").
export function sameFood(a, b) {
  const x = normKey(a), y = normKey(b);
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return l === s + 's' || l === s + 'es' || (l.endsWith('ies') && s.endsWith('y') && l.slice(0, -3) === s.slice(0, -1));
}
