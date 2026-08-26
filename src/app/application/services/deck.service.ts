import { Injectable, computed, inject, signal } from '@angular/core';
import { Card, DeckItem, DeckCardRef, SavedDeck, DeckStats, HandSimulation } from '../../domain/models';
import { SupabaseService } from '../../core/services/supabase.service';

const STORAGE_KEY = 'mvc_tcg_active_deck';

@Injectable({
  providedIn: 'root'
})
export class DeckService {
  private readonly supabase = inject(SupabaseService);

  // Active Deck State
  readonly activeDeckId = signal<string | null>(null);
  readonly deckName = signal<string>('Mi Mazo de Lucha');
  readonly deckDescription = signal<string>('');
  readonly isPublic = signal<boolean>(false);
  readonly deckItems = signal<DeckItem[]>([]);

  // Cloud & Community Decks State
  readonly userSavedDecks = signal<SavedDeck[]>([]);
  readonly publicDecks = signal<SavedDeck[]>([]);
  readonly isLoadingDecks = signal<boolean>(false);
  readonly isSavingDeck = signal<boolean>(false);

  // Computed Properties
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
      if (item.card.cost !== null && item.card.cost !== undefined) {
        const c = Math.min(item.card.cost, 7);
        curve[c] = (curve[c] || 0) + item.quantity;
      }
    }
    return curve;
  });

  readonly deckStats = computed<DeckStats>(() => {
    const items = this.deckItems();
    const total = this.totalCards();
    const types = this.typeBreakdown();
    const bandos = this.bandoBreakdown();

    let totalCost = 0;
    let costCount = 0;
    let totalStrength = 0;
    let strengthCount = 0;
    const styleMap = new Map<string, number>();

    for (const item of items) {
      if (item.card.cost !== null && item.card.cost !== undefined) {
        totalCost += item.card.cost * item.quantity;
        costCount += item.quantity;
      }
      if (item.card.strength !== null && item.card.strength !== undefined) {
        totalStrength += item.card.strength * item.quantity;
        strengthCount += item.quantity;
      }
      if (item.card.style) {
        styleMap.set(item.card.style, (styleMap.get(item.card.style) || 0) + item.quantity);
      }
    }

    const costCurveArray = [0, 1, 2, 3, 4, 5, 6, 7].map(cost => ({
      cost,
      count: this.costCurve()[cost] || 0
    }));

    const styleDistribution = Array.from(styleMap.entries()).map(([style, count]) => ({
      style,
      count
    }));

    return {
      totalCards: total,
      luchadoresCount: types['Luchador'] || 0,
      castigosCount: types['Castigo'] || 0,
      arenasCount: types['Arena'] || 0,
      promotoresCount: types['Promotor'] || 0,
      contratosCount: types['Contrato'] || 0,
      objetosCount: types['Objeto'] || 0,
      tecnicosCount: bandos.tecnicos,
      rudosCount: bandos.rudos,
      neutralesCount: bandos.neutrales,
      costCurve: costCurveArray,
      styleDistribution,
      avgCost: costCount > 0 ? parseFloat((totalCost / costCount).toFixed(1)) : 0,
      avgStrength: strengthCount > 0 ? parseFloat((totalStrength / strengthCount).toFixed(1)) : 0
    };
  });

  constructor() {
    this.loadDeckFromStorage();
  }

  /**
   * Determina el número máximo de copias permitidas para una carta según el reglamento oficial:
   * - Cartas con 'Ídolo' / 'Idolo': Máximo 1 copia por baraja.
   * - Cartas con 'Legado' o llamadas 'Contrato' (o tipo Contrato): Ilimitadas (más de 3, hasta 50).
   * - Cualquier otra carta: Máximo 3 copias.
   */
  getMaxCopies(card: Card): number {
    if (!card) return 3;
    const name = (card.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const effect = (card.effect || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const style = (card.style || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const type = (card.type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const raw = (card.rawDescription || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Ídolo -> Máx 1 copia
    const isIdolo = effect.includes('idolo') || style.includes('idolo') || raw.includes('-idolo-') || name.includes('idolo');
    if (isIdolo) {
      return 1;
    }

    // 2. Legado o Contrato -> Ilimitadas (hasta el total del mazo: 50)
    const isLegado = effect.includes('legado') || style.includes('legado') || raw.includes('-legado-');
    const isContrato = name.includes('contrato') || type === 'contrato';
    if (isLegado || isContrato) {
      return 50;
    }

    // 3. Regla estándar -> Máx 3 copias
    return 3;
  }

  isCardAtMax(card: Card): boolean {
    return this.getCardQuantity(card.id) >= this.getMaxCopies(card);
  }

  // --- Deck Item Editing ---

  addCard(card: Card): boolean {
    const current = this.deckItems();
    const existingIndex = current.findIndex(i => i.card.id === card.id);
    const maxAllowed = this.getMaxCopies(card);

    if (existingIndex > -1) {
      if (current[existingIndex].quantity >= maxAllowed) {
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
    this.activeDeckId.set(null);
    this.deckName.set('Nuevo Mazo de Lucha');
    this.deckDescription.set('');
    this.isPublic.set(false);
    this.deckItems.set([]);
    this.saveDeckToStorage();
  }

  setDeckName(name: string): void {
    this.deckName.set(name);
    this.saveDeckToStorage();
  }

  setDeckDescription(desc: string): void {
    this.deckDescription.set(desc);
    this.saveDeckToStorage();
  }

  // --- Cloud Decks Operations (Supabase) ---

  async loadUserDecks(): Promise<SavedDeck[]> {
    const user = this.supabase.currentUser();
    if (!user) return [];

    this.isLoadingDecks.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('decks')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const decks: SavedDeck[] = (data || []).map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        name: d.name,
        description: d.description || '',
        cards: Array.isArray(d.cards) ? d.cards : [],
        isPublic: d.is_public,
        likesCount: d.likes_count || 0,
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));

      this.userSavedDecks.set(decks);
      return decks;
    } catch (err) {
      console.error('Error loading user decks from Supabase:', err);
      return [];
    } finally {
      this.isLoadingDecks.set(false);
    }
  }

  async loadPublicDecks(searchQuery?: string): Promise<SavedDeck[]> {
    this.isLoadingDecks.set(true);
    const currentUserId = this.supabase.userId();

    try {
      let query = this.supabase.client
        .from('decks')
        .select('*, profiles:user_id(full_name, state_location)')
        .eq('is_public', true)
        .order('likes_count', { ascending: false })
        .limit(40);

      if (searchQuery && searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Check user likes if authenticated
      let userLikedDeckIds = new Set<string>();
      if (currentUserId) {
        const { data: likesData } = await this.supabase.client
          .from('deck_likes')
          .select('deck_id')
          .eq('user_id', currentUserId);
        if (likesData) {
          likesData.forEach((l: any) => userLikedDeckIds.add(l.deck_id));
        }
      }

      const decks: SavedDeck[] = (data || []).map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        name: d.name,
        description: d.description || '',
        cards: Array.isArray(d.cards) ? d.cards : [],
        isPublic: d.is_public,
        likesCount: d.likes_count || 0,
        authorName: d.profiles?.full_name || 'Luchador Anónimo',
        authorState: d.profiles?.state_location || '',
        hasLiked: userLikedDeckIds.has(d.id),
        createdAt: d.created_at,
        updatedAt: d.updated_at
      }));

      this.publicDecks.set(decks);
      return decks;
    } catch (err) {
      console.error('Error loading public decks:', err);
      return [];
    } finally {
      this.isLoadingDecks.set(false);
    }
  }

  async saveActiveDeckToCloud(): Promise<SavedDeck | null> {
    const user = this.supabase.currentUser();
    if (!user) throw new Error('Debes iniciar sesión para guardar mazos en la nube.');

    this.isSavingDeck.set(true);
    const cardRefs: DeckCardRef[] = this.deckItems().map(item => ({
      cardId: item.card.id,
      quantity: item.quantity
    }));

    const payload = {
      user_id: user.id,
      name: this.deckName().trim() || 'Mazo de Lucha',
      description: this.deckDescription().trim() || '',
      cards: cardRefs,
      is_public: this.isPublic(),
      updated_at: new Date().toISOString()
    };

    try {
      let savedResult: any;
      if (this.activeDeckId()) {
        const { data, error } = await this.supabase.client
          .from('decks')
          .update(payload)
          .eq('id', this.activeDeckId())
          .select()
          .single();

        if (error) throw error;
        savedResult = data;
      } else {
        const { data, error } = await this.supabase.client
          .from('decks')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        savedResult = data;
        this.activeDeckId.set(savedResult.id);
      }

      await this.loadUserDecks();
      return {
        id: savedResult.id,
        userId: savedResult.user_id,
        name: savedResult.name,
        description: savedResult.description,
        cards: savedResult.cards,
        isPublic: savedResult.is_public,
        likesCount: savedResult.likes_count || 0,
        createdAt: savedResult.created_at,
        updatedAt: savedResult.updated_at
      };
    } finally {
      this.isSavingDeck.set(false);
    }
  }

  loadSavedDeckIntoActive(deck: SavedDeck, allCards: Card[]): void {
    const cardMap = new Map<string, Card>();
    allCards.forEach(c => cardMap.set(c.id, c));

    const items: DeckItem[] = [];
    for (const ref of deck.cards) {
      const card = cardMap.get(ref.cardId);
      if (card) {
        items.push({ card, quantity: Math.min(ref.quantity, 3) });
      }
    }

    this.activeDeckId.set(deck.id);
    this.deckName.set(deck.name);
    this.deckDescription.set(deck.description || '');
    this.isPublic.set(deck.isPublic);
    this.deckItems.set(items);
    this.saveDeckToStorage();
  }

  async deleteSavedDeck(deckId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('decks')
      .delete()
      .eq('id', deckId);

    if (error) throw error;

    if (this.activeDeckId() === deckId) {
      this.activeDeckId.set(null);
    }
    await this.loadUserDecks();
  }

  async toggleDeckLike(deckId: string): Promise<boolean> {
    const userId = this.supabase.userId();
    if (!userId) return false;

    const deck = this.publicDecks().find(d => d.id === deckId);
    const isCurrentlyLiked = deck?.hasLiked || false;

    if (isCurrentlyLiked) {
      await this.supabase.client
        .from('deck_likes')
        .delete()
        .eq('deck_id', deckId)
        .eq('user_id', userId);
    } else {
      await this.supabase.client
        .from('deck_likes')
        .insert({ deck_id: deckId, user_id: userId });
    }

    // Update local signal state
    this.publicDecks.update(decks =>
      decks.map(d => {
        if (d.id === deckId) {
          return {
            ...d,
            hasLiked: !isCurrentlyLiked,
            likesCount: isCurrentlyLiked ? Math.max(0, d.likesCount - 1) : d.likesCount + 1
          };
        }
        return d;
      })
    );

    return !isCurrentlyLiked;
  }

  clonePublicDeck(deck: SavedDeck, allCards: Card[]): void {
    this.loadSavedDeckIntoActive(deck, allCards);
    this.activeDeckId.set(null); // Detach ID so it saves as new
    this.deckName.set(`Copia de ${deck.name}`);
    this.isPublic.set(false);
    this.saveDeckToStorage();
  }

  // --- Hand Simulator & Playtest (Deterministic Shuffle) ---

  private getExpandedDeckList(): Card[] {
    const list: Card[] = [];
    for (const item of this.deckItems()) {
      for (let i = 0; i < item.quantity; i++) {
        list.push(item.card);
      }
    }
    return list;
  }

  private shuffleCards(cards: Card[]): Card[] {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  initHandSimulation(): HandSimulation {
    const all = this.shuffleCards(this.getExpandedDeckList());
    const hand = all.slice(0, 6);
    const deckRemainder = all.slice(6);

    const contractCount = hand.filter(c => c.type === 'Contrato').length;
    const lowCostLuchadorCount = hand.filter(c => c.type === 'Luchador' && (c.cost ?? 99) <= 2).length;

    return {
      hand,
      deckRemainder,
      turn: 1,
      turnDraws: [],
      contractProbability: Math.round((contractCount / Math.max(1, hand.length)) * 100),
      lowCostLuchadorProbability: Math.round((lowCostLuchadorCount / Math.max(1, hand.length)) * 100)
    };
  }

  simulateDrawTurn(state: HandSimulation): HandSimulation {
    if (state.deckRemainder.length === 0) return state;

    const drawn = state.deckRemainder[0];
    const newRemainder = state.deckRemainder.slice(1);
    const newHand = [...state.hand, drawn];
    const newDraws = [...state.turnDraws, drawn];

    return {
      ...state,
      hand: newHand,
      deckRemainder: newRemainder,
      turn: state.turn + 1,
      turnDraws: newDraws
    };
  }

  // --- Social Poster Generation (HTML5 Canvas) ---

  async generateDeckPosterDataUrl(authorName?: string, authorState?: string): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar canvas 2D');

    // Background Gradient (Dark Lucha Libre Aesthetic)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#0a0b10');
    bgGradient.addColorStop(0.5, '#12131c');
    bgGradient.addColorStop(1, '#08090d');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative Gold Border
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);

    // Header Badge
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('MÁSCARAS VS CABELLERAS TCG', 60, 80);

    // Deck Name Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '0px';
    const deckTitle = this.deckName().length > 28 ? this.deckName().substring(0, 26) + '...' : this.deckName();
    ctx.fillText(deckTitle, 60, 140);

    // Author & Stats Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px system-ui, -apple-system, sans-serif';
    const authorStr = authorName ? `Luchador: ${authorName} ${authorState ? '(' + authorState + ')' : ''}` : 'Mazo Oficial';
    ctx.fillText(`${authorStr} • 50 Cartas`, 60, 180);

    // Divider Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 205);
    ctx.lineTo(canvas.width - 60, 205);
    ctx.stroke();

    // Stats Overview Box
    const stats = this.deckStats();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(60, 225, canvas.width - 120, 100);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(60, 225, canvas.width - 120, 100);

    // Stat 1: Tipos
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`${stats.luchadoresCount}`, 90, 270);
    ctx.fillStyle = '#64748b';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('LUCHADORES', 90, 300);

    // Stat 2: Castigos & Arenas
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`${stats.castigosCount + stats.arenasCount}`, 290, 270);
    ctx.fillStyle = '#64748b';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('CASTIGOS / ARENAS', 290, 300);

    // Stat 3: Contratos & Objetos
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`${stats.contratosCount + stats.objetosCount}`, 570, 270);
    ctx.fillStyle = '#64748b';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('CONTRATOS / OBJETOS', 570, 300);

    // Stat 4: Técnicos vs Rudos
    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(`${stats.tecnicosCount}T / ${stats.rudosCount}R`, 840, 270);
    ctx.fillStyle = '#64748b';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('BANDO', 840, 300);

    // Card Items Grid Section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('LISTA DE CARTAS DEL MAZO', 60, 365);

    const items = this.deckItems();
    const colWidth = (canvas.width - 160) / 2;
    let yStart = 405;
    const lineHeight = 38;

    for (let i = 0; i < items.length && i < 44; i++) {
      const item = items[i];
      const col = i < 22 ? 0 : 1;
      const x = 60 + col * (colWidth + 40);
      const y = yStart + (i % 22) * lineHeight;

      // Quantity Badge
      ctx.fillStyle = item.quantity === 3 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x, y - 24, 34, 28);
      ctx.fillStyle = item.quantity === 3 ? '#f59e0b' : '#ffffff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(`${item.quantity}x`, x + 5, y - 4);

      // Card Name
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '18px system-ui, sans-serif';
      const cName = item.card.name.length > 20 ? item.card.name.substring(0, 18) + '..' : item.card.name;
      ctx.fillText(cName, x + 44, y - 4);

      // Type & Cost Pill
      ctx.fillStyle = '#64748b';
      ctx.font = '14px system-ui, sans-serif';
      const costStr = item.card.cost !== null ? `(${item.card.cost}⚡)` : '';
      ctx.fillText(`${item.card.type} ${costStr}`, x + colWidth - 80, y - 4);
    }

    // Footer Branding
    ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('#mascarasvscabellerastcg  •  Arma tu mazo en: mascarasvscabelleras.com', canvas.width / 2, canvas.height - 50);

    return canvas.toDataURL('image/png');
  }

  // --- JSON Import / Export ---

  exportDeck(): string {
    const deckData = {
      id: this.activeDeckId() || ('deck-' + Date.now()),
      name: this.deckName(),
      description: this.deckDescription(),
      items: this.deckItems(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return JSON.stringify(deckData, null, 2);
  }

  importDeck(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.items)) {
        this.activeDeckId.set(null);
        this.deckName.set(parsed.name || 'Mazo Importado');
        this.deckDescription.set(parsed.description || '');
        this.deckItems.set(parsed.items);
        this.saveDeckToStorage();
        return true;
      }
    } catch (e) {
      console.error('Invalid deck json', e);
    }
    return false;
  }

  // --- Local Storage Backup ---

  private saveDeckToStorage(): void {
    try {
      const data = {
        id: this.activeDeckId(),
        name: this.deckName(),
        description: this.deckDescription(),
        isPublic: this.isPublic(),
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
        if (parsed.id) this.activeDeckId.set(parsed.id);
        if (parsed.name) this.deckName.set(parsed.name);
        if (parsed.description) this.deckDescription.set(parsed.description);
        if (parsed.isPublic !== undefined) this.isPublic.set(parsed.isPublic);
        if (Array.isArray(parsed.items)) this.deckItems.set(parsed.items);
      }
    } catch (e) {
      console.warn('Could not load deck from localStorage', e);
    }
  }
}
