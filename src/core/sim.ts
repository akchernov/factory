import {
  BELT_GAP, BREED, BUILDINGS, DAY_SECONDS, FLOWERS, FLOWER_IDS, HIVE, ITEMS, ITEM_IDS, LAB_SECONDS_PER_ITEM,
  MACHINE_OUTPUT_CAP, MARKET, MONUMENT_NEEDS, MUTATIONS, NIGHT_SHARE, PREFERRED_BONUS, QUESTS, REFUND, SPECIES,
  SPECIES_IDS, START_MONEY, START_UNLOCKED, TECHS, TECH_IDS, WILD_SPECIES,
  ENEMIES, NEST, RAIDS, REGEN, SMOKER,
  type BuildingId, type EnemyKind, type ItemId, type SpeciesId, type TechId,
} from './data';
import { Terrain, generateMap, type MapData } from './map';
import { nextRandom } from './rng';

export type Dir = 0 | 1 | 2 | 3; // east, south, west, north
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;
export type Inv = Partial<Record<ItemId, number>>;

export interface BeltItem { item: ItemId; pos: number }

export interface Building {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
  dir: Dir;
  /** Belt contents, sorted by pos ascending (front item last). */
  items: BeltItem[];
  inv: Inv;
  out: Inv;
  progress: number;
  acc: number;
  rr: number;
  species?: SpeciesId;
  parents?: [SpeciesId, SpeciesId];
  working: boolean;
  hp: number;
  /** Game time of the last damage taken. */
  hitAt: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  /** Building being attacked or walked to. */
  target: number;
  /** Fleeing enemies run back to the edge (after a hive is robbed). */
  flee: boolean;
  /** Building currently being chewed (fence in the way, or the target). */
  biting: number;
}

export interface Nest { id: number; x: number; y: number; hp: number }

export interface Stats {
  produced: Inv;
  sold: Inv;
  earned: number;
  killed: number;
  nests: number;
  lost: number;
}

export interface GameState {
  version: 3;
  seed: number;
  rng: number;
  time: number;
  money: number;
  buildings: Building[];
  nextId: number;
  queens: Partial<Record<SpeciesId, number>>;
  discovered: SpeciesId[];
  barn: Inv;
  techs: TechId[];
  research: TechId | null;
  researchProgress: Partial<Record<TechId, Inv>>;
  market: Inv;
  stats: Stats;
  quest: number;
  cleared: number[];
  won: boolean;
  wonAt: number;
  monument: Inv;
  enemies: Enemy[];
  nests: Nest[] | null;
  threat: number;
  /** Last day a raid of this kind spawned. */
  raided: { bear: number; hornet: number };
  peaceful: boolean;
}

export type GameEvent =
  | { t: 'sold'; item: ItemId; coins: number; x: number; y: number }
  | { t: 'produced'; id: number; item: ItemId }
  | { t: 'built'; id: number; type: BuildingId }
  | { t: 'removed'; type: BuildingId; x: number; y: number }
  | { t: 'mutation'; species: SpeciesId; isNew: boolean; x: number; y: number }
  | { t: 'queen'; species: SpeciesId; x: number; y: number }
  | { t: 'tech'; tech: TechId }
  | { t: 'quest'; index: number; reward: number }
  | { t: 'won' }
  | { t: 'raid'; kind: EnemyKind; count: number; x: number; y: number }
  | { t: 'killed'; kind: EnemyKind; x: number; y: number; coins: number }
  | { t: 'destroyed'; type: BuildingId; x: number; y: number }
  | { t: 'nest'; x: number; y: number; coins: number }
  | { t: 'hit'; id: number }
  | { t: 'shot'; from: number; x: number; y: number };

export type Fail = 'bounds' | 'blocked' | 'money' | 'locked' | 'queen' | 'missing' | 'invalid';
export type Result = { ok: true } | { ok: false; reason: Fail };

export const FAIL_TEXT: Record<Fail, string> = {
  bounds: 'За краем карты',
  blocked: 'Место занято',
  money: 'Не хватает монет',
  locked: 'Сначала изучи технологию',
  queen: 'Нет свободной матки. Купи или выведи в селекции (B)',
  missing: 'Тут ничего нет',
  invalid: 'Так нельзя',
};

const OK: Result = { ok: true };
const fail = (reason: Fail): Result => ({ ok: false, reason });

export const QUEEN_PRICE = 30;
export const CLEAR_PRICE = 5;
const DT = 0.1;

function add(inv: Inv, item: ItemId, n: number) {
  inv[item] = (inv[item] ?? 0) + n;
}
function count(inv: Inv, item: ItemId) {
  return inv[item] ?? 0;
}

export function newGame(seed = 20261124, peaceful = false): GameState {
  return {
    version: 3,
    seed,
    rng: seed,
    time: DAY_SECONDS * 0.08,
    money: START_MONEY,
    buildings: [],
    nextId: 1,
    queens: { forest: 2, meadow: 2 },
    discovered: ['forest', 'meadow'],
    barn: { wax: 20 },
    techs: [],
    research: null,
    researchProgress: {},
    market: {},
    stats: { produced: {}, sold: {}, earned: 0, killed: 0, nests: 0, lost: 0 },
    quest: 0,
    cleared: [],
    won: false,
    wonAt: 0,
    monument: {},
    enemies: [],
    nests: null,
    threat: 0,
    raided: { bear: 1, hornet: 1 },
    peaceful,
  };
}

/** Daylight 0..1 (1 = noon). Night is the last NIGHT_SHARE of the day. */
export function daylight(time: number): number {
  const phase = (time % DAY_SECONDS) / DAY_SECONDS;
  const dayLen = 1 - NIGHT_SHARE;
  if (phase < dayLen) {
    const p = phase / dayLen;
    // Smooth dawn and dusk, flat bright midday.
    return Math.min(1, Math.sin(p * Math.PI) * 1.6);
  }
  return 0;
}

export class Game {
  state: GameState;
  readonly map: MapData;
  events: GameEvent[] = [];
  /** tile index -> building id (0 = empty). */
  private grid!: Int32Array;
  private byId = new Map<number, Building>();
  private outs = new Map<number, number[]>();
  private terminal = new Map<number, number>();
  private hiveRate = new Map<number, number>();
  private beltCurve = new Map<number, boolean>();

  constructor(state: GameState = newGame()) {
    this.state = state;
    this.map = generateMap(state.seed);
    for (const i of state.cleared) {
      this.map.terrain[i] = Terrain.Grass;
      this.map.flower[i] = -1;
    }
    if (!state.nests) state.nests = this.placeNests();
    this.rebuild();
  }

  /** Hornet nests far from the start, on grass, spread around the map. */
  private placeNests(): Nest[] {
    const m = this.map;
    const out: Nest[] = [];
    const st = { rng: this.state.seed ^ 0x5eed };
    for (let tries = 0; tries < 4000 && out.length < NEST.count; tries++) {
      const x = 2 + Math.floor(nextRandom(st) * (m.w - 5));
      const y = 2 + Math.floor(nextRandom(st) * (m.h - 5));
      if (Math.hypot(x - m.start.x, y - m.start.y) < 24) continue;
      if (out.some((n) => Math.hypot(n.x - x, n.y - y) < 18)) continue;
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++) for (let dx = 0; dx < 2 && ok; dx++) if (m.terrain[(y + dy) * m.w + x + dx] !== Terrain.Grass) ok = false;
      if (!ok) continue;
      out.push({ id: this.state.nextId++, x, y, hp: NEST.hp });
    }
    return out;
  }

  nestAt(x: number, y: number): Nest | undefined {
    return this.state.nests?.find((n) => n.hp > 0 && x >= n.x && x < n.x + 2 && y >= n.y && y < n.y + 2);
  }

  // ------------------------------------------------------------ queries

  get w() { return this.map.w; }
  get h() { return this.map.h; }

  idx(x: number, y: number) { return y * this.map.w + x; }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.map.w && y < this.map.h; }
  at(x: number, y: number): Building | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.grid[this.idx(x, y)]!;
    return id ? this.byId.get(id) : undefined;
  }
  get(id: number) { return this.byId.get(id); }

  isUnlocked(type: BuildingId): boolean {
    return START_UNLOCKED.includes(type) || this.state.techs.some((t) => TECHS[t].unlocks.includes(type));
  }

  canAfford(cost: Inv): boolean {
    return Object.entries(cost).every(([k, v]) => count(this.state.barn, k as ItemId) >= (v ?? 0));
  }

  light() { return daylight(this.state.time); }
  day() { return Math.floor(this.state.time / DAY_SECONDS) + 1; }

  /** Comb per second (daytime) for a hive at x,y with given species, counting flower sharing. */
  estimateHive(x: number, y: number, species: SpeciesId, extra = true): number {
    const def = SPECIES[species];
    const r = HIVE.radius;
    let rate = 0;
    const cx = x + 0.5;
    const cy = y + 0.5;
    for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
      for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
        if (!this.inBounds(tx, ty)) continue;
        if (Math.hypot(tx - cx, ty - cy) > r + 0.5) continue;
        const f = this.map.flower[this.idx(tx, ty)]!;
        if (f < 0 || this.grid[this.idx(tx, ty)]) continue;
        const fid = FLOWER_IDS[f]!;
        const share = this.coverCount(tx, ty) + (extra ? 1 : 0);
        rate += (FLOWERS[fid].yield / Math.max(1, share)) * (def.prefers === fid ? PREFERRED_BONUS : 1);
      }
    }
    return rate * def.productivity * this.hiveTechMult();
  }

  private coverCount(tx: number, ty: number): number {
    let n = 0;
    for (const b of this.state.buildings) {
      if (b.type !== 'hive') continue;
      if (Math.hypot(tx - (b.x + 0.5), ty - (b.y + 0.5)) <= HIVE.radius + 0.5) n++;
    }
    return n;
  }

  hiveTechMult(): number {
    let m = 1;
    if (this.state.techs.includes('colonies')) m *= 1.3;
    if (this.state.techs.includes('feeding')) m *= 1.4;
    return m;
  }

  /** Current comb/s of a built hive (daytime, before day/night factor). */
  hiveRateOf(id: number) { return this.hiveRate.get(id) ?? 0; }

  isCurve(id: number) { return this.beltCurve.get(id) ?? false; }

  priceOf(item: ItemId): number {
    const f = this.state.market[item] ?? 1;
    const bonus = this.state.techs.includes('trade') ? MARKET.tradeBonus : 1;
    return ITEMS[item].price * f * bonus;
  }

  bestQueen(): SpeciesId | undefined {
    let best: SpeciesId | undefined;
    for (const s of SPECIES_IDS) {
      if ((this.state.queens[s] ?? 0) > 0 && (!best || SPECIES[s].tier > SPECIES[best].tier)) best = s;
    }
    return best;
  }

  machineSpeed(): number {
    return this.state.techs.includes('mechanics') ? 1.4 : 1;
  }

  // ------------------------------------------------------------ topology

  private rebuild() {
    this.grid = new Int32Array(this.map.w * this.map.h);
    this.byId.clear();
    for (const b of this.state.buildings) {
      this.byId.set(b.id, b);
      const s = BUILDINGS[b.type].size;
      for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) this.grid[this.idx(x, y)] = b.id;
    }
    this.outs.clear();
    this.terminal.clear();
    this.beltCurve.clear();
    for (const b of this.state.buildings) {
      if (BUILDINGS[b.type].behaviour === 'belt') {
        this.beltCurve.set(b.id, this.computeCurve(b));
        continue;
      }
      const s = BUILDINGS[b.type].size;
      const list: number[] = [];
      for (let i = 0; i < s; i++) {
        const sides: [number, number, Dir][] = [
          [b.x + s, b.y + i, 0], [b.x + i, b.y + s, 1], [b.x - 1, b.y + i, 2], [b.x + i, b.y - 1, 3],
        ];
        for (const [x, y, d] of sides) {
          const n = this.at(x, y);
          if (n && BUILDINGS[n.type].behaviour === 'belt' && n.dir === d) list.push(n.id);
        }
      }
      this.outs.set(b.id, list);
    }
    for (const b of this.state.buildings) if (BUILDINGS[b.type].behaviour === 'belt') this.terminal.set(b.id, this.traceTerminal(b));
    this.hiveRate.clear();
    for (const b of this.state.buildings) {
      if (b.type === 'hive') this.hiveRate.set(b.id, this.estimateHive(b.x, b.y, b.species ?? 'forest', false));
    }
  }

  private computeCurve(b: Building): boolean {
    const behind = this.at(b.x - DX[b.dir], b.y - DY[b.dir]);
    if (behind && BUILDINGS[behind.type].behaviour === 'belt' && behind.dir === b.dir) return false;
    if (behind && BUILDINGS[behind.type].behaviour !== 'belt') return false;
    let feeders = 0;
    for (const side of [((b.dir + 1) % 4) as Dir, ((b.dir + 3) % 4) as Dir]) {
      const n = this.at(b.x + DX[side], b.y + DY[side]);
      if (n && BUILDINGS[n.type].behaviour === 'belt' && n.dir === (side + 2) % 4) feeders++;
    }
    return feeders === 1;
  }

  /** Side from which a curve is fed (for art): 1 = from the right of travel, -1 = from the left. */
  curveSide(b: Building): number {
    const right = ((b.dir + 1) % 4) as Dir;
    const n = this.at(b.x + DX[right], b.y + DY[right]);
    return n && BUILDINGS[n.type].behaviour === 'belt' && n.dir === (right + 2) % 4 ? 1 : -1;
  }

  /** Follow a belt chain to the first non-belt building. 0 = none. */
  private traceTerminal(start: Building): number {
    const seen = new Set<number>();
    let b: Building | undefined = start;
    while (b && BUILDINGS[b.type].behaviour === 'belt') {
      if (seen.has(b.id)) return 0;
      seen.add(b.id);
      const next = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
      if (!next) return 0;
      if (BUILDINGS[next.type].behaviour === 'belt' && next.dir === (b.dir + 2) % 4) return 0;
      b = next;
    }
    return b ? b.id : 0;
  }

  terminalOf(beltId: number): Building | undefined {
    const id = this.terminal.get(beltId);
    return id ? this.byId.get(id) : undefined;
  }

  // ------------------------------------------------------------ acceptance

  /** Would this building ever want this item type right now (ignores buffer fullness)? */
  wants(b: Building, item: ItemId): boolean {
    const def = BUILDINGS[b.type];
    switch (def.behaviour) {
      case 'machine': return (def.recipe!.inputs[item] ?? 0) > 0;
      case 'market': return ITEMS[item].price > 0;
      case 'store': return true;
      case 'breeder': return item === 'honey' || item === 'pollen';
      case 'lab': return this.researchNeed(item) > 0;
      case 'monument': return (MONUMENT_NEEDS[item] ?? 0) > count(this.state.monument, item);
      case 'tower': return item === 'wax';
      default: return false;
    }
  }

  private inputCap(b: Building, item: ItemId): number {
    const def = BUILDINGS[b.type];
    switch (def.behaviour) {
      case 'machine': return Math.max(4, (def.recipe!.inputs[item] ?? 0) * 3);
      case 'breeder': return item === 'honey' ? BREED.honeyPerCycle * 2 : BREED.pollenMax;
      case 'lab': return 4;
      case 'tower': return SMOKER.ammoCap;
      case 'store': return def.capacity!;
      default: return Infinity;
    }
  }

  private accepts(b: Building, item: ItemId): boolean {
    if (!this.wants(b, item)) return false;
    const def = BUILDINGS[b.type];
    if (def.behaviour === 'store') return this.total(b.inv) < def.capacity!;
    if (def.behaviour === 'lab') return count(b.inv, item) < Math.min(4, this.researchNeed(item));
    if (def.behaviour === 'monument') return true;
    return count(b.inv, item) < this.inputCap(b, item);
  }

  private total(inv: Inv) {
    let n = 0;
    for (const v of Object.values(inv)) n += v ?? 0;
    return n;
  }

  private receive(b: Building, item: ItemId) {
    const def = BUILDINGS[b.type];
    if (def.behaviour === 'market') {
      this.sell(item, 1, b.x + 1, b.y + 1);
      return;
    }
    if (def.behaviour === 'monument') {
      add(this.state.monument, item, 1);
      return;
    }
    add(b.inv, item, 1);
  }

  private sell(item: ItemId, n: number, x: number, y: number) {
    let coins = 0;
    for (let i = 0; i < n; i++) {
      coins += this.priceOf(item);
      const f = this.state.market[item] ?? 1;
      this.state.market[item] = Math.max(MARKET.minFactor, f - MARKET.saturationPerSale);
    }
    this.state.money += coins;
    this.state.stats.earned += coins;
    add(this.state.stats.sold, item, n);
    this.events.push({ t: 'sold', item, coins, x, y });
  }

  // ------------------------------------------------------------ commands

  place(type: BuildingId, x: number, y: number, dir: Dir, species?: SpeciesId): Result {
    const def = BUILDINGS[type];
    if (!this.isUnlocked(type)) return fail('locked');
    const s = def.size;
    if (x < 0 || y < 0 || x + s > this.map.w || y + s > this.map.h) return fail('bounds');
    for (let ty = y; ty < y + s; ty++) for (let tx = x; tx < x + s; tx++) {
      const i = this.idx(tx, ty);
      if (this.grid[i] || this.map.terrain[i] !== Terrain.Grass || this.nestAt(tx, ty)) return fail('blocked');
    }
    if (this.state.money < def.cost) return fail('money');
    let sp: SpeciesId | undefined;
    if (type === 'hive') {
      sp = species && (this.state.queens[species] ?? 0) > 0 ? species : this.bestQueen();
      if (!sp) return fail('queen');
      this.state.queens[sp] = (this.state.queens[sp] ?? 0) - 1;
    }
    this.state.money -= def.cost;
    const b: Building = {
      id: this.state.nextId++, type, x, y, dir, items: [], inv: {}, out: {}, progress: 0, acc: 0, rr: 0, working: false,
      hp: def.hp, hitAt: -99,
    };
    if (sp) b.species = sp;
    if (type === 'breeder') b.parents = ['forest', 'meadow'];
    this.state.buildings.push(b);
    this.rebuild();
    this.events.push({ t: 'built', id: b.id, type });
    return OK;
  }

  remove(x: number, y: number): Result {
    const b = this.at(x, y);
    if (!b) return fail('missing');
    this.state.buildings = this.state.buildings.filter((o) => o !== b);
    this.state.money += Math.floor(BUILDINGS[b.type].cost * REFUND);
    if (b.species) this.state.queens[b.species] = (this.state.queens[b.species] ?? 0) + 1;
    for (const it of b.items) add(this.state.barn, it.item, 1);
    for (const inv of [b.inv, b.out]) for (const [k, v] of Object.entries(inv)) add(this.state.barn, k as ItemId, v ?? 0);
    this.rebuild();
    this.events.push({ t: 'removed', type: b.type, x: b.x, y: b.y });
    return OK;
  }

  rotate(x: number, y: number, dir?: Dir): Result {
    const b = this.at(x, y);
    if (!b) return fail('missing');
    b.dir = dir ?? (((b.dir + 1) % 4) as Dir);
    this.rebuild();
    return OK;
  }

  /** Chop a tree or break a rock. */
  clear(x: number, y: number): Result {
    if (!this.inBounds(x, y)) return fail('bounds');
    const i = this.idx(x, y);
    const t = this.map.terrain[i];
    if (t !== Terrain.Tree && t !== Terrain.Rock) return fail('invalid');
    if (this.state.money < CLEAR_PRICE) return fail('money');
    this.state.money -= CLEAR_PRICE;
    this.map.terrain[i] = Terrain.Grass;
    this.map.flower[i] = -1;
    this.state.cleared.push(i);
    this.rebuild();
    return OK;
  }

  setResearch(tech: TechId | null): Result {
    if (tech && (this.state.techs.includes(tech) || !TECHS[tech].requires.every((r) => this.state.techs.includes(r)))) return fail('locked');
    this.state.research = tech;
    return OK;
  }

  setParents(id: number, a: SpeciesId, b: SpeciesId): Result {
    const br = this.byId.get(id);
    if (!br || br.type !== 'breeder') return fail('missing');
    if (!this.state.discovered.includes(a) || !this.state.discovered.includes(b)) return fail('invalid');
    br.parents = [a, b];
    br.progress = 0;
    return OK;
  }

  setHiveSpecies(id: number, species: SpeciesId): Result {
    const h = this.byId.get(id);
    if (!h || h.type !== 'hive') return fail('missing');
    if (h.species === species) return OK;
    if ((this.state.queens[species] ?? 0) <= 0) return fail('queen');
    this.state.queens[species] = (this.state.queens[species] ?? 0) - 1;
    if (h.species) this.state.queens[h.species] = (this.state.queens[h.species] ?? 0) + 1;
    h.species = species;
    this.rebuild();
    return OK;
  }

  buyQueen(species: SpeciesId): Result {
    if (!WILD_SPECIES.includes(species)) return fail('invalid');
    if (this.state.money < QUEEN_PRICE) return fail('money');
    this.state.money -= QUEEN_PRICE;
    this.state.queens[species] = (this.state.queens[species] ?? 0) + 1;
    return OK;
  }

  sellBarn(item: ItemId): Result {
    const n = count(this.state.barn, item);
    if (n <= 0 || ITEMS[item].price <= 0) return fail('missing');
    this.state.barn[item] = 0;
    this.sell(item, n, this.map.start.x, this.map.start.y);
    return OK;
  }

  // ------------------------------------------------------------ research

  researchNeed(item: ItemId): number {
    const t = this.state.research;
    if (!t) return 0;
    const need = TECHS[t].cost[item] ?? 0;
    const have = this.state.researchProgress[t]?.[item] ?? 0;
    return Math.max(0, need - have);
  }

  researchFraction(t: TechId): number {
    const cost = TECHS[t].cost;
    let need = 0;
    let have = 0;
    for (const [k, v] of Object.entries(cost)) {
      need += v ?? 0;
      have += Math.min(v ?? 0, this.state.researchProgress[t]?.[k as ItemId] ?? 0);
    }
    return need ? have / need : 1;
  }

  // ------------------------------------------------------------ tick

  step() {
    const st = this.state;
    st.time += DT;
    const light = this.light();
    const hiveDay = HIVE.nightFactor + (1 - HIVE.nightFactor) * light;

    for (const b of st.buildings) {
      const beh = BUILDINGS[b.type].behaviour;
      if (beh === 'belt') this.stepBelt(b);
    }
    for (const b of st.buildings) {
      switch (BUILDINGS[b.type].behaviour) {
        case 'hive': this.stepHive(b, hiveDay); break;
        case 'machine': this.stepMachine(b); break;
        case 'store': this.emitAny(b, true); break;
        case 'lab': this.stepLab(b); break;
        case 'breeder': this.stepBreeder(b); break;
        case 'monument': this.stepMonument(); break;
        case 'tower': this.stepTower(b); break;
        default: break;
      }
      // Regeneration after a quiet period.
      const max = BUILDINGS[b.type].hp;
      if (b.hp < max && st.time - b.hitAt > REGEN.delay) b.hp = Math.min(max, b.hp + max * REGEN.perSecond * DT);
    }
    this.stepRaids();
    this.stepEnemies();
    // Market recovery.
    const rec = st.techs.includes('trade') ? MARKET.tradeRecovery : MARKET.recoveryPerSecond;
    for (const k of Object.keys(st.market) as ItemId[]) {
      const f = st.market[k]!;
      st.market[k] = Math.min(1, f + (1 - f) * rec * DT * 3.3);
    }
    if (Math.round(st.time * 10) % 5 === 0) this.checkQuests();
  }

  private stepBelt(b: Building) {
    const items = b.items;
    if (!items.length) return;
    const speed = BUILDINGS[b.type].speed! * DT;
    for (let i = items.length - 1; i >= 0; i--) {
      const max = i === items.length - 1 ? 1 : items[i + 1]!.pos - BELT_GAP;
      items[i]!.pos = Math.max(items[i]!.pos, Math.min(items[i]!.pos + speed, max));
    }
    const front = items[items.length - 1]!;
    if (front.pos < 1) return;
    const next = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
    if (!next) return;
    if (BUILDINGS[next.type].behaviour === 'belt') {
      if (next.dir === (b.dir + 2) % 4) return;
      const entry = next.dir === b.dir || this.beltCurve.get(next.id) ? 0 : 0.5;
      if (this.insertOnBelt(next, front.item, entry)) items.pop();
      return;
    }
    if (this.accepts(next, front.item)) {
      items.pop();
      this.receive(next, front.item);
    }
  }

  private insertOnBelt(belt: Building, item: ItemId, entry: number): boolean {
    for (const it of belt.items) if (Math.abs(it.pos - entry) < BELT_GAP) return false;
    const it = { item, pos: entry };
    const i = belt.items.findIndex((o) => o.pos > entry);
    if (i < 0) belt.items.push(it);
    else belt.items.splice(i, 0, it);
    return true;
  }

  /** Put one `item` on an output belt, preferring belts whose chain ends at a building that wants it. */
  private emit(b: Building, item: ItemId, anyFallback: boolean): boolean {
    const outs = this.outs.get(b.id);
    if (!outs || !outs.length) return false;
    const n = outs.length;
    let fallback: Building | undefined;
    for (let k = 0; k < n; k++) {
      const belt = this.byId.get(outs[(b.rr + k) % n]!)!;
      const term = this.terminalOf(belt.id);
      const free = !belt.items.length || belt.items[0]!.pos >= BELT_GAP;
      if (term && this.wants(term, item)) {
        if (free && this.insertOnBelt(belt, item, 0)) {
          b.rr = (b.rr + k + 1) % n;
          return true;
        }
      } else if (anyFallback && free && !fallback && !term) {
        fallback = belt;
      }
    }
    if (fallback && this.insertOnBelt(fallback, item, 0)) return true;
    return false;
  }

  private emitAny(b: Building, fromInv: boolean) {
    const inv = fromInv ? b.inv : b.out;
    const keys = (Object.keys(inv) as ItemId[]).filter((k) => (inv[k] ?? 0) > 0);
    if (!keys.length) return;
    // Rotate the starting item type so mixed buffers alternate.
    for (let k = 0; k < keys.length; k++) {
      const item = keys[(b.acc + k) % keys.length]!;
      if (this.emit(b, item, fromInv)) {
        inv[item] = (inv[item] ?? 0) - 1;
        b.acc = (b.acc + 1) % 997;
        return;
      }
    }
  }

  private stepHive(b: Building, dayFactor: number) {
    const rate = (this.hiveRate.get(b.id) ?? 0) * dayFactor;
    b.working = rate > 0 && count(b.out, 'comb') < HIVE.buffer;
    if (b.working) {
      b.acc += rate * DT;
      while (b.acc >= 1) {
        b.acc -= 1;
        add(b.out, 'comb', 1);
        add(this.state.stats.produced, 'comb', 1);
        this.state.threat += RAIDS.threatPerComb;
        this.events.push({ t: 'produced', id: b.id, item: 'comb' });
        const sp = SPECIES[b.species ?? 'forest'];
        for (const [item, chance] of Object.entries(sp.specials)) {
          if (nextRandom(this.state) < (chance ?? 0)) {
            add(this.state.barn, item as ItemId, 1);
            add(this.state.stats.produced, item as ItemId, 1);
          }
        }
      }
    } else {
      b.acc = Math.min(b.acc, 0.99);
    }
    if (count(b.out, 'comb') > 0 && this.emit(b, 'comb', false)) add(b.out, 'comb', -1);
  }

  private stepMachine(b: Building) {
    const r = BUILDINGS[b.type].recipe!;
    const hasInputs = Object.entries(r.inputs).every(([k, v]) => count(b.inv, k as ItemId) >= (v ?? 0));
    const outFull = Object.keys(r.outputs).every((k) => count(b.out, k as ItemId) >= MACHINE_OUTPUT_CAP);
    b.working = hasInputs && !outFull;
    if (b.working) {
      b.progress += DT * this.machineSpeed();
      if (b.progress >= r.seconds) {
        b.progress = 0;
        for (const [k, v] of Object.entries(r.inputs)) add(b.inv, k as ItemId, -(v ?? 0));
        for (const [k, v] of Object.entries(r.outputs)) {
          const item = k as ItemId;
          b.out[item] = Math.min(MACHINE_OUTPUT_CAP, count(b.out, item) + (v ?? 0));
          add(this.state.stats.produced, item, v ?? 0);
          this.events.push({ t: 'produced', id: b.id, item });
        }
      }
    }
    this.emitAny(b, false);
  }

  private stepLab(b: Building) {
    const t = this.state.research;
    b.working = false;
    if (!t) return;
    // Rare items come straight from the barn.
    for (const [k, v] of Object.entries(TECHS[t].cost)) {
      const item = k as ItemId;
      if (!v) continue;
      if ((item === 'propolis' || item === 'jelly' || item === 'pollen') && count(b.inv, item) < 1 && this.researchNeed(item) > count(b.inv, item) && count(this.state.barn, item) > 0) {
        add(this.state.barn, item, -1);
        add(b.inv, item, 1);
      }
    }
    const item = (Object.keys(b.inv) as ItemId[]).find((k) => count(b.inv, k) > 0 && this.researchNeed(k) > 0);
    if (!item) return;
    b.working = true;
    b.progress += DT * this.machineSpeed();
    if (b.progress < LAB_SECONDS_PER_ITEM) return;
    b.progress = 0;
    add(b.inv, item, -1);
    const prog = (this.state.researchProgress[t] ??= {});
    add(prog, item, 1);
    if (TECH_IDS.includes(t) && Object.entries(TECHS[t].cost).every(([k, v]) => (prog[k as ItemId] ?? 0) >= (v ?? 0))) {
      this.state.techs.push(t);
      this.state.research = null;
      // Labs return leftovers to the barn.
      for (const lab of this.state.buildings) {
        if (lab.type !== 'lab') continue;
        for (const [k, v] of Object.entries(lab.inv)) add(this.state.barn, k as ItemId, v ?? 0);
        lab.inv = {};
      }
      this.rebuild();
      this.events.push({ t: 'tech', tech: t });
    }
  }

  /** Rare bee products go to the Great Hive straight from the barn. */
  private stepMonument() {
    for (const item of ['propolis', 'jelly'] as ItemId[]) {
      if (count(this.state.barn, item) > 0 && count(this.state.monument, item) < (MONUMENT_NEEDS[item] ?? 0)) {
        add(this.state.barn, item, -1);
        add(this.state.monument, item, 1);
      }
    }
  }

  /** Chance table for a pair: list of [species, probability]. Remainder = one of the parents. */
  breedOdds(a: SpeciesId, b: SpeciesId, pollen: number): [SpeciesId, number][] {
    const boost = 1 + BREED.pollenBoost * Math.min(pollen, BREED.pollenMax);
    const res: [SpeciesId, number][] = [];
    let left = 1;
    for (const m of MUTATIONS) {
      if ((m.a === a && m.b === b) || (m.a === b && m.b === a)) {
        const p = Math.min(0.95, m.chance * boost) * left;
        res.push([m.result, p]);
        left -= p;
      }
    }
    if (a === b) res.push([a, left]);
    else res.push([a, left / 2], [b, left / 2]);
    return res;
  }

  private stepBreeder(b: Building) {
    if (count(b.inv, 'pollen') < BREED.pollenMax && count(this.state.barn, 'pollen') > 0) {
      add(this.state.barn, 'pollen', -1);
      add(b.inv, 'pollen', 1);
    }
    b.working = count(b.inv, 'honey') >= BREED.honeyPerCycle;
    if (!b.working) return;
    b.progress += DT;
    if (b.progress < BREED.seconds) return;
    b.progress = 0;
    const [pa, pb] = b.parents ?? ['forest', 'meadow'];
    const pollen = count(b.inv, 'pollen');
    add(b.inv, 'honey', -BREED.honeyPerCycle);
    b.inv.pollen = 0;
    const odds = this.breedOdds(pa, pb, pollen);
    let roll = nextRandom(this.state);
    let result: SpeciesId = pa;
    for (const [s, p] of odds) {
      if (roll < p) { result = s; break; }
      roll -= p;
    }
    this.state.queens[result] = (this.state.queens[result] ?? 0) + 1;
    const isNew = !this.state.discovered.includes(result);
    if (isNew) this.state.discovered.push(result);
    if (result !== pa && result !== pb) this.events.push({ t: 'mutation', species: result, isNew, x: b.x + 1, y: b.y + 1 });
    else this.events.push({ t: 'queen', species: result, x: b.x + 1, y: b.y + 1 });
  }

  // ------------------------------------------------------------ combat

  private stepTower(t: Building) {
    if (count(t.inv, 'wax') < 1 && count(this.state.barn, 'wax') > 0) {
      add(this.state.barn, 'wax', -1);
      add(t.inv, 'wax', 1);
    }
    t.working = false;
    const hasAmmo = count(t.inv, 'wax') > 0 || t.acc > 0;
    if (!hasAmmo) return;
    const cx = t.x + 1;
    const cy = t.y + 1;
    let best: Enemy | undefined;
    let bd = SMOKER.range;
    for (const e of this.state.enemies) {
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d <= bd) { bd = d; best = e; }
    }
    let nest: Nest | undefined;
    if (!best) {
      for (const n of this.state.nests ?? []) {
        if (n.hp > 0 && Math.hypot(n.x + 1 - cx, n.y + 1 - cy) <= SMOKER.range + 1) { nest = n; break; }
      }
    }
    if (!best && !nest) return;
    t.working = true;
    // Wax is burned continuously while shooting: acc holds remaining seconds of the current lump.
    if (t.acc <= 0) {
      add(t.inv, 'wax', -1);
      t.acc = SMOKER.secondsPerWax;
    }
    t.acc -= DT;
    const dmg = SMOKER.dps * DT;
    if (best) {
      best.hp -= dmg;
      if (Math.round(this.state.time * 10) % 4 === 0) this.events.push({ t: 'shot', from: t.id, x: best.x, y: best.y });
      if (best.hp <= 0) this.kill(best);
    } else if (nest) {
      nest.hp -= dmg;
      if (Math.round(this.state.time * 10) % 4 === 0) this.events.push({ t: 'shot', from: t.id, x: nest.x + 1, y: nest.y + 1 });
      if (nest.hp <= 0) {
        this.state.money += NEST.reward;
        this.state.stats.earned += NEST.reward;
        this.state.stats.nests++;
        this.events.push({ t: 'nest', x: nest.x + 1, y: nest.y + 1, coins: NEST.reward });
      }
    }
  }

  private kill(e: Enemy) {
    const def = ENEMIES[e.kind];
    this.state.enemies = this.state.enemies.filter((o) => o !== e);
    this.state.money += def.reward;
    this.state.stats.killed++;
    this.events.push({ t: 'killed', kind: e.kind, x: e.x, y: e.y, coins: def.reward });
  }

  /** Raid sizes grow with threat (comb produced), like pollution-driven attacks in Factorio. */
  raidSize(kind: EnemyKind): number {
    const th = this.state.threat;
    if (kind === 'bear') return Math.min(RAIDS.maxBears, 1 + Math.floor(th / 40));
    const alive = (this.state.nests ?? []).filter((n) => n.hp > 0).length;
    if (!alive) return 0;
    return Math.min(RAIDS.maxHornets, 2 + Math.floor(th / 18));
  }

  /** Seconds until the next raid of each kind (for the HUD warning). */
  nextRaidIn(kind: EnemyKind): number {
    const st = this.state;
    const phase = kind === 'bear' ? RAIDS.bearPhase : RAIDS.hornetPhase;
    const day = this.day();
    const firstDay = RAIDS.firstDay + (kind === 'hornet' ? 1 : 0);
    let d = Math.max(day, firstDay);
    let t = (d - 1 + phase) * DAY_SECONDS;
    if (t <= st.time || st.raided[kind] >= d) { d = Math.max(d + 1, st.raided[kind] + 1); t = (d - 1 + phase) * DAY_SECONDS; }
    return t - st.time;
  }

  private stepRaids() {
    const st = this.state;
    if (st.peaceful || !st.buildings.some((b) => b.type === 'hive')) return;
    const day = this.day();
    const phase = (st.time % DAY_SECONDS) / DAY_SECONDS;
    if (day >= RAIDS.firstDay && st.raided.bear < day && phase >= RAIDS.bearPhase) {
      st.raided.bear = day;
      const n = this.raidSize('bear');
      // Bears come out of the forest edge from a random side.
      const side = Math.floor(nextRandom(st) * 4);
      let ax = 0;
      let ay = 0;
      for (let i = 0; i < n; i++) {
        const r = nextRandom(st);
        const x = side === 0 ? 1 : side === 1 ? this.map.w - 2 : 4 + r * (this.map.w - 8);
        const y = side === 2 ? 1 : side === 3 ? this.map.h - 2 : 4 + r * (this.map.h - 8);
        this.spawn('bear', x, y);
        ax += x;
        ay += y;
      }
      this.events.push({ t: 'raid', kind: 'bear', count: n, x: ax / n, y: ay / n });
    }
    if (day >= RAIDS.firstDay + 1 && st.raided.hornet < day && phase >= RAIDS.hornetPhase && phase < RAIDS.bearPhase) {
      st.raided.hornet = day;
      const n = this.raidSize('hornet');
      const nests = (st.nests ?? []).filter((x) => x.hp > 0);
      if (n && nests.length) {
        const nest = nests[Math.floor(nextRandom(st) * nests.length)]!;
        for (let i = 0; i < n; i++) this.spawn('hornet', nest.x + 1 + (nextRandom(st) - 0.5) * 2, nest.y + 1 + (nextRandom(st) - 0.5) * 2);
        this.events.push({ t: 'raid', kind: 'hornet', count: n, x: nest.x + 1, y: nest.y + 1 });
      }
    }
  }

  private spawn(kind: EnemyKind, x: number, y: number) {
    this.state.enemies.push({ id: this.state.nextId++, kind, x, y, hp: ENEMIES[kind].hp, target: 0, flee: false, biting: 0 });
  }

  private nearestTarget(e: Enemy): Building | undefined {
    // Both enemies love honey: hives first, anything else if no hives.
    let best: Building | undefined;
    let bd = Infinity;
    for (const pass of [true, false]) {
      if (!pass && e.kind === 'bear') break; // bears only want honey
      for (const b of this.state.buildings) {
        if (pass && b.type !== 'hive') continue;
        if (!pass && (BUILDINGS[b.type].behaviour === 'belt' || BUILDINGS[b.type].behaviour === 'wall')) continue;
        const s = BUILDINGS[b.type].size;
        const d = Math.hypot(b.x + s / 2 - e.x, b.y + s / 2 - e.y);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) return best;
    }
    return undefined;
  }

  private damage(b: Building, dmg: number) {
    b.hp -= dmg;
    b.hitAt = this.state.time;
    if (Math.round(this.state.time * 10) % 5 === 0) this.events.push({ t: 'hit', id: b.id });
    if (b.hp > 0) return;
    this.state.buildings = this.state.buildings.filter((o) => o !== b);
    if (b.species) this.state.queens[b.species] = (this.state.queens[b.species] ?? 0) + 1; // the queen escapes
    this.state.stats.lost++;
    this.rebuild();
    this.events.push({ t: 'destroyed', type: b.type, x: b.x, y: b.y });
  }

  private stepEnemies() {
    const st = this.state;
    for (const e of [...st.enemies]) {
      const def = ENEMIES[e.kind];
      if (e.flee) {
        // Run to the nearest edge, then vanish.
        const ex = e.x < this.map.w / 2 ? -1 : this.map.w + 1;
        const ey = e.y < this.map.h / 2 ? -1 : this.map.h + 1;
        const toX = Math.abs(ex - e.x) < Math.abs(ey - e.y);
        e.x += toX ? Math.sign(ex - e.x) * def.speed * 1.4 * DT : 0;
        e.y += toX ? 0 : Math.sign(ey - e.y) * def.speed * 1.4 * DT;
        if (e.x < -0.5 || e.y < -0.5 || e.x > this.map.w + 0.5 || e.y > this.map.h + 0.5) st.enemies = st.enemies.filter((o) => o !== e);
        continue;
      }
      let target = this.byId.get(e.target);
      if (!target && e.target) { e.flee = true; continue; } // target destroyed: fed, go home
      if (!target) {
        target = this.nearestTarget(e);
        if (!target) { e.flee = true; continue; }
        e.target = target.id;
      }
      const s = BUILDINGS[target.type].size;
      const tx = target.x + s / 2;
      const ty = target.y + s / 2;
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      const reach = s / 2 + 0.45;
      if (d <= reach) {
        e.biting = target.id;
        this.damage(target, def.dps * DT);
        // A bear that empties a hive of comb runs away happy.
        if (target.type === 'hive' && e.kind === 'bear' && (target.out.comb ?? 0) > 0 && nextRandom(st) < 0.01) {
          target.out.comb = 0;
          e.flee = true;
        }
        continue;
      }
      const step = def.speed * DT;
      const nx = e.x + (dx / d) * step;
      const ny = e.y + (dy / d) * step;
      if (!def.flying) {
        const block = this.at(Math.floor(nx), Math.floor(ny));
        if (block && block.id !== target.id && BUILDINGS[block.type].behaviour !== 'belt') {
          e.biting = block.id;
          this.damage(block, def.dps * DT);
          continue;
        }
      }
      e.biting = 0;
      e.x = nx;
      e.y = ny;
    }
  }

  // ------------------------------------------------------------ quests

  questProgress(i: number): [number, number] {
    const q = QUESTS[i];
    if (!q) return [1, 1];
    const c = q.check;
    const st = this.state;
    switch (c.kind) {
      case 'build': return [st.buildings.filter((b) => b.type === c.building).length, c.count];
      case 'produced': return [count(st.stats.produced, c.item), c.count];
      case 'sold': return [count(st.stats.sold, c.item), c.count];
      case 'money': return [Math.floor(st.money), c.count];
      case 'earned': return [Math.floor(st.stats.earned), c.count];
      case 'tech': return [st.techs.includes(c.tech) ? 1 : 0, 1];
      case 'species': return [st.discovered.includes(c.species) ? 1 : 0, 1];
      case 'nests': return [st.stats.nests, c.count];
      case 'monument': {
        let need = 0;
        let have = 0;
        for (const [k, v] of Object.entries(MONUMENT_NEEDS)) {
          need += v ?? 0;
          have += Math.min(v ?? 0, count(st.monument, k as ItemId));
        }
        return [have, need];
      }
    }
  }

  private checkQuests() {
    const st = this.state;
    while (st.quest < QUESTS.length) {
      // Peaceful mode has no enemies: skip the defence quests.
      const c = QUESTS[st.quest]!.check;
      if (st.peaceful && (c.kind === 'nests' || (c.kind === 'build' && c.building === 'smoker'))) { st.quest++; continue; }
      const [have, need] = this.questProgress(st.quest);
      if (have < need) break;
      const reward = QUESTS[st.quest]!.reward;
      st.money += reward;
      this.events.push({ t: 'quest', index: st.quest, reward });
      st.quest++;
      if (st.quest === QUESTS.length && !st.won) {
        st.won = true;
        st.wonAt = st.time;
        this.events.push({ t: 'won' });
      }
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  allItems(): readonly ItemId[] { return ITEM_IDS; }
}
