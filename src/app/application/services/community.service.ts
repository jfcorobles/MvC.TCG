import { Injectable, inject, signal } from '@angular/core';
import { GameEvent, CardRuling, Poll } from '../../domain/models';
import { SupabaseService } from '../../core/services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class CommunityService {
  private readonly supabase = inject(SupabaseService);

  // State Signals
  readonly events = signal<GameEvent[]>([]);
  readonly cardRulings = signal<CardRuling[]>([]);
  readonly activePolls = signal<Poll[]>([]);
  readonly isLoadingEvents = signal<boolean>(false);
  readonly isLoadingRulings = signal<boolean>(false);
  readonly isLoadingPolls = signal<boolean>(false);

  // --- 1. Events & Tournaments Operations ---

  async loadEvents(stateFilter?: string): Promise<GameEvent[]> {
    this.isLoadingEvents.set(true);
    try {
      let query = this.supabase.client
        .from('events')
        .select('*')
        .order('event_date', { ascending: true });

      if (stateFilter && stateFilter.trim() && stateFilter !== 'Todos') {
        query = query.eq('state_location', stateFilter.trim());
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped: GameEvent[] = (data || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        description: e.description || '',
        stateLocation: e.state_location,
        venueName: e.venue_name || '',
        address: e.address || '',
        eventDate: e.event_date,
        entryFee: e.entry_fee || 'Gratuito',
        registrationUrl: e.registration_url || '',
        isOfficial: e.is_official !== false,
        createdBy: e.created_by,
        createdAt: e.created_at
      }));

      this.events.set(mapped);
      return mapped;
    } catch (err) {
      console.error('Error loading events:', err);
      return [];
    } finally {
      this.isLoadingEvents.set(false);
    }
  }

  async createEvent(eventData: Omit<GameEvent, 'id' | 'createdAt'>): Promise<GameEvent> {
    const user = this.supabase.currentUser();
    const payload = {
      title: eventData.title.trim(),
      description: eventData.description?.trim() || '',
      state_location: eventData.stateLocation.trim(),
      venue_name: eventData.venueName?.trim() || '',
      address: eventData.address?.trim() || '',
      event_date: eventData.eventDate,
      entry_fee: eventData.entryFee?.trim() || 'Gratuito',
      registration_url: eventData.registrationUrl?.trim() || '',
      is_official: eventData.isOfficial,
      created_by: user?.id || null
    };

    const { data, error } = await this.supabase.client
      .from('events')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    const newEvent: GameEvent = {
      id: data.id,
      title: data.title,
      description: data.description,
      stateLocation: data.state_location,
      venueName: data.venue_name,
      address: data.address,
      eventDate: data.event_date,
      entryFee: data.entry_fee,
      registrationUrl: data.registration_url,
      isOfficial: data.is_official,
      createdBy: data.created_by,
      createdAt: data.created_at
    };

    this.events.update(list => [newEvent, ...list]);
    return newEvent;
  }

  async updateEvent(id: string, updates: Partial<GameEvent>): Promise<void> {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.stateLocation !== undefined) payload.state_location = updates.stateLocation;
    if (updates.venueName !== undefined) payload.venue_name = updates.venueName;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.eventDate !== undefined) payload.event_date = updates.eventDate;
    if (updates.entryFee !== undefined) payload.entry_fee = updates.entryFee;
    if (updates.registrationUrl !== undefined) payload.registration_url = updates.registrationUrl;
    if (updates.isOfficial !== undefined) payload.is_official = updates.isOfficial;

    const { error } = await this.supabase.client
      .from('events')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    await this.loadEvents();
  }

  async deleteEvent(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
    this.events.update(list => list.filter(e => e.id !== id));
  }

  // --- 2. Card Rulings & Erratas Operations ---

  async loadAllRulings(): Promise<CardRuling[]> {
    this.isLoadingRulings.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('card_rulings')
        .select('*, cards:card_id(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: CardRuling[] = (data || []).map((r: any) => ({
        id: r.id,
        cardId: r.card_id,
        cardName: r.cards?.name || r.card_id,
        rulingText: r.ruling_text,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));

      this.cardRulings.set(mapped);
      return mapped;
    } catch (err) {
      console.error('Error loading rulings:', err);
      return [];
    } finally {
      this.isLoadingRulings.set(false);
    }
  }

  async getRulingsForCard(cardId: string): Promise<CardRuling[]> {
    try {
      const { data, error } = await this.supabase.client
        .from('card_rulings')
        .select('*')
        .eq('card_id', cardId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((r: any) => ({
        id: r.id,
        cardId: r.card_id,
        rulingText: r.ruling_text,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
    } catch (err) {
      console.warn(`Notice loading rulings for card ${cardId}:`, err);
      return [];
    }
  }

  async createRuling(cardId: string, rulingText: string): Promise<CardRuling> {
    const { data, error } = await this.supabase.client
      .from('card_rulings')
      .insert({
        card_id: cardId,
        ruling_text: rulingText.trim()
      })
      .select()
      .single();

    if (error) throw error;

    const newRuling: CardRuling = {
      id: data.id,
      cardId: data.card_id,
      rulingText: data.ruling_text,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

    this.cardRulings.update(list => [newRuling, ...list]);
    return newRuling;
  }

  async deleteRuling(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('card_rulings')
      .delete()
      .eq('id', id);

    if (error) throw error;
    this.cardRulings.update(list => list.filter(r => r.id !== id));
  }

  // --- 3. Polls & Community Voting Operations ---

  async loadActivePolls(): Promise<Poll[]> {
    this.isLoadingPolls.set(true);
    const userId = this.supabase.userId();

    try {
      // 1. Cargar encuestas
      const { data: pollsData, error: pollsError } = await this.supabase.client
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false });

      if (pollsError) throw pollsError;

      // 2. Cargar todos los votos para calcular totales y ver voto del usuario
      const { data: votesData, error: votesError } = await this.supabase.client
        .from('poll_votes')
        .select('poll_id, user_id, option_index');

      if (votesError) console.warn('Could not load poll votes:', votesError);

      const allVotes = votesData || [];

      const mapped: Poll[] = (pollsData || []).map((p: any) => {
        const pollVotes = allVotes.filter(v => v.poll_id === p.id);
        const userVote = userId ? pollVotes.find(v => v.user_id === userId) : null;

        const counts: { [index: number]: number } = {};
        const optionsList = Array.isArray(p.options) ? p.options : [];
        optionsList.forEach((_: any, idx: number) => { counts[idx] = 0; });

        pollVotes.forEach(v => {
          counts[v.option_index] = (counts[v.option_index] || 0) + 1;
        });

        return {
          id: p.id,
          question: p.question,
          description: p.description || '',
          options: optionsList,
          isActive: p.is_active,
          expiresAt: p.expires_at,
          totalVotes: pollVotes.length,
          userVotedOption: userVote !== undefined && userVote !== null ? userVote.option_index : null,
          voteCounts: counts,
          createdAt: p.created_at
        };
      });

      this.activePolls.set(mapped);
      return mapped;
    } catch (err) {
      console.error('Error loading polls:', err);
      return [];
    } finally {
      this.isLoadingPolls.set(false);
    }
  }

  async votePoll(pollId: string, optionIndex: number): Promise<boolean> {
    const user = this.supabase.currentUser();
    if (!user) throw new Error('Debes iniciar sesión para votar en las encuestas.');

    const { error } = await this.supabase.client
      .from('poll_votes')
      .insert({
        poll_id: pollId,
        user_id: user.id,
        option_index: optionIndex
      });

    if (error) {
      if (error.code === '23505') {
        throw new Error('Ya has registrado tu voto en esta encuesta.');
      }
      throw error;
    }

    await this.loadActivePolls();
    return true;
  }

  async createPoll(question: string, description: string, options: string[]): Promise<Poll> {
    const validOptions = options.map(o => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      throw new Error('Una encuesta requiere al menos 2 opciones de respuesta.');
    }

    const { data, error } = await this.supabase.client
      .from('polls')
      .insert({
        question: question.trim(),
        description: description.trim(),
        options: validOptions,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    const newPoll: Poll = {
      id: data.id,
      question: data.question,
      description: data.description,
      options: data.options,
      isActive: data.is_active,
      totalVotes: 0,
      userVotedOption: null,
      voteCounts: {},
      createdAt: data.created_at
    };

    this.activePolls.update(list => [newPoll, ...list]);
    return newPoll;
  }

  async togglePollActive(pollId: string, isActive: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('polls')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', pollId);

    if (error) throw error;
    await this.loadActivePolls();
  }

  async deletePoll(pollId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('polls')
      .delete()
      .eq('id', pollId);

    if (error) throw error;
    this.activePolls.update(list => list.filter(p => p.id !== pollId));
  }
}
