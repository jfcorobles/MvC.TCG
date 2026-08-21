import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Card, CardFilter, Artist } from '../../domain/models';

@Injectable({
  providedIn: 'root'
})
export class CardService {
  private readonly http = inject(HttpClient);

  // State Signals
  readonly allCards = signal<Card[]>([]);
  readonly allArtists = signal<Artist[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  // Filter Signal
  readonly filters = signal<CardFilter>({
    query: '',
    types: [],
    bandos: [],
    styles: [],
    rarities: [],
    sets: [],
    artists: [],
    minCost: null,
    maxCost: null,
    minStrength: null,
    maxStrength: null,
    sortBy: 'number',
    sortDirection: 'asc'
  });

  // Computed: Filtered & Sorted Cards
  readonly filteredCards = computed(() => {
    const cards = this.allCards();
    const f = this.filters();
    const query = f.query.trim().toLowerCase();

    return cards.filter(card => {
      // Text search in name, artist, number, type, style, or effect description
      if (query) {
        const matchesQuery =
          card.name.toLowerCase().includes(query) ||
          card.number.toLowerCase().includes(query) ||
          card.artist.toLowerCase().includes(query) ||
          card.type.toLowerCase().includes(query) ||
          card.style.toLowerCase().includes(query) ||
          card.rawDescription.toLowerCase().includes(query);

        if (!matchesQuery) return false;
      }

      // Sets filter
      if (f.sets.length > 0 && !f.sets.includes(card.set)) {
        return false;
      }

      // Types filter
      if (f.types.length > 0 && !f.types.includes(card.type)) {
        return false;
      }

      // Bando filter
      if (f.bandos.length > 0 && !f.bandos.includes(card.bando)) {
        return false;
      }

      // Style filter
      if (f.styles.length > 0 && !f.styles.includes(card.style)) {
        return false;
      }

      // Rarity filter
      if (f.rarities.length > 0 && !f.rarities.includes(card.rarity)) {
        return false;
      }

      // Artist filter
      if (f.artists.length > 0 && !f.artists.includes(card.artist)) {
        return false;
      }

      // Cost filter
      if (f.minCost !== null && (card.cost === null || card.cost < f.minCost)) {
        return false;
      }
      if (f.maxCost !== null && (card.cost === null || card.cost > f.maxCost)) {
        return false;
      }

      // Strength filter
      if (f.minStrength !== null && (card.strength === null || card.strength < f.minStrength)) {
        return false;
      }
      if (f.maxStrength !== null && (card.strength === null || card.strength > f.maxStrength)) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      switch (f.sortBy) {
        case 'number':
          const numA = parseInt(a.number.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.number.replace(/\D/g, '')) || 0;
          comparison = numA - numB;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'cost':
          comparison = (a.cost ?? -1) - (b.cost ?? -1);
          break;
        case 'strength':
          comparison = (a.strength ?? -1) - (b.strength ?? -1);
          break;
        case 'rarity':
          const rarityOrder: Record<string, number> = { 'Novato': 1, 'Promesa': 2, 'Leyenda': 3 };
          comparison = (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0);
          break;
      }
      return f.sortDirection === 'asc' ? comparison : -comparison;
    });
  });

  // Computed: Stats
  readonly stats = computed(() => {
    const cards = this.allCards();
    return {
      totalCards: cards.length,
      ed1Count: cards.filter(c => c.setId === 'ed1').length,
      exp1Count: cards.filter(c => c.setId === 'exp1').length,
      luchadoresCount: cards.filter(c => c.type === 'Luchador').length,
      castigosCount: cards.filter(c => c.type === 'Castigo').length,
      arenasCount: cards.filter(c => c.type === 'Arena').length,
      promotoresCount: cards.filter(c => c.type === 'Promotor').length,
      leyendasCount: cards.filter(c => c.rarity === 'Leyenda').length,
      promesasCount: cards.filter(c => c.rarity === 'Promesa').length,
      novatosCount: cards.filter(c => c.rarity === 'Novato').length
    };
  });

  // Computed: Filter active count
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.query) count++;
    count += f.types.length;
    count += f.bandos.length;
    count += f.styles.length;
    count += f.rarities.length;
    count += f.sets.length;
    count += f.artists.length;
    if (f.minCost !== null || f.maxCost !== null) count++;
    if (f.minStrength !== null || f.maxStrength !== null) count++;
    return count;
  });

  constructor() {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.isLoading.set(true);

    this.http.get<Card[]>('assets/data/cards.json').subscribe({
      next: (cards) => {
        this.allCards.set(cards);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading cards.json, trying fallback fetch', err);
        // Secondary fallback
        fetch('assets/data/cards.json')
          .then(res => res.json())
          .then(cards => {
            this.allCards.set(cards);
            this.isLoading.set(false);
          })
          .catch(e => {
            this.errorMessage.set('No se pudieron cargar las cartas.');
            this.isLoading.set(false);
          });
      }
    });

    this.http.get<Artist[]>('assets/data/artists.json').subscribe({
      next: (artists) => this.allArtists.set(artists),
      error: () => {
        fetch('assets/data/artists.json')
          .then(res => res.json())
          .then(artists => this.allArtists.set(artists))
          .catch(() => { });
      }
    });
  }

  updateSearchQuery(query: string): void {
    this.filters.update(f => ({ ...f, query }));
  }

  toggleTypeFilter(type: string): void {
    this.filters.update(f => {
      const types = f.types.includes(type)
        ? f.types.filter(t => t !== type)
        : [...f.types, type];
      return { ...f, types };
    });
  }

  toggleBandoFilter(bando: string): void {
    this.filters.update(f => {
      const bandos = f.bandos.includes(bando)
        ? f.bandos.filter(b => b !== bando)
        : [...f.bandos, bando];
      return { ...f, bandos };
    });
  }

  toggleStyleFilter(style: string): void {
    this.filters.update(f => {
      const styles = f.styles.includes(style)
        ? f.styles.filter(s => s !== style)
        : [...f.styles, style];
      return { ...f, styles };
    });
  }

  toggleRarityFilter(rarity: string): void {
    this.filters.update(f => {
      const rarities = f.rarities.includes(rarity)
        ? f.rarities.filter(r => r !== rarity)
        : [...f.rarities, rarity];
      return { ...f, rarities };
    });
  }

  toggleSetFilter(set: string): void {
    this.filters.update(f => {
      const sets = f.sets.includes(set)
        ? f.sets.filter(s => s !== set)
        : [...f.sets, set];
      return { ...f, sets };
    });
  }

  toggleArtistFilter(artist: string): void {
    this.filters.update(f => {
      const artists = f.artists.includes(artist)
        ? f.artists.filter(a => a !== artist)
        : [...f.artists, artist];
      return { ...f, artists };
    });
  }

  setSorting(sortBy: CardFilter['sortBy'], sortDirection: CardFilter['sortDirection']): void {
    this.filters.update(f => ({ ...f, sortBy, sortDirection }));
  }

  resetFilters(): void {
    this.filters.set({
      query: '',
      types: [],
      bandos: [],
      styles: [],
      rarities: [],
      sets: [],
      artists: [],
      minCost: null,
      maxCost: null,
      minStrength: null,
      maxStrength: null,
      sortBy: 'number',
      sortDirection: 'asc'
    });
  }

  getFeaturedCards(): Card[] {
    const cards = this.allCards();
    return cards.filter(c => c.rarity === 'Leyenda' || ['Charro Blanco', 'Meteorix', 'Octagon', 'Carmelo Reyes', 'El Brazo de Oro', 'Halloween'].includes(c.name)).slice(0, 8);
  }
}
