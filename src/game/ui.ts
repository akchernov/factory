import {
  BREED, BUILDINGS, HOTBAR, ITEMS, MONUMENT_NEEDS, MUTATIONS, SPECIES, SPECIES_IDS, TECHS, TECH_IDS, WILD_SPECIES,
  DAY_SECONDS, type BuildingId, type GameMode, type ItemId, type SpeciesId, type TechId,
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

export function createUi(onNewGame: (peaceful: boolean, mode: GameMode) => void, onContinue: () => void, focus: (x: number, y: number) => void): Ui {
  const root = $('#ui');
  root.innerHTML = `
    <div id="topbar">
      <div class="brand">${icon('i_bee', 'ic lg')}<b>Bee&nbsp;Factory</b></div>
      <div class="chip money" title="Монеты">${icon('i_coin')}<b id="money">0</b><span id="income" class="sub"></span></div>
      <div class="chip clock" title="День и время"><span id="sun">☀</span><b id="day">День 1</b><span id="clock" class="sub"></span></div>
      <div class="chip queens" id="queensChip" title="Свободные матки (B)">${icon('i_bee')}<b id="queens">0</b><span class="sub">маток</span></div>
      <div class="chip raid" id="raidChip" title="Следующий налёт"></div>
      <div class="chip barn" id="barnChip" title="Сарай: сюда падают продукты при сносе и редкие продукты пчёл"></div>
      <div class="spacer"></div>
      <button class="tb" id="btnTech" title="Технологии (T)">${icon('i_research')}<span>Наука</span><kbd>T</kbd></button>
      <button class="tb" id="btnBees" title="Пчёлы и селекция (B)">${icon('i_bee')}<span>Пчёлы</span><kbd>B</kbd></button>
      <button class="tb" id="btnStats" title="Статистика производства (P)">📈<span>Графики</span><kbd>P</kbd></button>
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
    <canvas id="minimap" class="panel" width="168" height="120" title="Мини-карта: клик переносит камеру"></canvas>

    <div id="hotbar">
      <div id="tooltip" class="panel hidden"></div>
      <div id="slots"></div>
      <div class="hint" id="hint">ЛКМ ставить · тяни конвейер мышью · R/К повернуть · ПКМ снести · <b style="color:#8ee05a">▶</b> вход <b style="color:#ffc23d">▶</b> выход · наведи на здание: куда идёт продукция</div>
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
          <button class="big" id="btnShort" title="8 заданий, примерно 10 минут">Быстрая партия <small>~10 мин</small></button>
          <button class="big" id="btnNew" title="14 заданий: селекция, медовуха, Великий улей">Полная игра <small>~45 мин</small></button>
        </div>
        <label class="peace"><input type="checkbox" id="peaceful"> Мирный режим (без медведей и шершней)</label>
        <ul class="features">
          <li>${icon('i_comb')} Автоматизируй цепочки: соты, мёд, воск, свечи, медовуха</li>
          <li>${icon('i_bee')} Скрещивай пчёл и выводи 8 видов, от Лесной до Золотой</li>
          <li>${icon('i_research')} 10 технологий, смена дня и ночи, живой рынок</li>
          <li>${icon('e_bear', 'ic')} Медведи и шершни: дымари, заборы, зачистка гнёзд</li>
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
  $('#btnStats').onclick = () => openStats();
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
  const startNew = (mode: GameMode) => {
    audio.start();
    if (ctl.hasSave() && !confirm('Начать заново? Сохранение будет перезаписано.')) return;
    onNewGame($<HTMLInputElement>('#peaceful').checked, mode);
    title.classList.add('gone');
    setTimeout(() => openIntro(), 500);
  };
  $('#btnNew').onclick = () => startNew('full');
  $('#btnShort').onclick = () => startNew('short');

  // ------------------------------------------------------------ keyboard
  /** Russian layout letters -> the latin key on the same physical key (R = К, T = Е, ...). */
  const RU = 'йцукенгшщзхъфывапролджэячсмитьбю';
  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
  const latin = (k: string) => {
    const i = RU.indexOf(k);
    return i >= 0 ? EN[i]! : k;
  };
  window.addEventListener('keydown', (e) => {
    if (!ctl.started) return;
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select')) return;
    const k = latin(e.key.toLowerCase());
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
    if (k === 'p') { openStats(); return; }
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
      case 'sold': flyCoin(e.x, e.y); break;
      case 'killed':
      case 'nest': flyCoin(e.x, e.y); break;
      case 'tech':
        confetti(30);
        toast(`Изучено: ${TECHS[e.tech].name}`, 'good', TECHS[e.tech].icon);
        syncSlots();
        if (!$('#modal').classList.contains('hidden') && modalKind === 'tech') openTech();
        break;
      case 'quest': {
        const q = ctl.game.quests()[e.index]!;
        toast(`Задание выполнено: ${q.title}${e.reward ? ` · +${e.reward} 🪙` : ''}`, 'good', 'i_coin');
        questFlash = 1;
        confetti(60);
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
      case 'won': confetti(200); setTimeout(() => openWin(), 1200); break;
    }
  });
  let questFlash = 0;

  // ------------------------------------------------------------ juice: coins fly to the HUD, confetti
  let lastCoin = 0;
  function flyCoin(wx: number, wy: number) {
    const now = performance.now();
    if (now - lastCoin < 110) return;
    lastCoin = now;
    const sc = (window as unknown as { __scene?: { cameras: { main: { zoom: number; worldView: { x: number; y: number } } } } }).__scene;
    if (!sc) return;
    const cam = sc.cameras.main;
    const x = (wx * 64 - cam.worldView.x) * cam.zoom;
    const y = (wy * 64 - cam.worldView.y) * cam.zoom;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
    const chip = $('.chip.money');
    const r = chip.getBoundingClientRect();
    const tx = r.left + 20 - x;
    const ty = r.top + r.height / 2 - y;
    const el = document.createElement('img');
    el.src = `${base}assets/i_coin.webp`;
    el.className = 'flycoin';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    root.append(el);
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx * 0.25}px), calc(-50% + ${ty * 0.25 - 70}px)) scale(1.4)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.6)`, opacity: 0.8 },
    ], { duration: 620, easing: 'cubic-bezier(.45,0,.75,1)' });
    anim.onfinish = () => {
      el.remove();
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    };
  }

  function confetti(n: number) {
    const colors = ['#ffcf4a', '#ff8a3a', '#9be36a', '#6ad0ff', '#ff7ab0', '#fff4dc'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background = colors[i % colors.length]!;
      el.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
      el.style.animationDelay = `${Math.random() * 0.4}s`;
      el.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
      el.style.width = `${6 + Math.random() * 8}px`;
      root.append(el);
      setTimeout(() => el.remove(), 3400);
    }
  }

  // ------------------------------------------------------------ production statistics
  interface Sample { t: number; produced: Partial<Record<ItemId, number>>; earned: number }
  const samples: Sample[] = [];
  function sampleStats() {
    const st = ctl.game.state;
    const last = samples[samples.length - 1];
    if (last && st.time < last.t) samples.length = 0; // new game
    if (last && st.time - last.t < 5) return;
    samples.push({ t: st.time, produced: { ...st.stats.produced }, earned: st.stats.earned });
    if (samples.length > 145) samples.shift();
  }
  /** Per-minute series of the last 10 minutes for a value getter. */
  function series(get: (s: Sample) => number): number[] {
    const out: number[] = [];
    for (let i = 12; i < samples.length; i += 1) {
      const a = samples[i - 12]!;
      const b = samples[i]!;
      out.push(((get(b) - get(a)) / Math.max(1, b.t - a.t)) * 60);
    }
    return out;
  }
  function spark(c: HTMLCanvasElement, data: number[], color: string) {
    const x = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    x.clearRect(0, 0, W, H);
    if (data.length < 2) {
      x.fillStyle = 'rgba(255,244,220,0.35)';
      x.font = '700 12px Nunito, sans-serif';
      x.fillText('копим данные…', 8, H / 2 + 4);
      return;
    }
    const max = Math.max(1e-6, ...data);
    const px = (i: number) => (i / (data.length - 1)) * (W - 4) + 2;
    const py = (v: number) => H - 4 - (v / max) * (H - 10);
    x.beginPath();
    x.moveTo(px(0), H);
    data.forEach((v, i) => x.lineTo(px(i), py(v)));
    x.lineTo(px(data.length - 1), H);
    x.closePath();
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `${color}88`);
    g.addColorStop(1, `${color}08`);
    x.fillStyle = g;
    x.fill();
    x.beginPath();
    data.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))));
    x.strokeStyle = color;
    x.lineWidth = 2.5;
    x.lineJoin = 'round';
    x.stroke();
    x.fillStyle = color;
    x.beginPath();
    x.arc(px(data.length - 1), py(data[data.length - 1]!), 3.5, 0, Math.PI * 2);
    x.fill();
  }
  function openStats() {
    const st = ctl.game.state;
    const items = (Object.keys(ITEMS) as ItemId[]).filter((k) => (st.stats.produced[k] ?? 0) > 0);
    const rows = items.map((k) => {
      const d = series((s) => s.produced[k] ?? 0);
      const now = d.length ? d[d.length - 1]! : 0;
      return `<div class="st-row">${icon(ITEMS[k].icon, 'ic lg')}<div class="st-name"><b>${ITEMS[k].name}</b><span class="sub">всего ${fmt(st.stats.produced[k] ?? 0)} · продано ${fmt(st.stats.sold[k] ?? 0)}</span></div><div class="st-rate"><b>${now.toFixed(1)}</b><span class="sub">в мин</span></div><canvas data-k="${k}" width="260" height="46"></canvas></div>`;
    }).join('');
    const inc = series((s) => s.earned);
    openModal('stats', `
      <h2>📈 Производство</h2>
      <p class="sub">Скорость за последнюю минуту и график за 10 минут игрового времени.</p>
      <div class="st-top">
        <div class="st-card">${icon('i_coin', 'ic lg')}<div><b>${fmt(inc.length ? inc[inc.length - 1]! : 0)}</b><span class="sub">монет в мин</span></div><canvas id="stMoney" width="300" height="56"></canvas></div>
        <div class="st-card small"><b>${fmt(st.stats.earned)}</b><span class="sub">заработано</span></div>
        <div class="st-card small"><b>${st.buildings.filter((b) => b.type === 'hive').length}</b><span class="sub">ульев</span></div>
        <div class="st-card small"><b>${st.stats.killed}</b><span class="sub">врагов отбито</span></div>
        <div class="st-card small"><b>${st.stats.lost}</b><span class="sub">зданий потеряно</span></div>
      </div>
      <div class="st-rows">${rows || '<p class="sub">Пока ничего не произведено. Поставь улей у цветов.</p>'}</div>`, true);
    spark($<HTMLCanvasElement>('#stMoney'), inc, '#ffcf4a');
    $('#modalBox').querySelectorAll<HTMLCanvasElement>('canvas[data-k]').forEach((c) => {
      const k = c.dataset.k as ItemId;
      spark(c, series((s) => s.produced[k] ?? 0), '#9be36a');
    });
  }

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
      onNewGame(ctl.game.state.peaceful, ctl.game.state.mode);
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
    } else if (d.behaviour === 'tower') {
      body = `<div class="stat"><span>Воск внутри</span><span id="insIn">${inv(b.inv)}</span></div>
        <div class="stat"><span>Воск в сарае</span><b>${Math.floor(g.state.barn.wax ?? 0)}</b></div>
        <div class="stat"><span>Прочность</span><b>${Math.ceil(b.hp)}/${d.hp}</b></div>
        <p class="sub">Стреляет дымом по ближайшему врагу в радиусе. 1 воск = ${'2.5'}с огня. Достаёт до гнёзд шершней.</p>`;
    } else if (d.behaviour === 'wall') {
      body = `<div class="stat"><span>Прочность</span><b>${Math.ceil(b.hp)}/${d.hp}</b></div><p class="sub">Медведи грызут забор, пока не сломают. Ставь вокруг ульев, а дымари за ним.</p>`;
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
      el.classList.toggle('guide', ctl.guideType === t && ctl.tool !== t);
    });
  }

  function updateRaid() {
    const g = ctl.game;
    const el = $('#raidChip');
    if (g.state.peaceful || !g.state.buildings.some((b) => b.type === 'hive')) { el.style.display = 'none'; return; }
    el.style.display = '';
    const alive = g.state.enemies.length;
    if (alive) {
      const bears = g.state.enemies.filter((e) => e.kind === 'bear').length;
      el.className = 'chip raid live';
      el.innerHTML = `⚔ <b>${bears ? `🐻${bears}` : ''} ${alive - bears ? `🐝${alive - bears}` : ''}</b><span class="sub">атака!</span>`;
      return;
    }
    const tb = g.nextRaidIn('bear');
    const th = (g.state.nests ?? []).some((n) => n.hp > 0) ? g.nextRaidIn('hornet') : Infinity;
    const kind = tb <= th ? 'bear' : 'hornet';
    const t = Math.min(tb, th);
    const n = g.raidSize(kind);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60);
    el.className = `chip raid ${t < 30 ? 'soon' : ''}`;
    el.innerHTML = `${kind === 'bear' ? '🐻' : '🐝'}<b>${mm}:${String(ss).padStart(2, '0')}</b><span class="sub">×${n}</span>`;
  }

  const mm = $<HTMLCanvasElement>('#minimap');
  const mctx = mm.getContext('2d')!;
  let mmBase: HTMLCanvasElement | null = null;
  let mmSeed = -1;
  function drawMinimap() {
    const g = ctl.game;
    const W = mm.width;
    const H = mm.height;
    const sx = W / g.w;
    const sy = H / g.h;
    if (!mmBase || mmSeed !== g.state.seed + g.state.cleared.length) {
      mmSeed = g.state.seed + g.state.cleared.length;
      mmBase = document.createElement('canvas');
      mmBase.width = W;
      mmBase.height = H;
      const c = mmBase.getContext('2d')!;
      const flowerCol = ['#e8e2ff', '#f4f0e0', '#b48ae8', '#ffd23a', '#e08ac0', '#9ad06a'];
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const i = g.idx(x, y);
        const t = g.map.terrain[i];
        const f = g.map.flower[i]!;
        c.fillStyle = t === 1 ? '#2f7f9e' : t === 2 ? (f >= 0 ? '#6a9a3a' : '#24502a') : t === 3 ? '#8a8a80' : f >= 0 ? flowerCol[f]! : '#4f8a3a';
        c.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    mctx.drawImage(mmBase, 0, 0);
    for (const b of g.state.buildings) {
      const d = BUILDINGS[b.type];
      mctx.fillStyle = d.behaviour === 'belt' ? '#d8b070' : b.type === 'hive' ? '#ffcf4a' : d.behaviour === 'tower' ? '#e8e8e8' : '#c86a2a';
      mctx.fillRect(b.x * sx, b.y * sy, Math.max(1.5, d.size * sx), Math.max(1.5, d.size * sy));
    }
    for (const n of g.state.nests ?? []) {
      if (n.hp <= 0) continue;
      mctx.fillStyle = '#ff7a1a';
      mctx.beginPath();
      mctx.arc((n.x + 1) * sx, (n.y + 1) * sy, 3.5, 0, Math.PI * 2);
      mctx.fill();
    }
    mctx.fillStyle = '#ff3a2a';
    for (const e of g.state.enemies) mctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3);
    const view = (window as unknown as { __scene?: { cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } } } }).__scene?.cameras.main.worldView;
    if (view) {
      mctx.strokeStyle = 'rgba(255,255,255,0.9)';
      mctx.lineWidth = 1.5;
      mctx.strokeRect(view.x / 64 * sx, view.y / 64 * sy, view.width / 64 * sx, view.height / 64 * sy);
    }
  }
  mm.addEventListener('pointerdown', (e) => {
    const r = mm.getBoundingClientRect();
    const g = ctl.game;
    focus(((e.clientX - r.left) / r.width) * g.w, ((e.clientY - r.top) / r.height) * g.h);
  });

  // Research inflow per item, sampled every ~6 game seconds.
  const rSamples: { t: number; tech: TechId; prog: Partial<Record<ItemId, number>> }[] = [];
  function researchHint(r: TechId): string {
    const g = ctl.game;
    const st = g.state;
    const prog = st.researchProgress[r] ?? {};
    const last = rSamples[rSamples.length - 1];
    if (!last || last.tech !== r || st.time < last.t) rSamples.length = 0;
    if (!rSamples.length || st.time - rSamples[rSamples.length - 1]!.t > 6) {
      rSamples.push({ t: st.time, tech: r, prog: { ...prog } });
      if (rSamples.length > 12) rSamples.shift();
    }
    const first = rSamples[0]!;
    const span = st.time - first.t;
    const hasLab = st.buildings.some((b) => b.type === 'lab');
    const parts: string[] = [];
    let worst = 0;
    let worstItem: ItemId | null = null;
    for (const [k, v] of Object.entries(g.techCost(r))) {
      const item = k as ItemId;
      const have = prog[item] ?? 0;
      const need = v ?? 0;
      const left = need - have;
      const rate = span > 20 ? ((have - (first.prog[item] ?? 0)) / span) * 60 : NaN;
      let eta = '';
      if (left <= 0) eta = ' ✓';
      else if (Number.isFinite(rate) && rate > 0) {
        const mins = left / rate;
        eta = ` <i>${rate.toFixed(1)}/мин</i>`;
        if (mins > worst) { worst = mins; worstItem = item; }
      } else if (span > 20) {
        eta = ' <i class="bad">не поступает</i>';
        worst = Infinity;
        worstItem = item;
      }
      parts.push(`${ITEMS[item].name} ${have}/${need}${eta}`);
    }
    let tail = '';
    if (!hasLab) tail = '<br><b class="bad">Нужна лаборатория (6)</b>';
    else if (worstItem && worst === Infinity) tail = `<br><b class="bad">Подай ${ITEMS[worstItem].name.toLowerCase()} в лабораторию конвейером</b>`;
    else if (worstItem && worst > 0) tail = `<br>Осталось ~${worst < 1 ? '<1' : Math.ceil(worst)} мин${worst > 6 ? `: добавь линию «${ITEMS[worstItem].name.toLowerCase()}»` : ''}`;
    return parts.join(' · ') + tail;
  }

  let tick = 0;
  let shownMoney = 0;
  return {
    update() {
      const g = ctl.game;
      const st = g.state;
      tick++;
      sampleStats();
      if (modalKind === 'stats' && tick % 120 === 0) openStats();
      // Rolling money counter.
      shownMoney += (st.money - shownMoney) * 0.18;
      if (Math.abs(st.money - shownMoney) < 0.6) shownMoney = st.money;
      $('#money').textContent = fmt(shownMoney);
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
      const qd = ctl.game.quests()[qi];
      const qEl = $('#quest');
      if (qd) {
        const [have, need] = g.questProgress(qi);
        $('#qnum').textContent = `${qi + 1}/${ctl.game.quests().length}`;
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
      const rn = r ? researchHint(r) : 'Нажми T';
      if ($('#rneed').innerHTML !== rn) $('#rneed').innerHTML = rn;
      $('#research').classList.toggle('idle', !r && st.buildings.some((b) => b.type === 'lab'));
      $('#research').style.display = st.quest >= 3 || st.techs.length || st.buildings.some((b) => b.type === 'lab') ? '' : 'none';

      if (tick % 10 === 0) { syncSlots(); liveInspector(); updateRaid(); }
      if (tick % 15 === 0) drawMinimap();
      if (tick % 600 === 0) ctl.save();
    },
  };
}
