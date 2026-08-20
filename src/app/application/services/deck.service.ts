import { Injectable, computed, signal } from '@angular/core';
import { Card, Deck, DeckItem } from '../../domain/models';

const STORAGE_KEY = 'mvc_tcg_active_deck';

@Injectable({
  providedIn: 'root'
})
export class DeckService {
  readonly deckName = signal<string>('Mi Mazo de Lucha');
  readonly deckItems = signal<DeckItem[]>([]);

  readonly totalCards = computed(() => {
    return this.deckItems().reduce((total, item) => total + item.quantity, 0);
  });

  readonly isDeckValid = computed(() => {
    return this.totalCards() === 50;
  });

  readonly typeBreakdown = computed(() => {
    const breakdown: Record<string, number> = {
      'Luchador': 0,
      'Castigo': 0,
      'Arena': 0,
      'Promotor': 0,
      'Contrato': 0,
      'Objeto': 0
    };

    for (const item of this.deckItems()) {
      const type = item.card.type || 'Otro';
      breakdown[type] = (breakdown[type] || 0) + item.quantity;
    }
    return breakdown;
  });

  readonly bandoBreakdown = computed(() => {
    let tecnicos = 0;
    let rudos = 0;
    let neutrales = 0;

    for (const item of this.deckItems()) {
      if (item.card.bando === 'Técnico') tecnicos += item.quantity;
      else if (item.card.bando === 'Rudo') rudos += item.quantity;
      else neutrales += item.quantity;
    }
    return { tecnicos, rudos, neutrales };
  });

  readonly costCurve = computed(() => {
    const curve: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    for (const item of this.deckItems()) {
      if (item.card.cost !== null) {
        const c = Math.min(item.card.cost, 7);
        curve[c] = (curve[c] || 0) + item.quantity;
      }
    }
    return curve;
  });

  constructor() {
    this.loadDeckFromStorage();
  }

  addCard(card: Card): boolean {
    const current = this.deckItems();
    const existingIndex = current.findIndex(i => i.card.id === card.id);

    // Limit to max 3 copies of any card in deck (standard TCG rule)
    if (existingIndex > -1) {
      if (current[existingIndex].quantity >= 3) {
        return false;
      }
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1
      };
      this.deckItems.set(updated);
    } else {
      this.deckItems.set([...current, { card, quantity: 1 }]);
    }

    this.saveDeckToStorage();
    return true;
  }

  removeCard(cardId: string): void {
    const current = this.deckItems();
    const existingIndex = current.findIndex(i => i.card.id === cardId);
    if (existingIndex === -1) return;

    if (current[existingIndex].quantity > 1) {
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity - 1
      };
      this.deckItems.set(updated);
    } else {
      this.deckItems.set(current.filter(i => i.card.id !== cardId));
    }

    this.saveDeckToStorage();
  }

  getCardQuantity(cardId: string): number {
    const item = this.deckItems().find(i => i.card.id === cardId);
    return item ? item.quantity : 0;
  }

  clearDeck(): void {
    this.deckItems.set([]);
    this.saveDeckToStorage();
  }

  setDeckName(name: string): void {
    this.deckName.set(name);
    this.saveDeckToStorage();
  }

  exportDeck(): string {
    const deckData: Deck = {
      id: 'deck-' + Date.now(),
      name: this.deckName(),
      items: this.deckItems(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return JSON.stringify(deckData, null, 2);
  }

  importDeck(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr) as Deck;
      if (parsed && Array.isArray(parsed.items)) {
        this.deckName.set(parsed.name || 'Mazo Importado');
        this.deckItems.set(parsed.items);
        this.saveDeckToStorage();
        return true;
      }
    } catch (e) {
      console.error('Invalid deck json', e);
    }
    return false;
  }

  private saveDeckToStorage(): void {
    try {
      const data = {
        name: this.deckName(),
        items: this.deckItems()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save deck to localStorage', e);
    }
  }

  private loadDeckFromStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) this.deckName.set(parsed.name);
        if (Array.isArray(parsed.items)) this.deckItems.set(parsed.items);
      }
    } catch (e) {
      console.warn('Could not load deck from localStorage', e);
    }
  }
}
