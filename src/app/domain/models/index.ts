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
  effect?: string | null;
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

export interface DeckCardRef {
  cardId: string;
  quantity: number;
}

export interface SavedDeck {
  id: string;
  userId: string;
  name: string;
  description?: string;
  cards: DeckCardRef[];
  isPublic: boolean;
  likesCount: number;
  authorName?: string;
  authorState?: string;
  hasLiked?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface DeckStats {
  totalCards: number;
  luchadoresCount: number;
  castigosCount: number;
  arenasCount: number;
  promotoresCount: number;
  contratosCount: number;
  objetosCount: number;
  tecnicosCount: number;
  rudosCount: number;
  neutralesCount: number;
  costCurve: { cost: number; count: number }[];
  styleDistribution: { style: string; count: number }[];
  avgCost: number;
  avgStrength: number;
}

export interface HandSimulation {
  hand: Card[];
  deckRemainder: Card[];
  turn: number;
  turnDraws: Card[];
  contractProbability: number;
  lowCostLuchadorProbability: number;
}

export interface GameEvent {
  id: string;
  title: string;
  description?: string;
  stateLocation: string;
  venueName?: string;
  address?: string;
  eventDate: string;
  entryFee?: string;
  registrationUrl?: string;
  isOfficial: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface CardRuling {
  id: string;
  cardId: string;
  cardName?: string;
  rulingText: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Poll {
  id: string;
  question: string;
  description?: string;
  options: string[];
  isActive: boolean;
  expiresAt?: string;
  totalVotes?: number;
  userVotedOption?: number | null;
  voteCounts?: { [optionIndex: number]: number };
  createdAt: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  optionIndex: number;
  createdAt: string;
}

export * from './report.model';
export * from './auth.model';
