import type { FactorySnapshot } from '../shared/types';

export interface FactoryHud {
  render(snapshot: FactorySnapshot): void;
}

export function createHud(element: HTMLElement): FactoryHud {
  return {
    render({ money, inventory, tick }) {
      element.textContent = `Монеты: ${money} · Соты: ${inventory.comb} · Банки: ${inventory.jar} · Тик: ${tick}`;
    },
  };
}
