import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../../application/services/modal.service';
import { DeckService } from '../../../application/services/deck.service';
import { CardEditService } from '../../../application/services/card-edit.service';
import { CommunityService } from '../../../application/services/community.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CardRuling } from '../../../domain/models';

@Component({
  selector: 'app-card-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-detail-modal.component.html',
  styleUrl: './card-detail-modal.component.css'
})
export class CardDetailModalComponent {
  readonly modalService = inject(ModalService);
  readonly supabase = inject(SupabaseService);
  readonly communityService = inject(CommunityService);
  private readonly deckService = inject(DeckService);
  private readonly cardEditService = inject(CardEditService);

  get card() {
    return this.modalService.selectedCard();
  }

  get cardRulings(): CardRuling[] {
    const c = this.card;
    if (!c) return [];
    return this.communityService.cardRulings().filter(r => r.cardId === c.id);
  }

  openEdit(): void {
    const c = this.card;
    if (c) {
      this.close();
      this.cardEditService.open(c);
    }
  }

  get deckCount(): number {
    return this.card ? this.deckService.getCardQuantity(this.card.id) : 0;
  }

  get maxCopies(): number {
    return this.card ? this.deckService.getMaxCopies(this.card) : 3;
  }

  get maxCopiesLabel(): string {
    const max = this.maxCopies;
    return max === 50 ? 'Ilimitado' : `${max}`;
  }

  close(): void {
    this.modalService.close();
  }

  addToDeck(): void {
    if (this.card) {
      this.deckService.addCard(this.card);
    }
  }

  removeFromDeck(): void {
    if (this.card) {
      this.deckService.removeCard(this.card.id);
    }
  }

  handleImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    target.src = 'assets/cards/edicion-1/Contrato.jpg';
  }
}
