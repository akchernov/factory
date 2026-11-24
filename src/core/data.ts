/**
 * Bee Factory: single source of truth for all game data and balance.
 * Time unit inside the sim: tick = 100 ms. Rates below are per second unless noted.
 */

export const TICK_MS = 100;
export const TPS = 1000 / TICK_MS;

// ---------------------------------------------------------------- items

export type ItemId =
  | 'comb' | 'honey' | 'wax' | 'jar' | 'candle' | 'water' | 'mead'
  | 'pollen' | 'propolis' | 'jelly';

export interface ItemDef {
  readonly name: string;
  readonly icon: string;
  /** Base market price in coins. 0 = market refuses it. */
  readonly price: number;
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  comb: { name: 'Соты', icon: 'i_comb', price: 1 },
  honey: { name: 'Мёд', icon: 'i_honey', price: 2 },
  wax: { name: 'Воск', icon: 'i_wax', price: 2 },
  jar: { name: 'Банка мёда', icon: 'i_jar', price: 6 },
  candle: { name: 'Свеча', icon: 'i_candle', price: 10 },
  water: { name: 'Вода', icon: 'i_nectar', price: 0 },
  mead: { name: 'Медовуха', icon: 'i_mead', price: 32 },
  pollen: { name: 'Пыльца', icon: 'i_pollen', price: 6 },
  propolis: { name: 'Прополис', icon: 'i_propolis', price: 18 },
  jelly: { name: 'Маточное молочко', icon: 'i_jelly', price: 45 },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

// ---------------------------------------------------------------- terrain

export type FlowerId = 'clover' | 'buckwheat' | 'lavender' | 'sunflower' | 'heather' | 'linden';

export interface FlowerDef {
  readonly name: string;
  readonly sprite: string;
  /** Comb per second that one tile gives to the hives that cover it (shared between them). */
  readonly yield: number;
}

export const FLOWERS: Readonly<Record<FlowerId, FlowerDef>> = {
  clover: { name: 'Клевер', sprite: 'f_daisy', yield: 0.014 },
  buckwheat: { name: 'Гречиха', sprite: 'f_buckwheat', yield: 0.02 },
  lavender: { name: 'Лаванда', sprite: 'f_lavender', yield: 0.018 },
  sunflower: { name: 'Подсолнух', sprite: 'f_sunflower', yield: 0.016 },
  heather: { name: 'Вереск', sprite: 'f_heather', yield: 0.015 },
  linden: { name: 'Липа', sprite: 'd_linden', yield: 0.05 },
};
export const FLOWER_IDS = Object.keys(FLOWERS) as FlowerId[];

// ---------------------------------------------------------------- bees

export type SpeciesId = 'forest' | 'meadow' | 'common' | 'cultivated' | 'lavender' | 'noble' | 'imperial' | 'golden';

export interface SpeciesDef {
  readonly name: string;
  readonly tier: number;
  readonly productivity: number;
  readonly prefers?: FlowerId;
  /** Extra items per comb produced: chance 0..1. */
  readonly specials: Readonly<Partial<Record<ItemId, number>>>;
  readonly color: number;
  readonly lore: string;
}

/** Yield multiplier for a species on its preferred flower. */
export const PREFERRED_BONUS = 1.6;

export const SPECIES: Readonly<Record<SpeciesId, SpeciesDef>> = {
  forest: { name: 'Лесная', tier: 0, productivity: 1, prefers: 'linden', specials: {}, color: 0x8a6a3a, lore: 'Дикая пчела опушек. Любит липу.' },
  meadow: { name: 'Луговая', tier: 0, productivity: 1, prefers: 'clover', specials: {}, color: 0xc9b45a, lore: 'Дикая пчела лугов. Любит клевер.' },
  common: { name: 'Обычная', tier: 1, productivity: 1.3, specials: {}, color: 0xd8a640, lore: 'Спокойная и неприхотливая.' },
  cultivated: { name: 'Культурная', tier: 2, productivity: 1.6, prefers: 'buckwheat', specials: { pollen: 0.12 }, color: 0xe5b43a, lore: 'Несёт пыльцу. Любит гречиху.' },
  lavender: { name: 'Лавандовая', tier: 2, productivity: 1.4, prefers: 'lavender', specials: { pollen: 0.2 }, color: 0x9b7ad8, lore: 'Ароматный мёд и много пыльцы.' },
  noble: { name: 'Благородная', tier: 3, productivity: 1.9, prefers: 'sunflower', specials: { propolis: 0.15 }, color: 0xd97a2b, lore: 'Даёт прополис. Любит подсолнух.' },
  imperial: { name: 'Императорская', tier: 4, productivity: 2.3, prefers: 'heather', specials: { jelly: 0.12, propolis: 0.05 }, color: 0xb0463a, lore: 'Маточное молочко. Любит вереск.' },
  golden: { name: 'Золотая', tier: 5, productivity: 3.2, specials: { jelly: 0.25, propolis: 0.12 }, color: 0xffd23a, lore: 'Легенда пасечников.' },
};
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];
export const WILD_SPECIES: readonly SpeciesId[] = ['forest', 'meadow'];

export interface Mutation {
  readonly a: SpeciesId;
  readonly b: SpeciesId;
  readonly result: SpeciesId;
  readonly chance: number;
}

export const MUTATIONS: readonly Mutation[] = [
  { a: 'forest', b: 'meadow', result: 'common', chance: 0.4 },
  { a: 'common', b: 'forest', result: 'cultivated', chance: 0.25 },
  { a: 'common', b: 'meadow', result: 'cultivated', chance: 0.25 },
  { a: 'meadow', b: 'cultivated', result: 'lavender', chance: 0.25 },
  { a: 'common', b: 'cultivated', result: 'noble', chance: 0.2 },
  { a: 'cultivated', b: 'noble', result: 'imperial', chance: 0.14 },
  { a: 'lavender', b: 'noble', result: 'imperial', chance: 0.1 },
  { a: 'noble', b: 'imperial', result: 'golden', chance: 0.08 },
];

/** Each pollen in the breeder multiplies mutation chance (consumed per cycle, max POLLEN_MAX). */
export const BREED = { honeyPerCycle: 10, seconds: 30, pollenBoost: 0.35, pollenMax: 3 };

// ---------------------------------------------------------------- buildings

export type BuildingId =
  | 'belt' | 'belt2' | 'belt3' | 'splitter' | 'hive' | 'extractor' | 'packer' | 'chandlery'
  | 'well' | 'brewery' | 'lab' | 'breeder' | 'market' | 'chest' | 'monument' | 'smoker' | 'fence';

export interface Recipe {
  readonly inputs: Readonly<Partial<Record<ItemId, number>>>;
  readonly outputs: Readonly<Partial<Record<ItemId, number>>>;
  readonly seconds: number;
}

export type Behaviour = 'belt' | 'hive' | 'machine' | 'lab' | 'breeder' | 'market' | 'store' | 'monument' | 'tower' | 'wall';

export interface BuildingDef {
  readonly name: string;
  readonly sprite: string;
  readonly size: number;
  readonly cost: number;
  readonly behaviour: Behaviour;
  readonly recipe?: Recipe;
  /** Belt speed, tiles per second. */
  readonly speed?: number;
  /** Store capacity (items total). */
  readonly capacity?: number;
  readonly hint: string;
  readonly hotkey: string;
  /** Hit points. */
  readonly hp: number;
}

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  belt: { name: 'Конвейер', sprite: 'belt', size: 1, cost: 2, behaviour: 'belt', speed: 1.0, hint: 'Везёт 1.25 предмета в секунду. Тяни мышью линией, R (К) поворачивает.', hotkey: '1', hp: 40 },
  hive: { name: 'Улей', sprite: 'b_hive', size: 2, cost: 40, behaviour: 'hive', hint: 'Пчёлы собирают нектар с цветов в радиусе 4 и делают соты. Выход: на конвейер, идущий от улья.', hotkey: '2', hp: 220 },
  extractor: { name: 'Медогонка', sprite: 'b_extractor', size: 2, cost: 60, behaviour: 'machine', recipe: { inputs: { comb: 1 }, outputs: { honey: 2, wax: 1 }, seconds: 2.5 }, hint: 'Соты в мёд и воск.', hotkey: '3', hp: 260 },
  packer: { name: 'Фасовка', sprite: 'b_packer', size: 2, cost: 60, behaviour: 'machine', recipe: { inputs: { honey: 2 }, outputs: { jar: 1 }, seconds: 2 }, hint: 'Мёд в банки. Банки нужны для науки и продажи.', hotkey: '4', hp: 260 },
  market: { name: 'Рынок', sprite: 'b_market', size: 2, cost: 80, behaviour: 'market', hint: 'Продаёт всё, что приходит. Цена падает, если заваливать рынок одним товаром.', hotkey: '5', hp: 300 },
  lab: { name: 'Лаборатория', sprite: 'b_lab', size: 2, cost: 100, behaviour: 'lab', hint: 'Тратит продукцию на исследования. Выбери технологию в дереве (T).', hotkey: '6', hp: 260 },
  chest: { name: 'Склад', sprite: 'b_chest', size: 1, cost: 15, behaviour: 'store', capacity: 60, hint: 'Буфер на 60 предметов: принимает и отдаёт дальше.', hotkey: '7', hp: 150 },
  splitter: { name: 'Развилка', sprite: 'splitter', size: 1, cost: 10, behaviour: 'store', capacity: 2, hint: 'Делит поток поровну между всеми конвейерами, идущими от неё.', hotkey: '8', hp: 60 },
  chandlery: { name: 'Свечная', sprite: 'b_chandlery', size: 2, cost: 120, behaviour: 'machine', recipe: { inputs: { wax: 2 }, outputs: { candle: 1 }, seconds: 3 }, hint: 'Воск в свечи.', hotkey: '9', hp: 260 },
  well: { name: 'Колодец', sprite: 'b_well', size: 2, cost: 60, behaviour: 'machine', recipe: { inputs: {}, outputs: { water: 1 }, seconds: 1.2 }, hint: 'Даёт воду для медоварни.', hotkey: '0', hp: 260 },
  brewery: { name: 'Медоварня', sprite: 'b_brewery', size: 2, cost: 220, behaviour: 'machine', recipe: { inputs: { honey: 4, water: 2 }, outputs: { mead: 1 }, seconds: 5 }, hint: 'Мёд и вода в медовуху.', hotkey: 'Q', hp: 300 },
  breeder: { name: 'Селекция', sprite: 'b_breeder', size: 2, cost: 250, behaviour: 'breeder', hint: 'Скрещивает пчёл. Ест мёд с конвейера, пыльца повышает шанс мутации.', hotkey: 'E', hp: 260 },
  belt2: { name: 'Быстрый конвейер', sprite: 'belt2', size: 1, cost: 6, behaviour: 'belt', speed: 2.0, hint: 'Вдвое быстрее: 2.5 предмета в секунду. Ставь прямо поверх обычного.', hotkey: 'Z', hp: 50 },
  belt3: { name: 'Экспресс-конвейер', sprite: 'belt3', size: 1, cost: 15, behaviour: 'belt', speed: 3.0, hint: 'Втрое быстрее: 3.75 предмета в секунду.', hotkey: 'C', hp: 60 },
  smoker: { name: 'Дымарь', sprite: 'b_smoker', size: 2, cost: 90, behaviour: 'tower', hint: 'Оборонная башня. Отгоняет медведей и шершней дымом в радиусе 6. Топливо: воск (подавай конвейером, иначе берёт из сарая).', hotkey: 'G', hp: 320 },
  fence: { name: 'Забор', sprite: 'b_fence', size: 1, cost: 4, behaviour: 'wall', hint: 'Медведи не пройдут, пока не сломают. Шершни перелетают. Тяни мышью линией.', hotkey: 'F', hp: 360 },
  monument: { name: 'Великий улей', sprite: 'b_monument', size: 3, cost: 6000, behaviour: 'monument', hint: 'Финальная цель. Наполни его и стань легендой.', hotkey: 'V', hp: 3000 },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const HOTBAR: readonly BuildingId[] = ['belt', 'hive', 'extractor', 'packer', 'market', 'lab', 'chest', 'splitter', 'smoker', 'fence', 'chandlery', 'well', 'brewery', 'breeder', 'belt2', 'belt3', 'monument'];

export const HIVE = { radius: 4, nightFactor: 0.35, buffer: 12 };
export const MACHINE_OUTPUT_CAP = 12;
export const BELT_GAP = 0.8;
export const LAB_SECONDS_PER_ITEM = 1.2;

export const MONUMENT_NEEDS: Readonly<Partial<Record<ItemId, number>>> = { jar: 150, candle: 80, mead: 40, propolis: 20, jelly: 20 };

// ---------------------------------------------------------------- research

export type TechId =
  | 'chandlery' | 'belt2' | 'trade' | 'breeding' | 'brewing' | 'colonies'
  | 'belt3' | 'mechanics' | 'feeding' | 'greathive';

export interface TechDef {
  readonly name: string;
  readonly desc: string;
  readonly cost: Readonly<Partial<Record<ItemId, number>>>;
  readonly requires: readonly TechId[];
  readonly unlocks: readonly BuildingId[];
  readonly icon: string;
  /** Position in the tree view (column, row). */
  readonly pos: readonly [number, number];
}

export const TECHS: Readonly<Record<TechId, TechDef>> = {
  chandlery: { name: 'Свечное дело', desc: 'Открывает Свечную: воск в свечи.', cost: { jar: 10 }, requires: [], unlocks: ['chandlery'], icon: 'i_candle', pos: [0, 0] },
  belt2: { name: 'Быстрые конвейеры', desc: 'Конвейер вдвое быстрее.', cost: { jar: 20 }, requires: [], unlocks: ['belt2'], icon: 'i_coin', pos: [0, 1] },
  trade: { name: 'Торговые связи', desc: 'Цены на рынке +25%, рынок восстанавливается быстрее.', cost: { jar: 30 }, requires: [], unlocks: [], icon: 'i_coin', pos: [0, 2] },
  breeding: { name: 'Селекция', desc: 'Открывает селекционную пасеку и скрещивание пчёл.', cost: { jar: 30, candle: 10 }, requires: ['chandlery'], unlocks: ['breeder'], icon: 'i_bee', pos: [1, 0] },
  brewing: { name: 'Медоварение', desc: 'Колодец и Медоварня: медовуха дорогая.', cost: { jar: 40, candle: 20 }, requires: ['chandlery'], unlocks: ['well', 'brewery'], icon: 'i_mead', pos: [1, 1] },
  colonies: { name: 'Сильные семьи', desc: 'Все ульи +30% к сбору.', cost: { jar: 40, candle: 15 }, requires: ['chandlery'], unlocks: [], icon: 'i_comb', pos: [1, 2] },
  belt3: { name: 'Экспресс-конвейеры', desc: 'Конвейер втрое быстрее.', cost: { candle: 30, mead: 10 }, requires: ['belt2', 'brewing'], unlocks: ['belt3'], icon: 'i_coin', pos: [2, 1] },
  mechanics: { name: 'Механизация', desc: 'Все станки работают на 40% быстрее.', cost: { candle: 40, mead: 20 }, requires: ['brewing'], unlocks: [], icon: 'i_honey', pos: [2, 2] },
  feeding: { name: 'Подкормка', desc: 'Все ульи ещё +40% к сбору.', cost: { mead: 20, propolis: 10 }, requires: ['breeding', 'colonies'], unlocks: [], icon: 'i_propolis', pos: [2, 0] },
  greathive: { name: 'Великий улей', desc: 'Открывает финальную постройку.', cost: { mead: 40, jelly: 15 }, requires: ['breeding', 'brewing'], unlocks: ['monument'], icon: 'i_jelly', pos: [3, 1] },
};
export const TECH_IDS = Object.keys(TECHS) as TechId[];
export const START_UNLOCKED: readonly BuildingId[] = ['belt', 'hive', 'extractor', 'packer', 'market', 'lab', 'chest', 'splitter', 'smoker', 'fence'];

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'bear' | 'hornet';

export interface EnemyDef {
  readonly name: string;
  readonly sprite: string;
  readonly hp: number;
  /** Tiles per second. */
  readonly speed: number;
  /** Damage per second to buildings. */
  readonly dps: number;
  readonly reward: number;
  /** Flying enemies ignore fences and other buildings in the way. */
  readonly flying: boolean;
}

export const ENEMIES: Readonly<Record<EnemyKind, EnemyDef>> = {
  bear: { name: 'Медведь', sprite: 'e_bear', hp: 160, speed: 0.8, dps: 14, reward: 30, flying: false },
  hornet: { name: 'Шершень', sprite: 'e_hornet', hp: 24, speed: 2.1, dps: 4, reward: 4, flying: true },
};

export const SMOKER = { range: 6.5, dps: 26, secondsPerWax: 2.5, ammoCap: 10 };
export const NEST = { hp: 450, reward: 150, count: 4 };
export const RAIDS = {
  /** First raid comes on this day. */
  firstDay: 2,
  /** Day phase (0..1) of bear raids (dusk) and hornet raids (midday). */
  bearPhase: 0.76,
  hornetPhase: 0.36,
  /** Threat grows with every comb produced (like pollution in Factorio). */
  threatPerComb: 0.1,
  maxBears: 10,
  maxHornets: 12,
};
/** Buildings heal this share of max HP per second after REGEN_DELAY seconds without damage. */
export const REGEN = { delay: 8, perSecond: 0.03 };

// ---------------------------------------------------------------- economy

export const START_MONEY = 320;
export const MARKET = {
  /** Price multiplier drop per sold item of that type. */
  saturationPerSale: 0.008,
  /** Recovery towards 1 per second. */
  recoveryPerSecond: 0.006,
  tradeRecovery: 0.012,
  minFactor: 0.35,
  tradeBonus: 1.25,
};
export const REFUND = 1;

// ---------------------------------------------------------------- world

export const MAP_W = 84;
export const MAP_H = 60;
/** Day length in seconds; night is the last NIGHT_SHARE of it. */
export const DAY_SECONDS = 240;
export const NIGHT_SHARE = 0.25;

// ---------------------------------------------------------------- quests

export type QuestCheck =
  | { kind: 'build'; building: BuildingId; count: number }
  | { kind: 'produced'; item: ItemId; count: number }
  | { kind: 'sold'; item: ItemId; count: number }
  | { kind: 'money'; count: number }
  | { kind: 'earned'; count: number }
  | { kind: 'tech'; tech: TechId }
  | { kind: 'species'; species: SpeciesId }
  | { kind: 'monument' }
  | { kind: 'nests'; count: number };

export interface QuestDef {
  readonly title: string;
  readonly text: string;
  readonly check: QuestCheck;
  readonly reward: number;
}

export type GameMode = 'short' | 'full';

/** Short demo game (~10 minutes): the first production chains and one research. */
export const QUESTS_SHORT: readonly QuestDef[] = [
  { title: 'Первая семья', text: 'Поставь улей (2) рядом с цветами. Следуй за жёлтой стрелкой.', check: { kind: 'build', building: 'hive', count: 1 }, reward: 20 },
  { title: 'Медогонка', text: 'Протяни конвейер (1) ОТ улья к медогонке (3).', check: { kind: 'produced', item: 'honey', count: 4 }, reward: 30 },
  { title: 'Первая банка', text: 'Мёд в фасовку (4), банки на рынок (5).', check: { kind: 'sold', item: 'jar', count: 1 }, reward: 50 },
  { title: 'Оборона', text: 'Вечером придёт медведь. Поставь дымарь (G) рядом с ульем: он жжёт воск из сарая и с медогонки.', check: { kind: 'build', building: 'smoker', count: 1 }, reward: 40 },
  { title: 'Второй улей', text: 'Поставь ещё один улей у цветов и проведи его соты в ту же медогонку или в новую.', check: { kind: 'build', building: 'hive', count: 2 }, reward: 60 },
  { title: 'Наука', text: 'Построй лабораторию (6), в дереве (T) выбери «Свечное дело» и подай в неё банки конвейером.', check: { kind: 'tech', tech: 'chandlery' }, reward: 80 },
  { title: 'Свечная лавка', text: 'Воск с медогонки отправь в свечную (9), свечи на рынок. Продай 8 свечей.', check: { kind: 'sold', item: 'candle', count: 8 }, reward: 100 },
  { title: 'Медовый магнат', text: 'Заработай на рынке 1200 монет за игру.', check: { kind: 'earned', count: 1200 }, reward: 0 },
];
/** Research costs are scaled down in the short game. */
export const SHORT_TECH_COST = 0.5;

export const QUESTS: readonly QuestDef[] = [
  { title: 'Первая семья', text: 'Поставь улей (2) рядом с цветами. Чем больше цветов в радиусе, тем быстрее соты.', check: { kind: 'build', building: 'hive', count: 1 }, reward: 20 },
  { title: 'Медогонка', text: 'Поставь медогонку (3) и протяни к ней конвейер (1) от улья. Конвейер должен идти ОТ улья В медогонку.', check: { kind: 'produced', item: 'honey', count: 4 }, reward: 30 },
  { title: 'Первая банка', text: 'Мёд с медогонки отправь конвейером в фасовку (4), банки на рынок (5).', check: { kind: 'sold', item: 'jar', count: 1 }, reward: 50 },
  { title: 'Оборона', text: 'Ночью из леса приходят медведи, днём прилетают шершни. Поставь дымарь (G) у ульев и подай ему воск с медогонки. Забор (F) задержит медведей.', check: { kind: 'build', building: 'smoker', count: 1 }, reward: 60 },
  { title: 'Своё дело', text: 'Заработай на рынке 500 монет. Больше ульев, больше цветов!', check: { kind: 'earned', count: 500 }, reward: 60 },
  { title: 'Наука', text: 'Построй лабораторию (6), открой дерево технологий (T), выбери «Свечное дело» и подай в лабораторию банки.', check: { kind: 'tech', tech: 'chandlery' }, reward: 80 },
  { title: 'Свет в окнах', text: 'Воск с медогонки отправь в свечную (9). Сделай 15 свечей.', check: { kind: 'produced', item: 'candle', count: 15 }, reward: 100 },
  { title: 'Селекционер', text: 'Изучи «Селекцию», построй пасеку (E), подай ей мёд и скрести Лесную с Луговой.', check: { kind: 'species', species: 'common' }, reward: 150 },
  { title: 'Медовуха', text: 'Изучи «Медоварение». Колодец + мёд в медоварню. Свари 5 медовухи.', check: { kind: 'produced', item: 'mead', count: 5 }, reward: 200 },
  { title: 'Благородство', text: 'Выведи Благородную пчелу: она даёт прополис.', check: { kind: 'species', species: 'noble' }, reward: 250 },
  { title: 'Зачистка', text: 'Поставь дымарь рядом с гнездом шершней (оранжевое на мини-карте) и уничтожь его. Награда за гнездо 150.', check: { kind: 'nests', count: 1 }, reward: 100 },
  { title: 'Королевский двор', text: 'Выведи Императорскую пчелу: она даёт маточное молочко.', check: { kind: 'species', species: 'imperial' }, reward: 300 },
  { title: 'Великий улей', text: 'Изучи «Великий улей» и построй его.', check: { kind: 'build', building: 'monument', count: 1 }, reward: 0 },
  { title: 'Легенда', text: 'Наполни Великий улей: банки, свечи, медовуха, прополис и молочко.', check: { kind: 'monument' }, reward: 0 },
];
