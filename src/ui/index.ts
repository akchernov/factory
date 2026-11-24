import { DEFAULT_RULES } from '../core/rules';
import type { BuildingKind, Direction, FactorySnapshot } from '../shared/types';
import './hud.css';

const HOTBAR = [
  { kind: 'hive', label: 'Улей' },
  { kind: 'conveyor', label: 'Конвейер' },
  { kind: 'extractor', label: 'Медогонка' },
  { kind: 'packer', label: 'Фасовка' },
  { kind: 'market', label: 'Рынок' },
] as const satisfies readonly { kind: BuildingKind; label: string }[];

export interface FactoryHud {
  render(snapshot: FactorySnapshot): void;
  getSelectedBuilding(): BuildingKind;
  setFacing?(facing: Direction): void;
  notify?(message: string): void;
  isSelling?(): boolean;
  toggleSale?(): void;
}

const HEADING: Record<Direction, string> = { east: '→', south: '↓', west: '←', north: '↑' };
const DIRECTION_NAME: Record<Direction, string> = { east: 'восток', south: 'юг', west: 'запад', north: 'север' };

export function createHud(element: HTMLElement): FactoryHud {
  const document = element.ownerDocument;
  const resources = document.createElement('div');
  resources.className = 'factory-hud-resources';

  const panel = document.createElement('section');
  panel.className = 'factory-build';
  panel.setAttribute('aria-label', 'Строительство');
  const heading = document.createElement('h2');
  heading.textContent = 'Строительство';
  const hotbar = document.createElement('div');
  hotbar.className = 'factory-hotbar';
  hotbar.setAttribute('role', 'group');
  hotbar.setAttribute('aria-label', 'Выбор здания');
  const rotate = document.createElement('button');
  rotate.type = 'button';
  rotate.id = 'rotate-building';
  rotate.setAttribute('aria-label', 'Повернуть эскиз');
  const arrow = document.createElement('span');
  arrow.className = 'build-direction';
  arrow.setAttribute('aria-hidden', 'true');
  const sale = document.createElement('button');
  sale.id = 'sell-building';
  sale.type = 'button';
  sale.title = 'Продать постройку (X)';
  sale.setAttribute('aria-label', 'Продать постройку');
  sale.setAttribute('aria-keyshortcuts', 'X');
  sale.setAttribute('aria-pressed', 'false');
  const saleIcon = document.createElement('span');
  saleIcon.className = 'sale-icon';
  saleIcon.textContent = '−';
  saleIcon.setAttribute('aria-hidden', 'true');
  const saleLabel = document.createElement('span');
  saleLabel.className = 'tool-name';
  saleLabel.textContent = 'Продать';
  sale.append(saleIcon, saleLabel);
  sale.addEventListener('click', toggleSale);
  const status = document.createElement('div');
  status.className = 'factory-status';
  status.setAttribute('role', 'status');
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  let selectedBuilding: BuildingKind = HOTBAR[0].kind;
  let selling = false;
  const buttons = HOTBAR.map(({ kind, label }, index) => {
    const shortcut = String(index + 1);
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `${label} · ${DEFAULT_RULES.costs[kind]} монет (${shortcut})`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-keyshortcuts', shortcut);
    button.setAttribute('aria-pressed', String(kind === selectedBuilding));

    const key = document.createElement('kbd');
    key.textContent = shortcut;
    key.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('span');
    icon.className = `tool-icon tool-icon-${kind}`;
    icon.setAttribute('aria-hidden', 'true');
    if (kind !== 'conveyor') icon.style.backgroundImage = `url('${import.meta.env.BASE_URL}assets/tool-${kind}.png')`;
    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = label;
    const price = document.createElement('span');
    price.className = 'tool-price';
    price.textContent = String(DEFAULT_RULES.costs[kind]);
    price.setAttribute('aria-hidden', 'true');
    button.append(icon, name, price, key);
    button.addEventListener('click', () => selectBuilding(kind));
    hotbar.append(button);
    return button;
  });

  function selectBuilding(kind: BuildingKind) {
    selectedBuilding = kind;
    setSelling(false);
  }

  function setSelling(active: boolean) {
    selling = active;
    sale.setAttribute('aria-pressed', String(active));
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(!active && HOTBAR[index]?.kind === selectedBuilding));
    });
  }

  function toggleSale() {
    setSelling(!selling);
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;

    const entry = HOTBAR.find((_, index) => event.key === String(index + 1));
    if (entry) selectBuilding(entry.kind);
  });

  const rotateLabel = document.createElement('span');
  rotateLabel.className = 'tool-name';
  rotateLabel.textContent = 'Повернуть';
  rotate.append(arrow, rotateLabel);
  panel.append(heading, hotbar, rotate, sale);
  element.replaceChildren(resources, panel, status);

  return {
    getSelectedBuilding() {
      return selectedBuilding;
    },
    isSelling() {
      return selling;
    },
    toggleSale,
    setFacing(facing) {
      arrow.textContent = HEADING[facing];
      rotate.title = `Повернуть эскиз (R) · ${DIRECTION_NAME[facing]}`;
    },
    notify(message) {
      clearTimeout(statusTimer);
      status.textContent = message;
      statusTimer = setTimeout(() => { status.textContent = ''; }, 2000);
    },
    render({ money, inventory }) {
      const text = `Монеты: ${money} · Нектар: ${inventory.nectar} · Соты: ${inventory.comb} · Мёд: ${inventory.honey} · Банки: ${inventory.jar}`;
      if (resources.textContent !== text) resources.textContent = text;
    },
  };
}
