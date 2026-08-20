export interface Card {
  id: string;
  number: string;
  name: string;
  type: string;
  cost: number | null;
  strength: number | null;
  bando: string;
  style: string;
  rarity: string;
  artist: string;
  set: string;
  setId: string;
  image: string;
  rawDescription: string;
}

export interface CardFilter {
  query: string;
  types: string[];
  bandos: string[];
  styles: string[];
  rarities: string[];
  sets: string[];
  artists: string[];
  minCost: number | null;
  maxCost: number | null;
  minStrength: number | null;
  maxStrength: number | null;
  sortBy: 'number' | 'name' | 'cost' | 'strength' | 'rarity';
  sortDirection: 'asc' | 'desc';
}

export interface Artist {
  name: string;
  role: string;
  bio: string;
  social?: {
    instagram?: string;
    facebook?: string;
  };
  cardCount: number;
}

export interface DeckItem {
  card: Card;
  quantity: number;
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  items: DeckItem[];
  createdAt: string;
  updatedAt: string;
}
