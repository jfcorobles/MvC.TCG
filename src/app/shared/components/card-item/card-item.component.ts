import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from '../../../domain/models';
import { ModalService } from '../../../application/services/modal.service';
import { DeckService } from '../../../application/services/deck.service';
import { CardEditService } from '../../../application/services/card-edit.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CardTiltDirective } from '../../directives/card-tilt.directive';

@Component({
  selector: 'app-card-item',
  standalone: true,
  imports: [CommonModule, CardTiltDirective],
  templateUrl: './card-item.component.html',
  styleUrl: './card-item.component.css'
})
export class CardItemComponent {
  @Input({ required: true }) card!: Card;

  readonly supabase = inject(SupabaseService);
  private readonly modalService = inject(ModalService);
  private readonly deckService = inject(DeckService);
  private readonly cardEditService = inject(CardEditService);

  get deckCount(): number {
    return this.deckService.getCardQuantity(this.card.id);
  }

  openEdit(event: Event): void {
    event.stopPropagation();
    this.cardEditService.open(this.card);
  }

  openModal(): void {
    this.modalService.open(this.card);
  }

  toggleDeck(): void {
    if (this.deckCount >= 3) {
      this.deckService.removeCard(this.card.id);
    } else {
      this.deckService.addCard(this.card);
    }
  }

  handleImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    target.src = 'assets/cards/edicion-1/Contrato.jpg';
  }
}
