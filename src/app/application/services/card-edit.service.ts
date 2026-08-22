import { Injectable, signal } from '@angular/core';
import { Card } from '../../domain/models';

@Injectable({
  providedIn: 'root'
})
export class CardEditService {
  readonly isOpen = signal<boolean>(false);
  readonly selectedCard = signal<Card | null>(null);

  open(card: Card): void {
    this.selectedCard.set(card);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.selectedCard.set(null);
  }
}
