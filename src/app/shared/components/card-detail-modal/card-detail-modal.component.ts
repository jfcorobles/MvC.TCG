import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../../application/services/modal.service';
import { DeckService } from '../../../application/services/deck.service';

@Component({
  selector: 'app-card-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card-detail-modal.component.html',
  styleUrl: './card-detail-modal.component.css'
})
export class CardDetailModalComponent {
  readonly modalService = inject(ModalService);
  private readonly deckService = inject(DeckService);

  get card() {
    return this.modalService.selectedCard();
  }

  get deckCount(): number {
    return this.card ? this.deckService.getCardQuantity(this.card.id) : 0;
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
