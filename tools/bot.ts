/**
 * Scripted player for balance runs. Plays only through the public Game API (place, research, breeding...).
 * Strategy: every product line is one straight "row" that ends in a sink (market, lab, breeder, monument):
 *   hive -> belt -> extractor -> belt -> [packer | chandlery | brewery] -> belt -> sink
 * with a wax-fed smoker next to the extractor (and a well next to the brewery).
 */
import { BUILDINGS, DAY_SECONDS, SMOKER, SPECIES, SPECIES_IDS, TECHS, type BuildingId, type SpeciesId, type TechId } from '../src/core/data';
import { Terrain } from '../src/core/map';
import { DX, DY, Game, newGame, type Dir } from '../src/core/sim';

export type RowKind = 'jar' | 'candle' | 'mead' | 'honey';
const MACHINE: Record<RowKind, BuildingId | null> = { jar: 'packer', candle: 'chandlery', mead: 'brewery', honey: null };

interface Spec { type: BuildingId; x: number; y: number; dir: Dir }
interface Sink { type: BuildingId; x: number; y: number; size: number; used: Set<number> }
interface Row { specs: Spec[]; rate: number; out: number }

export interface BotOptions { defend: boolean; lazy: boolean }

const RESEARCH_ORDER: TechId[] = ['chandlery', 'breeding', 'brewing', 'colonies', 'greathive', 'trade', 'mechanics', 'feeding', 'belt2', 'belt3'];
const MIN_RATE = 0.12;

export class Bot {
  plan: Spec[] = [];
  reserved = new Set<number>();
  sinks: Sink[] = [];
  done = new Set<string>();
  notes: string[] = [];

  constructor(readonly g: Game, readonly opts: BotOptions = { defend: true, lazy: false }) {}

  private free(x: number, y: number) {
    const g = this.g;
    return g.inBounds(x, y) && g.map.terrain[g.idx(x, y)] === Terrain.Grass && !g.at(x, y) && !g.nestAt(x, y) && !this.reserved.has(g.idx(x, y));
  }

  private fits(specs: Spec[]) {
    for (const s of specs) {
      const n = BUILDINGS[s.type].size;
      for (let y = s.y; y < s.y + n; y++) for (let x = s.x; x < s.x + n; x++) if (!this.free(x, y)) return false;
    }
    return true;
  }

  private commit(specs: Spec[]) {
    for (const s of specs) {
      const n = BUILDINGS[s.type].size;
      for (let y = s.y; y < s.y + n; y++) for (let x = s.x; x < s.x + n; x++) this.reserved.add(this.g.idx(x, y));
      this.plan.push(s);
    }
  }

  /** Specs of a row leaving `sink` through side `out` at side offset `o`. */
  private rowSpecs(sink: Sink, out: Dir, o: number, flip: boolean, kind: RowKind): Spec[] {
    const pd = ((out + (flip ? 3 : 1)) % 4) as Dir;
    const back = ((out + 2) % 4) as Dir;
    const A = out === 0 ? [sink.x + sink.size, sink.y + o] : out === 1 ? [sink.x + o, sink.y + sink.size] : out === 2 ? [sink.x - 1, sink.y + o] : [sink.x + o, sink.y - 1];
    const T = (k: number, q: number) => [A[0]! + DX[out] * (k - 1) + DX[pd] * q, A[1]! + DY[out] * (k - 1) + DY[pd] * q] as const;
    const belt = (k: number, q: number, dir: Dir): Spec => ({ type: 'belt', x: T(k, q)[0], y: T(k, q)[1], dir });
    const box = (type: BuildingId, k: number, q: number): Spec => {
      const pts = [T(k, q), T(k + 1, q), T(k, q + 1), T(k + 1, q + 1)];
      return { type, x: Math.min(...pts.map((p) => p[0])), y: Math.min(...pts.map((p) => p[1])), dir: 0 };
    };
    const m = MACHINE[kind];
    const kE = m ? 5 : 2;
    const specs: Spec[] = [box('hive', kE + 3, 0), belt(kE + 2, 0, back), box('extractor', kE, 0)];
    if (m) specs.push(belt(4, 0, back), box(m, 2, 0));
    specs.push(belt(1, 0, back));
    if (kind === 'mead') specs.push(box('well', 2, -3), belt(2, -1, pd));
    if (this.opts.defend) specs.push(belt(kE, 2, pd), box('smoker', kE, 3));
    return specs;
  }

  private bestRow(sink: Sink, kind: RowKind): Row | null {
    let best: Row | null = null;
    const sp = this.g.bestQueen() ?? 'meadow';
    for (const out of [0, 1, 2, 3] as Dir[]) {
      if (sink.used.has(out)) continue;
      for (let o = 0; o < sink.size; o++) for (const flip of [false, true]) {
        const specs = this.rowSpecs(sink, out, o, flip, kind);
        if (!this.fits(specs)) continue;
        const hive = specs[0]!;
        const rate = this.g.estimateHive(hive.x, hive.y, sp);
        if (!best || rate > best.rate) best = { specs, rate, out };
      }
    }
    return best;
  }

  private addRow(sink: Sink, kind: RowKind): boolean {
    const r = this.bestRow(sink, kind);
    if (!r || r.rate < MIN_RATE) return false;
    this.commit(r.specs);
    sink.used.add(r.out);
    return true;
  }

  /** Best place for a new sink that can take `rows` rows of the given kinds. */
  private newSink(type: BuildingId, kinds: RowKind[]): Sink | null {
    const g = this.g;
    const size = BUILDINGS[type].size;
    const s = g.map.start;
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = 2; y < g.h - 2 - size; y += 2) for (let x = 2; x < g.w - 2 - size; x += 2) {
      const spec: Spec = { type, x, y, dir: 0 };
      if (!this.fits([spec])) continue;
      const sink: Sink = { type, x, y, size, used: new Set() };
      // Reserve the sink footprint while probing rows.
      const tiles: number[] = [];
      for (let ty = y; ty < y + size; ty++) for (let tx = x; tx < x + size; tx++) tiles.push(g.idx(tx, ty));
      tiles.forEach((t) => this.reserved.add(t));
      let score = 0;
      let ok = true;
      for (const kind of kinds) {
        const r = this.bestRow(sink, kind);
        if (!r || r.rate < MIN_RATE) { ok = false; break; }
        sink.used.add(r.out);
        score += Math.min(r.rate, 0.5);
      }
      tiles.forEach((t) => this.reserved.delete(t));
      if (!ok) continue;
      score -= Math.hypot(x - s.x, y - s.y) * 0.004;
      if (!best || score > best.score) best = { x, y, score };
    }
    if (!best) return null;
    const sink: Sink = { type, x: best.x, y: best.y, size, used: new Set() };
    this.commit([{ type, x: best.x, y: best.y, dir: 0 }]);
    this.sinks.push(sink);
    return sink;
  }

  /** Add a row of `kind` feeding some sink of `type`; builds another sink when the existing ones have no good side. */
  private feed(type: BuildingId, kind: RowKind): boolean {
    for (const s of this.sinks) if (s.type === type && this.addRow(s, kind)) return true;
    if (type === 'monument' && this.sinks.some((s) => s.type === 'monument')) return false;
    const sink = this.newSink(type, [kind]);
    return !!sink && this.addRow(sink, kind);
  }

  private nestAttack() {
    const g = this.g;
    const s = g.map.start;
    const nests = (g.state.nests ?? []).filter((n) => n.hp > 0).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    for (const n of nests) {
      const spots: Spec[] = [];
      for (let y = n.y - 6; y <= n.y + 6 && spots.length < 2; y++) for (let x = n.x - 6; x <= n.x + 6 && spots.length < 2; x++) {
        const d = Math.hypot(x + 1 - (n.x + 1), y + 1 - (n.y + 1));
        if (d < 2.5 || d > SMOKER.range) continue;
        const spec: Spec = { type: 'smoker', x, y, dir: 0 };
        if (spots.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2)) continue;
        if (this.fits([spec])) spots.push(spec);
      }
      if (spots.length) { this.commit(spots); return true; }
    }
    return false;
  }

  private goal(id: string, when: boolean, run: () => boolean) {
    if (this.done.has(id) || !when) return false;
    this.done.add(id);
    if (!run()) this.notes.push(`goal ${id}: no place found`);
    return true;
  }

  private planComplete() {
    return this.plan.every((s) => { const b = this.g.at(s.x, s.y); return !!b && (b.type === s.type || (s.type === 'belt' && BUILDINGS[b.type].behaviour === 'belt')); });
  }

  tick() {
    const g = this.g;
    const st = g.state;

    // 1. Build or rebuild everything in the plan, in order, while money lasts.
    const beltTier: BuildingId = g.isUnlocked('belt3') ? 'belt3' : g.isUnlocked('belt2') ? 'belt2' : 'belt';
    for (const s of this.plan) {
      const b = g.at(s.x, s.y);
      if (s.type === 'belt' || s.type === 'belt2' || s.type === 'belt3') {
        // Upgrade belts as soon as faster ones are researched.
        if (b && b.type !== beltTier && st.money > BUILDINGS[beltTier].cost + 200) { g.remove(s.x, s.y); g.place(beltTier, s.x, s.y, s.dir); }
        if (!b && st.money >= BUILDINGS[beltTier].cost) g.place(beltTier, s.x, s.y, s.dir);
        continue;
      }
      if (b) continue;
      if (!g.isUnlocked(s.type)) continue;
      const needQueen = s.type === 'hive' && !g.bestQueen();
      if (st.money < BUILDINGS[s.type].cost + (needQueen ? 30 : 0)) break;
      if (needQueen) g.buyQueen('meadow');
      g.place(s.type, s.x, s.y, s.dir);
    }

    // 2. Research.
    if (!st.research && !this.opts.lazy) {
      const next = RESEARCH_ORDER.find((t) => !st.techs.includes(t) && TECHS[t].requires.every((r) => st.techs.includes(r)));
      if (next) g.setResearch(next);
    }

    // 3. Bees: best queens into hives, steer the breeder up the mutation tree.
    for (const h of st.buildings) {
      if (h.type !== 'hive') continue;
      const best = g.bestQueen();
      if (best && SPECIES[best].tier > SPECIES[h.species ?? 'forest'].tier) g.setHiveSpecies(h.id, best);
    }
    const d = new Set(st.discovered);
    const hives = st.buildings.filter((b) => b.type === 'hive');
    const allTop = hives.every((h) => SPECIES[h.species ?? 'forest'].tier >= 4);
    const pair: [SpeciesId, SpeciesId] = !d.has('common') ? ['forest', 'meadow']
      : !d.has('cultivated') ? ['common', 'forest']
        : !d.has('noble') ? ['common', 'cultivated']
          : !d.has('imperial') ? ['cultivated', 'noble']
            : !allTop ? ['imperial', 'imperial'] : ['noble', 'imperial'];
    for (const b of st.buildings) {
      if (b.type === 'breeder' && (b.parents?.[0] !== pair[0] || b.parents?.[1] !== pair[1])) g.setParents(b.id, pair[0], pair[1]);
    }

    // 4. Next goal, one at a time, only when the previous one is fully built.
    if (!this.planComplete()) return;
    const t = (id: TechId) => st.techs.includes(id);
    const G = (id: string, when: boolean, run: () => boolean) => this.goal(id, when, run);
    if (G('market jar', true, () => this.feed('market', 'jar'))) return;
    if (this.opts.lazy) return;
    if (G('lab jar', true, () => this.feed('lab', 'jar'))) return;
    if (G('market jar 2', true, () => this.feed('market', 'jar'))) return;
    if (G('lab candle', t('chandlery'), () => this.feed('lab', 'candle'))) return;
    if (G('market candle', t('chandlery'), () => this.feed('market', 'candle'))) return;
    if (G('breeder', t('breeding'), () => this.feed('breeder', 'honey'))) return;
    if (G('lab mead', t('brewing'), () => this.feed('lab', 'mead'))) return;
    if (G('market mead', t('brewing'), () => this.feed('market', 'mead'))) return;
    if (G('nest', this.opts.defend && d.has('common'), () => this.nestAttack())) return;
    if (G('monument', t('greathive'), () => {
      const sink = this.newSink('monument', ['jar', 'candle', 'mead']);
      if (!sink) return false;
      for (const k of ['jar', 'candle', 'mead', 'candle'] as RowKind[]) this.addRow(sink, k);
      return true;
    })) return;
  }
}

export interface Run {
  seed: number;
  won: boolean;
  minutes: number;
  days: number;
  quest: number;
  marks: Record<string, number>;
  lost: number;
  killed: number;
  hives: number;
  buildings: number;
  money: number;
  notes: string[];
}

export function play(seed: number, maxDays = 30, opts: BotOptions = { defend: true, lazy: false }, peaceful = false, mode: 'short' | 'full' = 'full'): Run {
  const g = new Game(newGame(seed, peaceful, mode));
  const bot = new Bot(g, opts);
  const marks: Record<string, number> = {};
  const mark = (k: string) => { if (!(k in marks)) marks[k] = +((g.state.time - DAY_SECONDS * 0.08) / 60).toFixed(1); };
  let i = 0;
  while (!g.state.won && g.state.time < maxDays * DAY_SECONDS) {
    if (i++ % 10 === 0) bot.tick();
    g.step();
    for (const e of g.drainEvents()) {
      if (e.t === 'tech') mark(`tech ${e.tech}`);
      if (e.t === 'mutation' && e.isNew) mark(`bee ${e.species}`);
      if (e.t === 'quest') mark(`quest ${e.index + 1}`);
      if (e.t === 'nest') mark('nest');
      if (e.t === 'built' && e.type === 'monument') mark('monument');
      if (e.t === 'destroyed') mark('first loss');
    }
  }
  const st = g.state;
  return {
    seed, won: st.won, minutes: +((st.time - DAY_SECONDS * 0.08) / 60).toFixed(1), days: g.day(), quest: st.quest, marks,
    lost: st.stats.lost, killed: st.stats.killed, hives: st.buildings.filter((b) => b.type === 'hive').length,
    buildings: st.buildings.length, money: Math.round(st.money), notes: bot.notes,
  };
}

export { SPECIES_IDS };
