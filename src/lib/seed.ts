import type { DatabaseSync } from "node:sqlite";
import type { OptionGroup, Station } from "./types";
import { hashPassword } from "./password";
import { contentHashOf, toSnapshotItem } from "./menu-snapshot";

/** Shared across the seeded demo accounts. Development convenience only. */
export const DEMO_PASSWORD = "dinner1234";
export const DEMO_PERSON = "person_demo";
export const DEMO_PHONE = "+14155550142";

type SeedItem = {
  id: string;
  section: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  prep: number;
  station: Station;
  /** loremflickr keyword — every one of these is verified to return an image. */
  img: string;
  popular?: boolean;
  options?: OptionGroup[];
  available?: boolean;
};

type SeedOrg = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  band: string;
  rating: number;
  ratingCount: number;
  blurb: string;
  hue: number;
  img: string;
  promo?: string;
  sponsored?: boolean;
  distance: number;
  address: string;
  prepBase: number;
  deliveryFee: number;
  multiplier: number;
  items: SeedItem[];
};

const SPICE: OptionGroup = {
  id: "g_spice",
  name: "Spice level",
  select: "single",
  required: true,
  choices: [
    { id: "c_mild", label: "Mild", priceCents: 0 },
    { id: "c_medium", label: "Medium", priceCents: 0 },
    { id: "c_hot", label: "Hot", priceCents: 0 },
  ],
};

const TACO_EXTRAS: OptionGroup = {
  id: "g_taco_extras",
  name: "Add extras",
  select: "multi",
  required: false,
  choices: [
    { id: "c_guac", label: "Guacamole", priceCents: 200 },
    { id: "c_queso", label: "Queso", priceCents: 175 },
    { id: "c_crema", label: "Crema", priceCents: 100 },
  ],
};

const NO_ONION: OptionGroup = {
  id: "g_prefs",
  name: "Preferences",
  select: "multi",
  required: false,
  choices: [
    { id: "c_no_onion", label: "No onion", priceCents: 0 },
    { id: "c_no_cilantro", label: "No cilantro", priceCents: 0 },
    { id: "c_extra_salsa", label: "Extra salsa", priceCents: 0 },
  ],
};

const PROTEIN: OptionGroup = {
  id: "g_protein",
  name: "Choose a protein",
  select: "single",
  required: true,
  choices: [
    { id: "c_chicken", label: "Chicken", priceCents: 0 },
    { id: "c_pork", label: "Pork belly", priceCents: 200 },
    { id: "c_tofu", label: "Crispy tofu", priceCents: 0 },
    { id: "c_shrimp", label: "Shrimp", priceCents: 350 },
  ],
};

const SIZE: OptionGroup = {
  id: "g_size",
  name: "Size",
  select: "single",
  required: true,
  choices: [
    { id: "c_reg", label: "Regular", priceCents: 0 },
    { id: "c_lg", label: "Large", priceCents: 300 },
  ],
};

const ORGS: SeedOrg[] = [
  {
    id: "org_sunrise",
    slug: "sunrise-taqueria",
    name: "Sunrise Taqueria",
    cuisine: "Mexican",
    band: "$$",
    rating: 4.8,
    ratingCount: 1240,
    blurb: "Al pastor off the trompo since 2011. Masa ground in-house every morning.",
    hue: 18,
    img: "tacos",
    promo: "2× points today",
    distance: 0.6,
    address: "1142 Mission St",
    prepBase: 420,
    deliveryFee: 99,
    multiplier: 2,
    items: [
      { id: "it_pastor", section: "Most popular", name: "Al Pastor Tacos", description: "Two tacos, pineapple, onion, cilantro, salsa roja.", price: 650, cost: 195, prep: 240, station: "grill", img: "tacos", popular: true, options: [NO_ONION, TACO_EXTRAS] },
      { id: "it_carnebowl", section: "Most popular", name: "Carne Asada Bowl", description: "Grilled steak, cilantro-lime rice, black beans, pico, crema.", price: 1450, cost: 420, prep: 360, station: "assembly", img: "steak", popular: true, options: [SPICE, TACO_EXTRAS] },
      { id: "it_carnitas", section: "Tacos", name: "Carnitas Tacos", description: "Slow-braised pork shoulder, pickled red onion.", price: 650, cost: 210, prep: 210, station: "grill", img: "tacos", options: [NO_ONION, TACO_EXTRAS] },
      { id: "it_street", section: "Tacos", name: "Street Taco Trio", description: "Three tacos, your choice of protein, double corn tortillas.", price: 950, cost: 305, prep: 300, station: "grill", img: "tacos", options: [PROTEIN, NO_ONION] },
      { id: "it_veggieburrito", section: "Burritos", name: "Veggie Burrito", description: "Rajas, black beans, rice, queso fresco, avocado salsa.", price: 1250, cost: 330, prep: 300, station: "assembly", img: "burrito", options: [TACO_EXTRAS] },
      { id: "it_quesadilla", section: "Burritos", name: "Birria Quesadilla", description: "Braised beef, melted oaxaca, consomé for dipping.", price: 1395, cost: 405, prep: 330, station: "grill", img: "quesadilla", popular: true },
      { id: "it_chips", section: "Sides", name: "Chips & Queso", description: "Warm tortilla chips, chile con queso.", price: 550, cost: 130, prep: 90, station: "fry", img: "chips" },
      { id: "it_elote", section: "Sides", name: "Elote", description: "Grilled corn, crema, cotija, tajín.", price: 450, cost: 105, prep: 180, station: "grill", img: "elote" },
      { id: "it_horchata", section: "Drinks", name: "Horchata", description: "Rice, cinnamon, vanilla. Made daily.", price: 350, cost: 55, prep: 45, station: "bar", img: "horchata", options: [SIZE] },
      { id: "it_agua", section: "Drinks", name: "Agua Fresca", description: "Rotating fruit. Today: watermelon-lime.", price: 350, cost: 60, prep: 45, station: "bar", img: "lemonade", options: [SIZE] },
    ],
  },
  {
    id: "org_baohaus",
    slug: "bao-haus",
    name: "Bao Haus",
    cuisine: "Chinese",
    band: "$$",
    rating: 4.7,
    ratingCount: 892,
    blurb: "Steamed buns, hand-folded. Twelve seats and a very fast kitchen.",
    hue: 348,
    img: "bao",
    promo: "$3 off orders over $20",
    distance: 0.8,
    address: "88 Grant Ave",
    prepBase: 300,
    deliveryFee: 99,
    multiplier: 1,
    items: [
      { id: "it_porkbao", section: "Most popular", name: "Pork Belly Bao", description: "Braised pork belly, crushed peanut, pickled mustard green.", price: 575, cost: 165, prep: 180, station: "assembly", img: "bao", popular: true },
      { id: "it_dumplings", section: "Most popular", name: "Pan-Fried Dumplings", description: "Eight pieces, pork and chive, chili-black vinegar.", price: 1150, cost: 320, prep: 420, station: "fry", img: "dumplings", popular: true, options: [SPICE] },
      { id: "it_chickenbao", section: "Bao", name: "Fried Chicken Bao", description: "Buttermilk-brined thigh, house hot sauce, slaw.", price: 575, cost: 170, prep: 240, station: "fry", img: "chicken", options: [SPICE] },
      { id: "it_mushbao", section: "Bao", name: "King Trumpet Bao", description: "Roasted mushroom, black vinegar glaze, scallion.", price: 525, cost: 140, prep: 180, station: "assembly", img: "bao" },
      { id: "it_noodles", section: "Plates", name: "Dan Dan Noodles", description: "Sesame, sichuan pepper, minced pork, preserved greens.", price: 1350, cost: 365, prep: 360, station: "assembly", img: "ramen", popular: true, options: [SPICE, PROTEIN] },
      { id: "it_cucumber", section: "Sides", name: "Smashed Cucumber", description: "Garlic, sesame, chili oil.", price: 650, cost: 120, prep: 120, station: "cold", img: "cucumber" },
      { id: "it_ricecake", section: "Sides", name: "Crispy Rice Cakes", description: "Wok-tossed, XO butter, scallion.", price: 850, cost: 195, prep: 300, station: "fry", img: "chips", available: false },
      { id: "it_milktea", section: "Drinks", name: "Hong Kong Milk Tea", description: "Strong black tea, evaporated milk. Iced or hot.", price: 500, cost: 85, prep: 60, station: "bar", img: "tea", options: [SIZE] },
    ],
  },
  {
    id: "org_noodlebar",
    slug: "noodle-bar",
    name: "Noodle Bar",
    cuisine: "Vietnamese",
    band: "$$",
    rating: 4.6,
    ratingCount: 613,
    blurb: "Twelve-hour pho broth. Nothing else on the stove until it's done.",
    hue: 152,
    img: "pho",
    distance: 1.1,
    address: "430 Larkin St",
    prepBase: 480,
    deliveryFee: 149,
    multiplier: 1,
    items: [
      { id: "it_phobo", section: "Most popular", name: "Phở Bò", description: "Twelve-hour beef broth, rare steak, brisket, rice noodle.", price: 1650, cost: 445, prep: 300, station: "assembly", img: "pho", popular: true, options: [SIZE, SPICE] },
      { id: "it_banhmi", section: "Most popular", name: "Bánh Mì Thịt", description: "Pâté, cold cuts, pickled daikon and carrot, cilantro, jalapeño.", price: 1050, cost: 265, prep: 240, station: "cold", img: "banhmi", popular: true, options: [SPICE] },
      { id: "it_phoga", section: "Phở", name: "Phở Gà", description: "Chicken broth, poached thigh, ginger, scallion.", price: 1550, cost: 400, prep: 300, station: "assembly", img: "pho", options: [SIZE] },
      { id: "it_phochay", section: "Phở", name: "Phở Chay", description: "Mushroom-charred onion broth, tofu, bok choy.", price: 1450, cost: 355, prep: 300, station: "assembly", img: "ramen", options: [SIZE] },
      { id: "it_banhmiga", section: "Bánh Mì", name: "Lemongrass Chicken Bánh Mì", description: "Grilled thigh, herb salad, chili mayo.", price: 1150, cost: 290, prep: 300, station: "grill", img: "sandwich", options: [SPICE] },
      { id: "it_rolls", section: "Starters", name: "Summer Rolls", description: "Shrimp and pork, rice paper, peanut sauce. Two per order.", price: 750, cost: 195, prep: 240, station: "cold", img: "springrolls" },
      { id: "it_wings", section: "Starters", name: "Fish Sauce Wings", description: "Six wings, caramelized fish sauce, garlic, lime.", price: 1250, cost: 340, prep: 480, station: "fry", img: "wings", popular: true },
      { id: "it_caphe", section: "Drinks", name: "Cà Phê Sữa Đá", description: "Phin-brewed robusta, condensed milk, ice.", price: 550, cost: 90, prep: 120, station: "bar", img: "coffee" },
    ],
  },
  {
    id: "org_ellery",
    slug: "ellerys-grill",
    name: "Ellery's Grill",
    cuisine: "American",
    band: "$$",
    rating: 4.5,
    ratingCount: 2104,
    blurb: "Dry-aged smash burgers and a fryer that never sits idle.",
    hue: 32,
    img: "burger",
    sponsored: true,
    distance: 1.4,
    address: "77 Ellery Row",
    prepBase: 540,
    deliveryFee: 199,
    multiplier: 1,
    items: [
      { id: "it_smash", section: "Most popular", name: "Double Smash", description: "Two dry-aged patties, American, onion, house sauce, seeded bun.", price: 1395, cost: 425, prep: 420, station: "grill", img: "burger", popular: true, options: [NO_ONION] },
      { id: "it_fries", section: "Most popular", name: "Beef-Fat Fries", description: "Twice-cooked, rosemary salt.", price: 550, cost: 105, prep: 300, station: "fry", img: "fries", popular: true, options: [SIZE] },
      { id: "it_mush", section: "Burgers", name: "Mushroom Swiss", description: "Single patty, roasted maitake, gruyère, garlic aioli.", price: 1495, cost: 460, prep: 480, station: "grill", img: "burger" },
      { id: "it_chickensand", section: "Sandwiches", name: "Hot Honey Chicken", description: "Buttermilk thigh, hot honey, pickles, slaw.", price: 1395, cost: 415, prep: 540, station: "fry", img: "chicken", popular: true, options: [SPICE] },
      { id: "it_onionrings", section: "Sides", name: "Onion Rings", description: "Beer batter, buttermilk ranch.", price: 675, cost: 145, prep: 360, station: "fry", img: "onionrings" },
      { id: "it_wedge", section: "Sides", name: "Little Gem Wedge", description: "Blue cheese, bacon, chive, black pepper.", price: 850, cost: 215, prep: 180, station: "cold", img: "salad" },
      { id: "it_shake", section: "Drinks", name: "Malted Shake", description: "Vanilla, chocolate, or coffee.", price: 725, cost: 165, prep: 180, station: "bar", img: "milkshake", options: [SIZE] },
    ],
  },
  {
    id: "org_saffron",
    slug: "saffron-and-sumac",
    name: "Saffron & Sumac",
    cuisine: "Middle Eastern",
    band: "$$",
    rating: 4.9,
    ratingCount: 486,
    blurb: "Charcoal grill, saj bread, and the best hummus within a mile. Ask anyone.",
    hue: 268,
    img: "shawarma",
    promo: "20% off over $30",
    distance: 1.9,
    address: "205 Fell St",
    prepBase: 600,
    deliveryFee: 199,
    multiplier: 1,
    items: [
      { id: "it_chickenshawarma", section: "Most popular", name: "Chicken Shawarma Plate", description: "Charcoal-grilled thigh, saffron rice, salad, toum, pickles.", price: 1695, cost: 470, prep: 480, station: "grill", img: "shawarma", popular: true, options: [SPICE] },
      { id: "it_hummus", section: "Most popular", name: "Hummus & Saj", description: "Whipped chickpea, olive oil, warm flatbread.", price: 895, cost: 175, prep: 180, station: "cold", img: "hummus", popular: true },
      { id: "it_lambkofta", section: "Plates", name: "Lamb Kofta", description: "Three skewers, sumac onion, grilled tomato, saj bread.", price: 1895, cost: 545, prep: 540, station: "grill", img: "kebab", popular: true },
      { id: "it_falafel", section: "Wraps", name: "Falafel Wrap", description: "Fried to order, tahini, herb salad, pickled turnip.", price: 1195, cost: 265, prep: 420, station: "fry", img: "pita", options: [SPICE] },
      { id: "it_shawarmawrap", section: "Wraps", name: "Beef Shawarma Wrap", description: "Shaved beef, tahini, tomato, parsley, sumac.", price: 1395, cost: 385, prep: 360, station: "grill", img: "shawarma" },
      { id: "it_mutabbal", section: "Mezze", name: "Mutabbal", description: "Charred eggplant, tahini, pomegranate.", price: 950, cost: 195, prep: 180, station: "cold", img: "hummus" },
      { id: "it_fattoush", section: "Mezze", name: "Fattoush", description: "Little gem, radish, mint, sumac, crisped saj.", price: 950, cost: 205, prep: 210, station: "cold", img: "salad" },
      { id: "it_mint", section: "Drinks", name: "Mint Lemonade", description: "Pressed lemon, mint, a little orange blossom.", price: 500, cost: 75, prep: 60, station: "bar", img: "lemonade", options: [SIZE] },
    ],
  },
  {
    id: "org_pie",
    slug: "pie-society",
    name: "Pie Society",
    cuisine: "Pizza",
    band: "$",
    rating: 4.4,
    ratingCount: 1587,
    blurb: "72-hour cold ferment. Sold by the slice until it runs out, which it does.",
    hue: 6,
    img: "pizza",
    promo: "Buy 1 get 1 slice",
    distance: 2.3,
    address: "16 Dolores St",
    prepBase: 660,
    deliveryFee: 199,
    multiplier: 1,
    items: [
      { id: "it_pepperoni", section: "Most popular", name: "Cup & Char Pepperoni", description: "Aged mozzarella, hot honey on request.", price: 1895, cost: 465, prep: 600, station: "grill", img: "pizza", popular: true, options: [SIZE] },
      { id: "it_margherita", section: "Most popular", name: "Margherita", description: "San Marzano, fior di latte, basil, olive oil.", price: 1650, cost: 385, prep: 600, station: "grill", img: "pizza", popular: true, options: [SIZE] },
      { id: "it_funghi", section: "Pizza", name: "Funghi", description: "Roasted maitake, taleggio, thyme, garlic cream.", price: 1995, cost: 510, prep: 660, station: "grill", img: "pizza", options: [SIZE] },
      { id: "it_slice", section: "By the Slice", name: "Cheese Slice", description: "Whatever came out of the oven most recently.", price: 425, cost: 95, prep: 60, station: "assembly", img: "cheese" },
      { id: "it_garlicknots", section: "Sides", name: "Garlic Knots", description: "Six knots, cultured butter, parm, chili flake.", price: 675, cost: 130, prep: 300, station: "grill", img: "garlicbread", popular: true },
      { id: "it_caesar", section: "Sides", name: "Kale Caesar", description: "Lacinato, rye crouton, white anchovy dressing.", price: 950, cost: 210, prep: 180, station: "cold", img: "salad" },
    ],
  },
];

export function seed(db: DatabaseSync): void {
  const already = db.prepare("SELECT COUNT(*) AS n FROM orgs").get() as { n: number };
  if (already.n > 0) return;

  // The seed creates staff accounts with a shared, published password. That is
  // fine on a laptop and unacceptable on a public URL, so production has to ask
  // for it explicitly.
  //
  // Skipping, not throwing. seed() runs inside getDb(), so throwing here would
  // take down every request including the health check — a fresh production
  // deploy would crash-loop before anyone could sign up. An empty database is
  // the correct state for a real launch: restaurants arrive through signup.
  if (process.env.NODE_ENV === "production" && process.env.MD_ALLOW_DEMO_SEED !== "true") {
    console.info(
      "[seed] Production database is empty and MD_ALLOW_DEMO_SEED is not set. " +
      "Starting with no restaurants — sign one up at /partners/signup. " +
      "Set MD_ALLOW_DEMO_SEED=true to load the demo data instead, accepting " +
      "that it creates accounts with a password published in the source.",
    );
    return;
  }

  const insertOrg = db.prepare(`
    INSERT INTO orgs (org_id, slug, brand_name, cuisine, price_band, rating, rating_count,
                      blurb, hero_hue, image_kw, promo, is_sponsored, distance_mi, address,
                      prep_base_seconds, accepting_orders, delivery_fee_cents, points_multiplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO items (item_id, org_id, section, name, description, price_cents,
                       cost_cents, prep_seconds, station, is_available, sort_order,
                       image_kw, is_popular, options_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const org of ORGS) {
    insertOrg.run(
      org.id, org.slug, org.name, org.cuisine, org.band, org.rating, org.ratingCount,
      org.blurb, org.hue, org.img, org.promo ?? null, org.sponsored ? 1 : 0,
      org.distance, org.address, org.prepBase, org.deliveryFee, org.multiplier,
    );
    org.items.forEach((item, i) => {
      insertItem.run(
        item.id, org.id, item.section, item.name, item.description, item.price,
        item.cost, item.prep, item.station, item.available === false ? 0 : 1, i,
        item.img, item.popular ? 1 : 0, JSON.stringify(item.options ?? []),
      );
    });
  }

  const now = new Date().toISOString();

  // Publish v1 for every demo restaurant. This used to happen lazily the first
  // time anything read a menu, which was fine while every org came from this
  // seed — and wrong the moment real restaurants could sign up, because it put
  // their untouched placeholder items on sale without them asking.
  const insertVersion = db.prepare(`
    INSERT INTO menu_versions (menu_version_id, org_id, version_no, content_hash,
                               snapshot_json, item_count, source, published_by, published_at)
    VALUES (?, ?, 1, ?, ?, ?, 'seed', NULL, ?)
  `);
  for (const org of ORGS) {
    const items = org.items.map((item, i) => ({
      itemId: item.id,
      orgId: org.id,
      section: item.section,
      name: item.name,
      description: item.description,
      priceCents: item.price,
      costCents: item.cost,
      prepSeconds: item.prep,
      station: item.station,
      isAvailable: item.available !== false,
      sortOrder: i,
      imageKw: item.img,
      isPopular: item.popular === true,
      optionGroups: item.options ?? [],
    }));
    const snapshot = items.map(toSnapshotItem).sort((a, b) => a.itemId.localeCompare(b.itemId));
    insertVersion.run(
      `mv_${org.slug}_v1`, org.id, contentHashOf(items),
      JSON.stringify(snapshot), items.length, now,
    );
  }

  // Demo customer. Sign in on /signin with this number; the one-time code is
  // shown on screen in development because no SMS provider is wired up.
  db.prepare(`
    INSERT INTO persons (person_id, phone_e164, display_name, created_at,
                         marketing_sms, marketing_email, consent_at)
    VALUES (?, ?, ?, ?, 1, 1, ?)
  `).run(DEMO_PERSON, "+14155550142", "Alex Rivera", now, now);

  db.prepare(`
    INSERT INTO wallet (person_id, display_name, points_balance, tier, orders_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(DEMO_PERSON, "Alex Rivera", 2847, "gold", 22);

  db.prepare(`
    INSERT INTO loyalty_entries (person_id, org_id, order_id, delta, reason, created_at)
    VALUES (?, NULL, NULL, ?, ?, ?)
  `).run(DEMO_PERSON, 2847, "opening_balance", now);

  // One owner per restaurant, plus a manager and a shift lead at Sunrise so the
  // role checks are exercisable. Shared demo password — fine here, never real.
  const insertStaff = db.prepare(`
    INSERT INTO staff (staff_id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const hash = hashPassword(DEMO_PASSWORD);

  for (const org of ORGS) {
    insertStaff.run(
      `staff_${org.slug}_owner`, org.id, `owner@${org.slug}.test`,
      `${org.name} Owner`, "owner", hash, now,
    );
  }
  insertStaff.run(
    "staff_sunrise_manager", "org_sunrise", "manager@sunrise-taqueria.test",
    "Dani Okafor", "manager", hash, now,
  );
  insertStaff.run(
    "staff_sunrise_lead", "org_sunrise", "lead@sunrise-taqueria.test",
    "Sam Ortiz", "shift_lead", hash, now,
  );
}
