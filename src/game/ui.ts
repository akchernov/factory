import {
  BREED, BUILDINGS, HOTBAR, ITEMS, MONUMENT_NEEDS, MUTATIONS, QUESTS, SPECIES, SPECIES_IDS, TECHS, TECH_IDS, WILD_SPECIES,
  DAY_SECONDS, type BuildingId, type ItemId, type SpeciesId, type TechId,
} from '../core/data';
import { FAIL_TEXT, QUEEN_PRICE, type GameEvent } from '../core/sim';
import { audio } from './audio';
import { ctl, type UiEvent } from './controller';

const base = import.meta.env.BASE_URL;
const icon = (k: string, cls = 'ic') => `<img class="${cls}" src="${base}assets/${k}.webp" alt="" draggable="false">`;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.floor(n).toLocaleString('ru-RU'));

function buildingIcon(t: BuildingId) {
  if (t === 'belt' || t === 'belt2' || t === 'belt3') {
    const color = t === 'belt' ? '#e8b23a' : t === 'belt2' ? '#ff5d4a' : '#5ad0ff';
    return `<span class="belt-ic" style="--c:${color}"><i></i><i></i></span>`;
  }
  if (t === 'splitter') return `<span class="belt-ic split" style="--c:#e8b23a"><i></i><b>⑂</b></span>`;
  return icon(BUILDINGS[t].sprite, 'bic');
}

export interface Ui {
  update(): void;
}

export function createUi(onNewGame: () => void, onContinue: () => void, focus: (x: number, y: number) => void): Ui {
  const root = $('#ui');
  root.innerHTML = `
    <div id="topbar">
      <div class="brand">${icon('i_bee', 'ic lg')}<b>Bee&nbsp;Factory</b></div>
      <div class="chip money" title="Монеты">${icon('i_coin')}<b id="money">0</b><span id="income" class="sub"></span></div>
      <div class="chip clock" title="День и время"><span id="sun">☀</span><b id="day">День 1</b><span id="clock" class="sub"></span></div>
      <div class="chip queens" id="queensChip" title="Свободные матки (B)">${icon('i_bee')}<b id="queens">0</b><span class="sub">маток</span></div>
      <div class="chip barn" id="barnChip" title="Сарай: сюда падают продукты при сносе и редкие продукты пчёл"></div>
      <div class="spacer"></div>
      <button class="tb" id="btnTech" title="Технологии (T)">${icon('i_research')}<span>Наука</span><kbd>T</kbd></button>
      <button class="tb" id="btnBees" title="Пчёлы и селекция (B)">${icon('i_bee')}<span>Пчёлы</span><kbd>B</kbd></button>
      <div class="speed" id="speed">
        <button data-s="0" title="Пауза (Space)">❚❚</button><button data-s="1" class="on">▶</button><button data-s="2">▶▶</button><button data-s="4">▶▶▶</button>
      </div>
      <button class="tb icon" id="btnMute" title="Звук (M)">🔊</button>
      <button class="tb icon" id="btnMenu" title="Меню (Esc)">☰</button>
    </div>

    <div id="quest" class="panel">
      <div class="q-head"><span class="q-tag">ЗАДАНИЕ <b id="qnum"></b></span><span id="qreward" class="q-reward"></span></div>
      <h3 id="qtitle"></h3>
      <p id="qtext"></p>
      <div class="bar"><i id="qbar"></i></div>
      <div class="q-prog" id="qprog"></div>
    </div>

    <div id="research" class="panel small" title="Текущее исследование (T)">
      <div class="r-row">${icon('i_research')}<div><b id="rname">Нет исследования</b><div class="bar thin"><i id="rbar"></i></div><div id="rneed" class="sub"></div></div></div>
    </div>

    <div id="inspector" class="panel hidden"></div>

    <div id="hotbar">
      <div id="tooltip" class="panel hidden"></div>
      <div id="slots"></div>
      <div class="hint" id="hint">ЛКМ ставить · тяни конвейер мышью · R повернуть · ПКМ снести · колесо зум · WASD камера</div>
    </div>

    <div id="toasts"></div>
    <div id="modal" class="hidden"><div class="box" id="modalBox"></div></div>

    <div id="title">
      <div class="title-bg" style="background-image:url(${base}assets/keyart.webp)"></div>
      <div class="title-shade"></div>
      <div class="title-card">
        <div class="logo">${icon('i_bee', 'logo-bee')}<h1>Bee Factory</h1></div>
        <p class="tagline">Построй медовую империю: ульи, конвейеры, станки, наука и селекция пчёл.</p>
        <div class="title-btns">
          <button class="big primary" id="btnContinue">Продолжить</button>
          <button class="big" id="btnNew">Новая игра</button>
        </div>
        <ul class="features">
          <li>${icon('i_comb')} Автоматизируй цепочки: соты, мёд, воск, свечи, медовуха</li>
          <li>${icon('i_bee')} Скрещивай пчёл и выводи 8 видов, от Лесной до Золотой</li>
          <li>${icon('i_research')} 10 технологий, смена дня и ночи, живой рынок</li>
          <li>${icon('b_monument', 'ic')} Финал: построй и наполни Великий улей</li>
        </ul>
      </div>
    </div>
  `;

  // ------------------------------------------------------------ hotbar
  const slots = $('#slots');
  slots.innerHTML = HOTBAR.map((t) => `
    <button class="slot" data-t="${t}">
      ${buildingIcon(t)}
      <kbd>${BUILDINGS[t].hotkey}</kbd>
      <span class="cost">${BUILDINGS[t].cost}</span>
      <span class="lock">🔒</span>
    </button>`).join('');
  const tooltip = $('#tooltip');
  slots.querySelectorAll<HTMLButtonElement>('.slot').forEach((el) => {
    const t = el.dataset.t as BuildingId;
    el.addEventListener('click', () => pickTool(t));
    el.addEventListener('mouseenter', () => {
      const d = BUILDINGS[t];
      const r = d.recipe;
      const recipe = r ? `<div class="recipe">${Object.entries(r.inputs).map(([k, v]) => `${v}${icon(ITEMS[k as ItemId].icon)}`).join(' + ') || '—'} <span>→</span> ${Object.entries(r.outputs).map(([k, v]) => `${v}${icon(ITEMS[k as ItemId].icon)}`).join(' + ')} <span class="sub">${r.seconds}с</span></div>` : '';
      const lock = !ctl.game.isUnlocked(t) ? `<div class="locked">🔒 ${unlockText(t)}</div>` : '';
      tooltip.innerHTML = `<b>${d.name}</b> <span class="sub">${d.size}×${d.size} · ${d.cost} 🪙</span>${recipe}<p>${d.hint}</p>${lock}`;
      tooltip.classList.remove('hidden');
      const rect = el.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 330, rect.left + rect.width / 2 - 160))}px`;
    });
    el.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
  });

  function unlockText(t: BuildingId) {
    const tech = TECH_IDS.find((x) => TECHS[x].unlocks.includes(t));
    return tech ? `Исследуй «${TECHS[tech].name}»` : '';
  }

  function pickTool(t: BuildingId | null) {
    if (t && !ctl.game.isUnlocked(t)) {
      audio.error();
      ctl.toast(`${BUILDINGS[t].name}: ${unlockText(t)}`, 'error');
      return;
    }
    audio.click();
    ctl.setTool(ctl.tool === t ? null : t);
  }

  // ------------------------------------------------------------ top buttons
  $('#btnTech').onclick = () => openTech();
  $('#btnBees').onclick = () => openBees();
  $('#queensChip').onclick = () => openBees();
  $('#btnMute').onclick = () => { audio.setMuted(!audio.isMuted()); syncMute(); };
  $('#btnMenu').onclick = () => openMenu();
  $('#research').onclick = () => openTech();
  const syncMute = () => { $('#btnMute').textContent = audio.isMuted() ? '🔇' : '🔊'; };
  syncMute();
  $('#speed').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.onclick = () => setSpeed(Number(b.dataset.s));
  });
  function setSpeed(s: number) {
    if (s === 0) ctl.paused = !ctl.paused;
    else { ctl.paused = false; ctl.speed = s; }
    $('#speed').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const v = Number(b.dataset.s);
      b.classList.toggle('on', v === 0 ? ctl.paused : !ctl.paused && v === ctl.speed);
    });
  }

  // ------------------------------------------------------------ title
  const title = $('#title');
  const cont = $<HTMLButtonElement>('#btnContinue');
  if (!ctl.hasSave()) cont.style.display = 'none';
  cont.onclick = () => { audio.start(); onContinue(); title.classList.add('gone'); };
  $('#btnNew').onclick = () => {
    audio.start();
    if (ctl.hasSave() && !confirm('Начать заново? Сохранение будет перезаписано.')) return;
    onNewGame();
    title.classList.add('gone');
    setTimeout(() => openIntro(), 500);
  };

  // ------------------------------------------------------------ keyboard
  window.addEventListener('keydown', (e) => {
    if (!ctl.started) return;
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (!$('#modal').classList.contains('hidden')) closeModal();
      else if (ctl.tool) ctl.setTool(null);
      else if (ctl.selected) ctl.select(null);
      else openMenu();
      return;
    }
    if (!$('#modal').classList.contains('hidden')) return;
    if (k === ' ') { e.preventDefault(); setSpeed(0); return; }
    if (k === 'r') {
      if (ctl.tool) { ctl.dir = ((ctl.dir + (e.shiftKey ? 3 : 1)) % 4) as 0 | 1 | 2 | 3; audio.click(); }
      else if (ctl.selected) {
        const b = ctl.game.get(ctl.selected);
        if (b) { ctl.game.rotate(b.x, b.y); audio.click(); ctl.emit({ t: 'built', id: b.id, type: b.type }); }
      }
      return;
    }
    if (k === 't') { openTech(); return; }
    if (k === 'b') { openBees(); return; }
    if (k === 'm') { audio.setMuted(!audio.isMuted()); syncMute(); return; }
    if (k === 'delete' && ctl.selected) {
      const b = ctl.game.get(ctl.selected);
      if (b) { ctl.game.remove(b.x, b.y); ctl.select(null); audio.remove(); ctl.emit({ t: 'removed', type: b.type, x: b.x, y: b.y }); }
      return;
    }
    if (k === 'q' && e.ctrlKey) return;
    const t = HOTBAR.find((h) => BUILDINGS[h].hotkey.toLowerCase() === k);
    if (t) pickTool(t);
  });

  // ------------------------------------------------------------ events
  let lastMoney = 0;
  const incomeHist: number[] = [];
  ctl.on((e: GameEvent | UiEvent) => {
    switch (e.t) {
      case 'toast': toast(e.text, e.kind); break;
      case 'select': renderInspector(); break;
      case 'tool': syncSlots(); break;
      case 'tech':
        toast(`Изучено: ${TECHS[e.tech].name}`, 'good', TECHS[e.tech].icon);
        syncSlots();
        if (!$('#modal').classList.contains('hidden') && modalKind === 'tech') openTech();
        break;
      case 'quest': {
        const q = QUESTS[e.index]!;
        toast(`Задание выполнено: ${q.title}${e.reward ? ` · +${e.reward} 🪙` : ''}`, 'good', 'i_coin');
        questFlash = 1;
        break;
      }
      case 'mutation':
        if (e.isNew) setTimeout(() => openDiscovery(e.species), 600);
        else toast(`Мутация: ${SPECIES[e.species].name}`, 'good', 'i_bee');
        if (modalKind === 'bees') openBees();
        break;
      case 'queen':
        if (modalKind === 'bees') openBees();
        break;
      case 'won': setTimeout(() => openWin(), 1200); break;
    }
  });
  let questFlash = 0;

  // ------------------------------------------------------------ toasts
  function toast(text: string, kind: 'error' | 'info' | 'good' = 'info', ic?: string) {
    const box = $('#toasts');
    // collapse identical consecutive errors
    const last = box.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text) {
      last.classList.remove('pop');
      void last.offsetWidth;
      last.classList.add('pop');
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${kind} pop`;
    el.dataset.text = text;
    el.innerHTML = `${ic ? icon(ic) : kind === 'error' ? '⚠' : ''}<span>${text}</span>`;
    box.append(el);
    while (box.children.length > 4) box.firstElementChild!.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'good' ? 4200 : 2600);
  }

  // ------------------------------------------------------------ modal
  let modalKind: string | null = null;
  function openModal(kind: string, html: string, wide = false) {
    modalKind = kind;
    const m = $('#modal');
    m.classList.remove('hidden');
    const box = $('#modalBox');
    box.className = `box ${wide ? 'wide' : ''} ${kind}`;
    box.innerHTML = `<button class="close" id="mClose">✕</button>${html}`;
    $('#mClose').onclick = closeModal;
  }
  function closeModal() {
    $('#modal').classList.add('hidden');
    modalKind = null;
  }
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target === $('#modal')) closeModal(); });

  function openIntro() {
    openModal('intro', `
      <h2>Добро пожаловать на пасеку!</h2>
      <p>У тебя есть луг, немного монет и четыре дикие матки. Цель: построить медовую фабрику и Великий улей.</p>
      <div class="steps">
        <div>${icon('b_hive', 'bic')}<b>1. Улей</b><span>ставь у цветов: в подсказке видно, сколько сот в минуту</span></div>
        <div><span class="belt-ic" style="--c:#e8b23a"><i></i><i></i></span><b>2. Конвейер</b><span>тяни мышью ОТ улья к станку, линия сама поворачивает</span></div>
        <div>${icon('b_extractor', 'bic')}<b>3. Станки</b><span>медогонка, фасовка, рынок. Следи за заданиями слева</span></div>
      </div>
      <p class="sub">ЛКМ ставить · ПКМ снести · R повернуть · колесо зум · WASD/перетаскивание камера · Space пауза · клик по дереву: срубить (5 🪙)</p>
      <button class="big primary" id="introGo">Поехали!</button>`);
    $('#introGo').onclick = closeModal;
  }

  function openMenu() {
    openModal('menu', `
      <h2>Меню</h2>
      <div class="menu-btns">
        <button class="big primary" id="mResume">Продолжить</button>
        <button class="big" id="mHelp">Как играть</button>
        <button class="big" id="mSave">Сохранить</button>
        <button class="big danger" id="mNew">Новая игра</button>
      </div>
      <p class="sub">Игра сохраняется автоматически каждые 10 секунд.</p>`);
    $('#mResume').onclick = closeModal;
    $('#mHelp').onclick = openIntro;
    $('#mSave').onclick = () => { ctl.save(); toast('Сохранено', 'good'); closeModal(); };
    $('#mNew').onclick = () => {
      if (!confirm('Точно начать заново?')) return;
      closeModal();
      onNewGame();
      setTimeout(openIntro, 400);
    };
  }

  // ------------------------------------------------------------ tech tree
  function openTech() {
    const g = ctl.game;
    const cols = Math.max(...TECH_IDS.map((t) => TECHS[t].pos[0])) + 1;
    const rows = Math.max(...TECH_IDS.map((t) => TECHS[t].pos[1])) + 1;
    const CW = 230;
    const RH = 128;
    const lines = TECH_IDS.flatMap((t) => TECHS[t].requires.map((r) => {
      const [x1, y1] = TECHS[r].pos;
      const [x2, y2] = TECHS[t].pos;
      const done = g.state.techs.includes(r);
      return `<path d="M${x1 * CW + 200} ${y1 * RH + 52} C ${x1 * CW + 215} ${y1 * RH + 52}, ${x2 * CW - 15} ${y2 * RH + 52}, ${x2 * CW} ${y2 * RH + 52}" class="${done ? 'done' : ''}"/>`;
    })).join('');
    const nodes = TECH_IDS.map((t) => {
      const d = TECHS[t];
      const done = g.state.techs.includes(t);
      const avail = !done && d.requires.every((r) => g.state.techs.includes(r));
      const cur = g.state.research === t;
      const frac = g.researchFraction(t);
      const cost = Object.entries(d.cost).map(([k, v]) => {
        const have = g.state.researchProgress[t]?.[k as ItemId] ?? 0;
        return `<span class="c">${icon(ITEMS[k as ItemId].icon)}${done ? v : `${have}/${v}`}</span>`;
      }).join('');
      const unl = d.unlocks.map((u) => buildingIcon(u)).join('');
      return `<button class="tech ${done ? 'done' : avail ? 'avail' : 'locked'} ${cur ? 'cur' : ''}" data-t="${t}" style="left:${d.pos[0] * CW}px;top:${d.pos[1] * RH}px">
        <div class="t-head">${icon(d.icon)}<b>${d.name}</b>${done ? '<span class="ok">✓</span>' : ''}</div>
        <p>${d.desc}</p>
        <div class="t-foot"><div class="cost">${cost}</div><div class="unl">${unl}</div></div>
        ${!done && frac > 0 ? `<div class="bar thin"><i style="width:${frac * 100}%"></i></div>` : ''}
      </button>`;
    }).join('');
    openModal('tech', `
      <h2>${icon('i_research', 'ic lg')} Дерево технологий</h2>
      <p class="sub">Выбери исследование и подавай нужную продукцию конвейером в Лабораторию. Редкое (прополис, молочко, пыльца) лаборатория берёт из сарая сама.</p>
      <div class="tree-wrap"><div class="tree" style="width:${cols * CW - 30}px;height:${rows * RH}px">
        <svg width="${cols * CW}" height="${rows * RH}">${lines}</svg>${nodes}
      </div></div>`, true);
    $('#modalBox').querySelectorAll<HTMLButtonElement>('.tech').forEach((el) => {
      el.onclick = () => {
        const t = el.dataset.t as TechId;
        const r = ctl.game.setResearch(ctl.game.state.research === t ? null : t);
        if (!r.ok) { audio.error(); toast(ctl.game.state.techs.includes(t) ? 'Уже изучено' : 'Сначала изучи предыдущие технологии', 'error'); return; }
        audio.click();
        openTech();
      };
    });
  }

  // ------------------------------------------------------------ bees
  function speciesCard(s: SpeciesId, extra = '') {
    const d = SPECIES[s];
    const known = ctl.game.state.discovered.includes(s);
    const n = ctl.game.state.queens[s] ?? 0;
    const sp = Object.entries(d.specials).map(([k, v]) => `${icon(ITEMS[k as ItemId].icon)}${Math.round((v ?? 0) * 100)}%`).join(' ');
    if (!known) return `<div class="sp unknown"><div class="sp-ic">?</div><b>???</b><span class="sub">Не открыта</span></div>`;
    return `<div class="sp" style="--c:#${d.color.toString(16).padStart(6, '0')}">
      <div class="sp-ic">${icon('i_bee')}</div>
      <b>${d.name}</b>
      <span class="tier">${'★'.repeat(d.tier + 1)}</span>
      <span class="sub">×${d.productivity} сбор${d.prefers ? ` · любит ${prefName(d.prefers)}` : ''}</span>
      ${sp ? `<span class="specials">${sp}</span>` : ''}
      <span class="count">${n} ${n === 1 ? 'матка' : 'маток'}</span>${extra}
    </div>`;
  }
  const prefName = (f: string) => ({ clover: 'клевер', buckwheat: 'гречиху', lavender: 'лаванду', sunflower: 'подсолнух', heather: 'вереск', linden: 'липу' } as Record<string, string>)[f] ?? f;

  function openBees() {
    const g = ctl.game;
    const breeders = g.state.buildings.filter((b) => b.type === 'breeder');
    const muts = MUTATIONS.map((m) => {
      const known = g.state.discovered.includes(m.result);
      const pk = g.state.discovered.includes(m.a) && g.state.discovered.includes(m.b);
      return `<div class="mut ${known ? 'known' : ''}">${pk || known ? SPECIES[m.a].name : '???'} × ${pk || known ? SPECIES[m.b].name : '???'} <span>→</span> <b>${known ? SPECIES[m.result].name : '???'}</b> <span class="sub">${Math.round(m.chance * 100)}%</span></div>`;
    }).join('');
    openModal('bees', `
      <h2>${icon('i_bee', 'ic lg')} Пчёлы и селекция</h2>
      <p class="sub">Матка нужна каждому улью. Дикие матки можно купить. Новые виды выводятся в селекционной пасеке: выбери пару, подавай мёд конвейером, пыльца из сарая повышает шанс мутации.</p>
      <div class="species">${SPECIES_IDS.map((s) => speciesCard(s, WILD_SPECIES.includes(s) ? `<button class="mini buy" data-s="${s}">Купить ${QUEEN_PRICE}🪙</button>` : '')).join('')}</div>
      <div class="bees-cols">
        <div><h3>Известные скрещивания</h3><div class="muts">${muts}</div></div>
        <div><h3>Селекционные пасеки: ${breeders.length}</h3>${breeders.length ? breeders.map((b) => `<button class="mini" data-focus="${b.id}">Пасека #${b.id}: ${SPECIES[b.parents![0]].name} × ${SPECIES[b.parents![1]].name}</button>`).join('') : `<p class="sub">${g.isUnlocked('breeder') ? 'Построй пасеку (E).' : 'Исследуй «Селекцию» в дереве технологий.'}</p>`}</div>
      </div>`, true);
    $('#modalBox').querySelectorAll<HTMLButtonElement>('.buy').forEach((el) => {
      el.onclick = () => {
        const r = ctl.game.buyQueen(el.dataset.s as SpeciesId);
        if (!r.ok) { audio.error(); toast(FAIL_TEXT[r.reason], 'error'); return; }
        audio.coin();
        openBees();
      };
    });
    $('#modalBox').querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((el) => {
      el.onclick = () => {
        const b = ctl.game.get(Number(el.dataset.focus));
        if (!b) return;
        closeModal();
        focus(b.x + 1, b.y + 1);
        ctl.select(b.id);
      };
    });
  }

  function openDiscovery(s: SpeciesId) {
    const d = SPECIES[s];
    openModal('discovery', `
      <div class="disc-glow" style="--c:#${d.color.toString(16).padStart(6, '0')}">${icon('i_bee', 'disc-bee')}</div>
      <h2>Новый вид: ${d.name}!</h2>
      <p>${d.lore}</p>
      <div class="species single">${speciesCard(s)}</div>
      <p class="sub">Поставь матку в улей: выбери улей и нажми на вид, или выбери вид перед постройкой улья.</p>
      <button class="big primary" id="discOk">Отлично!</button>`);
    $('#discOk').onclick = closeModal;
  }

  function openWin() {
    const st = ctl.game.state;
    const days = Math.floor(st.wonAt / DAY_SECONDS) + 1;
    openModal('win', `
      ${icon('b_monument', 'win-img')}
      <h2>Великий улей наполнен!</h2>
      <p>Ты построил медовую империю за <b>${days}</b> ${days === 1 ? 'день' : 'дней'}.</p>
      <div class="win-stats">
        <div>${icon('i_coin')}<b>${fmt(st.stats.earned)}</b><span>заработано</span></div>
        <div>${icon('i_jar')}<b>${fmt(st.stats.produced.jar ?? 0)}</b><span>банок</span></div>
        <div>${icon('i_bee')}<b>${st.discovered.length}/${SPECIES_IDS.length}</b><span>видов пчёл</span></div>
        <div>${icon('b_hive', 'ic')}<b>${st.buildings.filter((b) => b.type === 'hive').length}</b><span>ульев</span></div>
      </div>
      <p class="sub">Можно продолжать строить: попробуй вывести Золотую пчелу.</p>
      <button class="big primary" id="winOk">Продолжить</button>`);
    $('#winOk').onclick = closeModal;
  }

  // ------------------------------------------------------------ inspector
  let inspectorKey = '';
  function renderInspector(force = true) {
    const el = $('#inspector');
    const id = ctl.selected;
    const b = id ? ctl.game.get(id) : undefined;
    if (!b) { el.classList.add('hidden'); inspectorKey = ''; return; }
    const g = ctl.game;
    const d = BUILDINGS[b.type];
    const inv = (o: Partial<Record<ItemId, number>>) => Object.entries(o).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `<span class="c">${icon(ITEMS[k as ItemId].icon)}${Math.floor(v ?? 0)}</span>`).join('') || '<span class="sub">пусто</span>';
    let body = '';
    let key = `${b.id}`;
    if (d.behaviour === 'hive') {
      const sp = b.species ?? 'forest';
      const rate = g.hiveRateOf(b.id);
      const avail = SPECIES_IDS.filter((s) => s === sp || (g.state.queens[s] ?? 0) > 0);
      key += `|${sp}|${avail.join()}`;
      body = `
        <div class="stat"><span>Вид</span><b style="color:#${SPECIES[sp].color.toString(16).padStart(6, '0')}">${SPECIES[sp].name}</b></div>
        <div class="stat"><span>Сбор днём</span><b>${(rate * 60).toFixed(1)} сот/мин</b></div>
        <div class="stat"><span>На выходе</span><span id="insOut">${inv(b.out)}</span></div>
        <h4>Сменить матку</h4>
        <div class="sp-pick">${avail.map((s) => `<button class="mini ${s === sp ? 'on' : ''}" data-sp="${s}">${SPECIES[s].name}${s === sp ? '' : ` (${g.state.queens[s]})`}</button>`).join('')}</div>`;
    } else if (d.behaviour === 'breeder') {
      const [a, c] = b.parents!;
      const odds = g.breedOdds(a, c, b.inv.pollen ?? 0);
      const opts = (sel: SpeciesId) => g.state.discovered.map((s) => `<option value="${s}" ${s === sel ? 'selected' : ''}>${SPECIES[s].name}</option>`).join('');
      key += `|${a}|${c}|${g.state.discovered.length}|${b.inv.pollen ?? 0}`;
      body = `
        <div class="pair"><select id="pa">${opts(a)}</select><span>×</span><select id="pb">${opts(c)}</select></div>
        <div class="odds">${odds.map(([s, p]) => `<div class="${s !== a && s !== c ? 'mut' : ''}"><span>${g.state.discovered.includes(s) || s === a || s === c ? SPECIES[s].name : '???'}</span><b>${Math.round(p * 100)}%</b></div>`).join('')}</div>
        <div class="stat"><span>Мёд</span><b id="insHoney">${Math.floor(b.inv.honey ?? 0)}/${BREED.honeyPerCycle}</b></div>
        <div class="stat"><span>Пыльца (из сарая)</span><b>${b.inv.pollen ?? 0}/${BREED.pollenMax}</b></div>
        <div class="bar"><i id="insBar"></i></div>
        <p class="sub">Цикл ${BREED.seconds}с, ест ${BREED.honeyPerCycle} мёда. Результат: новая матка.</p>`;
    } else if (d.behaviour === 'machine') {
      const r = d.recipe!;
      body = `
        <div class="recipe">${Object.entries(r.inputs).map(([k, v]) => `${v}${icon(ITEMS[k as ItemId].icon)}`).join(' + ') || '—'} <span>→</span> ${Object.entries(r.outputs).map(([k, v]) => `${v}${icon(ITEMS[k as ItemId].icon)}`).join(' + ')} <span class="sub">${(r.seconds / g.machineSpeed()).toFixed(1)}с</span></div>
        <div class="stat"><span>Вход</span><span id="insIn">${inv(b.inv)}</span></div>
        <div class="stat"><span>Выход</span><span id="insOut">${inv(b.out)}</span></div>
        <div class="bar"><i id="insBar"></i></div>`;
    } else if (d.behaviour === 'lab') {
      body = `<div class="stat"><span>Исследование</span><b>${g.state.research ? TECHS[g.state.research].name : 'не выбрано'}</b></div>
        <div class="stat"><span>Внутри</span><span id="insIn">${inv(b.inv)}</span></div>
        <button class="mini" id="insTech">Открыть дерево (T)</button>`;
      key += `|${g.state.research}`;
    } else if (d.behaviour === 'market') {
      const prices = (['jar', 'candle', 'mead', 'honey', 'wax', 'comb'] as ItemId[]).map((k) => `<div class="price"><span>${icon(ITEMS[k].icon)}${ITEMS[k].name}</span><b>${g.priceOf(k).toFixed(1)}</b></div>`).join('');
      body = `<p class="sub">Цены падают, если продавать одно и то же, и восстанавливаются со временем.</p><div class="prices" id="insPrices">${prices}</div>`;
    } else if (d.behaviour === 'monument') {
      const need = Object.entries(MONUMENT_NEEDS).map(([k, v]) => {
        const have = g.state.monument[k as ItemId] ?? 0;
        return `<div class="stat"><span>${icon(ITEMS[k as ItemId].icon)}${ITEMS[k as ItemId].name}</span><b>${Math.min(have, v ?? 0)}/${v}</b></div>`;
      }).join('');
      body = `<p class="sub">Подавай продукцию конвейерами. Прополис и молочко берутся из сарая.</p><div id="insMon">${need}</div>`;
    } else if (d.behaviour === 'store') {
      body = `<div class="stat"><span>Внутри</span><span id="insIn">${inv(b.inv)}</span></div>`;
    } else if (d.behaviour === 'belt') {
      const term = g.terminalOf(b.id);
      body = `<div class="stat"><span>Скорость</span><b>${d.speed} кл/с</b></div><div class="stat"><span>Ведёт в</span><b>${term ? BUILDINGS[term.type].name : 'никуда'}</b></div>`;
      key += `|${term?.id}`;
    }
    if (!force && key === inspectorKey) return;
    inspectorKey = key;
    const problem = (window as unknown as { __problem?: (b: unknown) => string | null }).__problem?.(b);
    el.innerHTML = `
      <div class="ins-head">${buildingIcon(b.type)}<div><h3>${d.name}</h3><span class="sub">${d.hint}</span></div><button class="close" id="insClose">✕</button></div>
      ${problem ? `<div class="problem">⚠ ${problem}</div>` : ''}
      ${body}
      <div class="ins-foot"><button class="mini" id="insRot">⟳ Повернуть (R)</button><button class="mini danger" id="insDel">Снести (Del)</button></div>`;
    el.classList.remove('hidden');
    $('#insClose').onclick = () => ctl.select(null);
    $('#insDel').onclick = () => { ctl.game.remove(b.x, b.y); audio.remove(); ctl.select(null); ctl.emit({ t: 'removed', type: b.type, x: b.x, y: b.y }); };
    $('#insRot').onclick = () => { ctl.game.rotate(b.x, b.y); audio.click(); ctl.emit({ t: 'built', id: b.id, type: b.type }); };
    el.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((x) => {
      x.onclick = () => {
        const r = ctl.game.setHiveSpecies(b.id, x.dataset.sp as SpeciesId);
        if (!r.ok) { audio.error(); toast(FAIL_TEXT[r.reason], 'error'); return; }
        audio.click();
        renderInspector();
      };
    });
    const pa = el.querySelector<HTMLSelectElement>('#pa');
    const pb = el.querySelector<HTMLSelectElement>('#pb');
    if (pa && pb) {
      const ch = () => { ctl.game.setParents(b.id, pa.value as SpeciesId, pb.value as SpeciesId); audio.click(); renderInspector(); };
      pa.onchange = ch;
      pb.onchange = ch;
    }
    const it = el.querySelector<HTMLButtonElement>('#insTech');
    if (it) it.onclick = openTech;
  }

  function liveInspector() {
    const id = ctl.selected;
    const b = id ? ctl.game.get(id) : undefined;
    if (!b) { if (!$('#inspector').classList.contains('hidden')) renderInspector(); return; }
    renderInspector(false);
    const d = BUILDINGS[b.type];
    const inv = (o: Partial<Record<ItemId, number>>) => Object.entries(o).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `<span class="c">${icon(ITEMS[k as ItemId].icon)}${Math.floor(v ?? 0)}</span>`).join('') || '<span class="sub">пусто</span>';
    const set = (sel: string, html: string) => { const x = document.querySelector(sel); if (x && x.innerHTML !== html) x.innerHTML = html; };
    set('#insIn', inv(b.inv));
    set('#insOut', inv(b.out));
    const bar = document.querySelector<HTMLElement>('#insBar');
    if (bar) {
      const total = d.behaviour === 'breeder' ? BREED.seconds : (d.recipe?.seconds ?? 1);
      bar.style.width = `${Math.min(100, (b.progress / total) * 100)}%`;
    }
    set('#insHoney', `${Math.floor(b.inv.honey ?? 0)}/${BREED.honeyPerCycle}`);
  }

  // ------------------------------------------------------------ frame update
  function syncSlots() {
    slots.querySelectorAll<HTMLButtonElement>('.slot').forEach((el) => {
      const t = el.dataset.t as BuildingId;
      el.classList.toggle('on', ctl.tool === t);
      el.classList.toggle('locked', !ctl.game.isUnlocked(t));
      el.classList.toggle('poor', ctl.game.state.money < BUILDINGS[t].cost);
    });
  }

  let tick = 0;
  return {
    update() {
      const g = ctl.game;
      const st = g.state;
      tick++;
      $('#money').textContent = fmt(st.money);
      // income per minute, sampled each ~second
      if (tick % 60 === 0) {
        incomeHist.push(st.stats.earned - lastMoney);
        lastMoney = st.stats.earned;
        if (incomeHist.length > 30) incomeHist.shift();
        const perMin = (incomeHist.reduce((a, b) => a + b, 0) / Math.max(1, incomeHist.length)) * 60 * (ctl.paused ? 0 : 1);
        $('#income').textContent = perMin > 0 ? `+${fmt(perMin / Math.max(1, ctl.speed))}/мин` : '';
      }
      const phase = (st.time % DAY_SECONDS) / DAY_SECONDS;
      const hours = (6 + phase * 24) % 24;
      $('#day').textContent = `День ${g.day()}`;
      $('#clock').textContent = `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60 / 10) * 10).padStart(2, '0')}`;
      $('#sun').textContent = g.light() > 0.3 ? '☀' : g.light() > 0 ? '🌅' : '🌙';
      const q = SPECIES_IDS.reduce((a, s) => a + (st.queens[s] ?? 0), 0);
      $('#queens').textContent = String(q);
      $('#queensChip').classList.toggle('warn', q === 0);
      const barn = (Object.entries(st.barn) as [ItemId, number][]).filter(([, v]) => v > 0);
      const barnEl = $('#barnChip');
      const barnHtml = barn.length ? barn.map(([k, v]) => `<span class="c" title="${ITEMS[k].name}">${icon(ITEMS[k].icon)}${fmt(v)}</span>`).join('') : '';
      if (barnEl.innerHTML !== barnHtml) barnEl.innerHTML = barnHtml;
      barnEl.style.display = barn.length ? '' : 'none';

      // quest
      const qi = st.quest;
      const qd = QUESTS[qi];
      const qEl = $('#quest');
      if (qd) {
        const [have, need] = g.questProgress(qi);
        $('#qnum').textContent = `${qi + 1}/${QUESTS.length}`;
        $('#qtitle').textContent = qd.title;
        if ($('#qtext').textContent !== qd.text) $('#qtext').textContent = qd.text;
        $('#qreward').innerHTML = qd.reward ? `${icon('i_coin')}+${qd.reward}` : '';
        $('#qbar').style.width = `${Math.min(100, (have / need) * 100)}%`;
        $('#qprog').textContent = need > 1 ? `${fmt(Math.min(have, need))} / ${fmt(need)}` : have >= need ? 'Готово!' : '';
      } else {
        $('#qtitle').textContent = 'Все задания выполнены!';
        $('#qtext').textContent = 'Ты легенда пасечников. Строй дальше.';
        $('#qbar').style.width = '100%';
      }
      if (questFlash > 0) { qEl.classList.add('flash'); questFlash = 0; setTimeout(() => qEl.classList.remove('flash'), 900); }

      // research
      const r = st.research;
      $('#rname').textContent = r ? TECHS[r].name : 'Выбери исследование';
      $('#rbar').style.width = r ? `${g.researchFraction(r) * 100}%` : '0';
      const rn = r ? Object.entries(TECHS[r].cost).map(([k, v]) => `${ITEMS[k as ItemId].name} ${st.researchProgress[r]?.[k as ItemId] ?? 0}/${v}`).join(' · ') : 'Нажми T';
      if ($('#rneed').textContent !== rn) $('#rneed').textContent = rn;
      $('#research').classList.toggle('idle', !r && st.buildings.some((b) => b.type === 'lab'));
      $('#research').style.display = st.quest >= 3 || st.techs.length || st.buildings.some((b) => b.type === 'lab') ? '' : 'none';

      if (tick % 10 === 0) { syncSlots(); liveInspector(); }
      if (tick % 600 === 0) ctl.save();
    },
  };
}
