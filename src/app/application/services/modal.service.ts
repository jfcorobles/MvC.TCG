import { Injectable, signal } from '@angular/core';
import { Card } from '../../domain/models';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  readonly selectedCard = signal<Card | null>(null);
  readonly isOpen = signal<boolean>(false);

  open(card: Card): void {
    this.selectedCard.set(card);
    this.isOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this.isOpen.set(false);
    this.selectedCard.set(null);
    document.body.style.overflow = 'auto';
  }
}
