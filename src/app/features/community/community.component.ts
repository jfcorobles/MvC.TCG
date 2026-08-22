import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CommunityService } from '../../application/services/community.service';
import { CardService } from '../../application/services/card.service';
import { ModalService } from '../../application/services/modal.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Poll, CardRuling, Card } from '../../domain/models';

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './community.component.html',
  styleUrl: './community.component.css'
})
export class CommunityComponent implements OnInit {
  readonly communityService = inject(CommunityService);
  readonly cardService = inject(CardService);
  readonly modalService = inject(ModalService);
  readonly supabase = inject(SupabaseService);

  // Active View Filter
  readonly activeSection = signal<'all' | 'polls' | 'rulings'>('all');

  // Voting State
  readonly selectedOptions = signal<{ [pollId: string]: number }>({});
  readonly isVoting = signal<{ [pollId: string]: boolean }>({});
  readonly voteErrors = signal<{ [pollId: string]: string | null }>({});

  // Rulings Search
  rulingSearchQuery = '';

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.communityService.loadActivePolls(),
      this.communityService.loadAllRulings()
    ]);
  }

  setSection(section: 'all' | 'polls' | 'rulings'): void {
    this.activeSection.set(section);
  }

  selectOption(pollId: string, index: number): void {
    this.selectedOptions.update(prev => ({ ...prev, [pollId]: index }));
    this.voteErrors.update(prev => ({ ...prev, [pollId]: null }));
  }

  async submitVote(poll: Poll): Promise<void> {
    if (!this.supabase.isAuthenticated()) {
      alert('Debes iniciar sesión para emitir tu voto.');
      return;
    }

    const optionIndex = this.selectedOptions()[poll.id];
    if (optionIndex === undefined) {
      this.voteErrors.update(prev => ({ ...prev, [poll.id]: 'Selecciona una opción para votar.' }));
      return;
    }

    this.isVoting.update(prev => ({ ...prev, [poll.id]: true }));
    try {
      await this.communityService.votePoll(poll.id, optionIndex);
    } catch (err: any) {
      this.voteErrors.update(prev => ({ ...prev, [poll.id]: err.message || 'Error al votar.' }));
    } finally {
      this.isVoting.update(prev => ({ ...prev, [poll.id]: false }));
    }
  }

  getOptionPercentage(poll: Poll, optionIndex: number): number {
    if (!poll.totalVotes || poll.totalVotes === 0) return 0;
    const count = poll.voteCounts ? poll.voteCounts[optionIndex] || 0 : 0;
    return Math.round((count / poll.totalVotes) * 100);
  }

  getOptionVotes(poll: Poll, optionIndex: number): number {
    return poll.voteCounts ? poll.voteCounts[optionIndex] || 0 : 0;
  }

  filteredRulings(): CardRuling[] {
    const rulings = this.communityService.cardRulings();
    const q = this.rulingSearchQuery.trim().toLowerCase();
    if (!q) return rulings;
    return rulings.filter(r => 
      (r.cardName && r.cardName.toLowerCase().includes(q)) ||
      r.cardId.toLowerCase().includes(q) ||
      r.rulingText.toLowerCase().includes(q)
    );
  }

  getCard(cardId: string): Card | undefined {
    return this.cardService.allCards().find(c => c.id === cardId);
  }

  getCardImage(cardId: string): string {
    const card = this.getCard(cardId);
    return card?.image || 'assets/cards/edicion-1/Contrato.jpg';
  }

  openCardDetail(cardId: string): void {
    const card = this.getCard(cardId);
    if (card) {
      this.modalService.open(card);
    }
  }
}
