import type { BuildingKind, FactorySnapshot } from '../shared/types';
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
}

export function createHud(element: HTMLElement): FactoryHud {
  const document = element.ownerDocument;
  const resources = document.createElement('span');
  resources.className = 'factory-hud-resources';

  const hotbar = document.createElement('span');
  hotbar.className = 'factory-hotbar';
  hotbar.setAttribute('role', 'group');
  hotbar.setAttribute('aria-label', 'Выбор здания');

  let selectedBuilding: BuildingKind = HOTBAR[0].kind;
  const buttons = HOTBAR.map(({ kind, label }, index) => {
    const shortcut = String(index + 1);
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-keyshortcuts', shortcut);
    button.setAttribute('aria-pressed', String(kind === selectedBuilding));

    const key = document.createElement('kbd');
    key.textContent = shortcut;
    key.setAttribute('aria-hidden', 'true');
    button.append(key, ` ${label}`);
    button.addEventListener('click', () => selectBuilding(kind));
    hotbar.append(button);
    return button;
  });

  function selectBuilding(kind: BuildingKind) {
    selectedBuilding = kind;
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(HOTBAR[index]?.kind === kind));
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;

    const entry = HOTBAR.find((_, index) => event.key === String(index + 1));
    if (entry) selectBuilding(entry.kind);
  });

  element.replaceChildren(resources, hotbar);

  return {
    getSelectedBuilding() {
      return selectedBuilding;
    },
    render({ money, inventory }) {
      const text = `Монеты: ${money} · Соты: ${inventory.comb} · Мёд: ${inventory.honey} · Банки: ${inventory.jar}`;
      if (resources.textContent !== text) resources.textContent = text;
    },
  };
}
