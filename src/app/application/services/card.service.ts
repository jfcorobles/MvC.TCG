import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Card, CardFilter, Artist } from '../../domain/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class CardService {
  private readonly http = inject(HttpClient);
  private readonly supabase = inject(SupabaseService);

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
      // Text search in name, artist, number, type, style, rawDescription or effect
      if (query) {
        const matchesQuery =
          card.name.toLowerCase().includes(query) ||
          card.number.toLowerCase().includes(query) ||
          card.artist.toLowerCase().includes(query) ||
          card.type.toLowerCase().includes(query) ||
          card.style.toLowerCase().includes(query) ||
          (card.effect && card.effect.toLowerCase().includes(query)) ||
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

      // Bandos filter
      if (f.bandos.length > 0 && !f.bandos.includes(card.bando)) {
        return false;
      }

      // Styles filter
      if (f.styles.length > 0 && !f.styles.includes(card.style)) {
        return false;
      }

      // Rarities filter
      if (f.rarities.length > 0 && !f.rarities.includes(card.rarity)) {
        return false;
      }

      // Cost range
      if (f.minCost !== null && (card.cost === null || card.cost < f.minCost)) {
        return false;
      }
      if (f.maxCost !== null && (card.cost === null || card.cost > f.maxCost)) {
        return false;
      }

      // Strength range
      if (f.minStrength !== null && (card.strength === null || card.strength < f.minStrength)) {
        return false;
      }
      if (f.maxStrength !== null && (card.strength === null || card.strength > f.maxStrength)) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      const dir = f.sortDirection === 'asc' ? 1 : -1;
      switch (f.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'cost':
          return ((a.cost ?? -1) - (b.cost ?? -1)) * dir;
        case 'strength':
          return ((a.strength ?? -1) - (b.strength ?? -1)) * dir;
        case 'rarity':
          return a.rarity.localeCompare(b.rarity) * dir;
        case 'number':
        default:
          return (parseInt(a.number, 10) - parseInt(b.number, 10)) * dir;
      }
    });
  });

  // Computed: Unique filter options derived from current cards
  readonly availableSets = computed(() =>
    [...new Set(this.allCards().map(c => c.set).filter(Boolean))]
  );

  readonly availableTypes = computed(() =>
    [...new Set(this.allCards().map(c => c.type).filter(Boolean))]
  );

  readonly availableBandos = computed(() =>
    [...new Set(this.allCards().map(c => c.bando).filter(Boolean))]
  );

  readonly availableStyles = computed(() =>
    [...new Set(this.allCards().map(c => c.style).filter(Boolean))]
  );

  readonly availableRarities = computed(() =>
    [...new Set(this.allCards().map(c => c.rarity).filter(Boolean))]
  );

  readonly totalCardsCount = computed(() => this.allCards().length);

  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.query.trim()) count++;
    if (f.types.length > 0) count += f.types.length;
    if (f.bandos.length > 0) count += f.bandos.length;
    if (f.styles.length > 0) count += f.styles.length;
    if (f.rarities.length > 0) count += f.rarities.length;
    if (f.sets.length > 0) count += f.sets.length;
    if (f.minCost !== null || f.maxCost !== null) count++;
    if (f.minStrength !== null || f.maxStrength !== null) count++;
    return count;
  });

  constructor() {
    this.loadCards();
    this.loadArtists();
  }

  /**
   * Carga de cartas: Carga las 143 cartas locales y fusiona las modificaciones de Supabase
   */
  async loadCards(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    let baseCards: Card[] = [];

    // 1. Cargar la base de todas las cartas desde assets/data/cards.json
    try {
      const res = await fetch('assets/data/cards.json');
      if (res.ok) {
        baseCards = await res.json();
        this.allCards.set(baseCards);
      }
    } catch (err) {
      console.error('Error al cargar cards.json local:', err);
    }

    // 2. Consultar Supabase y sobreescribir/fusionar las cartas modificadas
    try {
      const { data, error } = await this.supabase.client
        .from('cards')
        .select('*')
        .order('number', { ascending: true });

      if (!error && data && data.length > 0) {
        const supabaseMap = new Map<string, any>();
        data.forEach((c: any) => supabaseMap.set(c.id, c));

        if (baseCards.length === 0) {
          // Si no cargó el JSON local por alguna razón, usamos directamente Supabase
          const mappedCards: Card[] = data.map((c: any) => this.mapSupabaseCard(c));
          this.allCards.set(mappedCards);
        } else {
          // Fusionar: Si existe en Supabase, sobreescribir sus campos
          const merged: Card[] = baseCards.map(localCard => {
            const remote = supabaseMap.get(localCard.id);
            if (remote) {
              return {
                ...localCard,
                name: remote.name ?? localCard.name,
                number: remote.number ?? localCard.number,
                type: remote.type ?? localCard.type,
                cost: remote.cost !== undefined ? remote.cost : localCard.cost,
                strength: remote.strength !== undefined ? remote.strength : localCard.strength,
                bando: remote.bando ?? localCard.bando,
                style: remote.style ?? localCard.style,
                rarity: remote.rarity ?? localCard.rarity,
                artist: remote.artist ?? localCard.artist,
                set: remote.set ?? localCard.set,
                setId: remote.set_id || remote.setId || localCard.setId,
                image: remote.image || localCard.image,
                rawDescription: remote.raw_description || remote.rawDescription || localCard.rawDescription,
                effect: this.formatEffect(remote.effect !== undefined ? remote.effect : localCard.effect)
              };
            }
            return localCard;
          });

          // Agregar cartas nuevas que estén en Supabase y no en el JSON local
          data.forEach((remote: any) => {
            if (!merged.some(c => c.id === remote.id)) {
              merged.push(this.mapSupabaseCard(remote));
            }
          });

          this.allCards.set(merged);
        }
      }
    } catch (supabaseErr) {
      console.warn('No se pudo sincronizar con Supabase en tiempo real:', supabaseErr);
    } finally {
      this.isLoading.set(false);
    }
  }

  private mapSupabaseCard(c: any): Card {
    return {
      id: c.id,
      number: c.number,
      name: c.name,
      type: c.type,
      cost: c.cost,
      strength: c.strength,
      bando: c.bando || '',
      style: c.style || '',
      rarity: c.rarity,
      artist: c.artist || '',
      set: c.set,
      setId: c.set_id || c.setId || 'ed1',
      image: c.image,
      rawDescription: c.raw_description || c.rawDescription || '',
      effect: this.formatEffect(c.effect)
    };
  }

  /**
   * Formatea el texto de efecto para que cualquier palabra entre guiones -PALABRA- tenga su propio salto de línea
   */
  formatEffect(text: string | null | undefined): string | null {
    if (!text) return null;
    let formatted = text.trim();

    // 1. Normalizar palabras entre guiones como -PALABRA: o -PALABRA -
    formatted = formatted.replace(/-\s*([A-ZÁÉÍÓÚÑa-z]+)\s*[:\-]\s*/g, '-$1-\n');

    // 2. Dar salto de línea antes de -PALABRA- si no es el inicio
    formatted = formatted.replace(/([^\n])\s*(-[A-ZÁÉÍÓÚÑa-z]+-)/g, '$1\n$2');

    // 3. Dar salto de línea después de -PALABRA- si no tiene salto
    formatted = formatted.replace(/(-[A-ZÁÉÍÓÚÑa-z]+-)\s*([^\n\s])/g, '$1\n$2');

    // 4. Limpiar múltiples saltos consecutivos
    formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();

    return formatted || null;
  }

  private loadArtists(): void {
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

  /**
   * [ADMIN] Actualizar o insertar carta y su efecto en Supabase
   */
  async updateCard(id: string, updates: Partial<Card>): Promise<Card> {
    const existing = this.allCards().find(c => c.id === id);
    const merged: Card = {
      ...(existing || {} as Card),
      ...updates,
      id
    };

    const payload = {
      id: merged.id,
      number: merged.number,
      name: merged.name,
      type: merged.type,
      cost: merged.cost,
      strength: merged.strength,
      bando: merged.bando || '',
      style: merged.style || '',
      rarity: merged.rarity,
      artist: merged.artist || '',
      set: merged.set,
      set_id: merged.setId,
      image: merged.image,
      raw_description: merged.rawDescription || '',
      effect: merged.effect !== undefined ? merged.effect : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase.client
      .from('cards')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;

    const updatedCard: Card = {
      ...merged,
      effect: data?.effect !== undefined ? data.effect : merged.effect
    };

    // Actualizar signal en memoria
    this.allCards.update(cards =>
      cards.map(c => c.id === id ? updatedCard : c)
    );

    return updatedCard;
  }

  /**
   * [ADMIN] Crear nueva carta en Supabase
   */
  async createCard(card: Card): Promise<Card> {
    const payload = {
      id: card.id,
      number: card.number,
      name: card.name,
      type: card.type,
      cost: card.cost,
      strength: card.strength,
      bando: card.bando,
      style: card.style,
      rarity: card.rarity,
      artist: card.artist,
      set: card.set,
      set_id: card.setId,
      image: card.image,
      raw_description: card.rawDescription,
      effect: card.effect || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase.client
      .from('cards')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    this.allCards.update(cards => [...cards, card]);
    return card;
  }

  /**
   * [ADMIN] Eliminar carta
   */
  async deleteCard(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('cards')
      .delete()
      .eq('id', id);

    if (error) throw error;

    this.allCards.update(cards => cards.filter(c => c.id !== id));
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

  setCostRange(min: number | null, max: number | null): void {
    this.filters.update(f => ({ ...f, minCost: min, maxCost: max }));
  }

  setStrengthRange(min: number | null, max: number | null): void {
    this.filters.update(f => ({ ...f, minStrength: min, maxStrength: max }));
  }

  setSort(sortBy: CardFilter['sortBy'], sortDirection: CardFilter['sortDirection']): void {
    this.filters.update(f => ({ ...f, sortBy, sortDirection }));
  }

  setSorting(sortBy: CardFilter['sortBy'], sortDirection: CardFilter['sortDirection']): void {
    this.setSort(sortBy, sortDirection);
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
