import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DeckService } from '../../application/services/deck.service';
import { CardService } from '../../application/services/card.service';
import { ModalService } from '../../application/services/modal.service';
import { Card } from '../../domain/models';

@Component({
  selector: 'app-deck-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './deck-builder.component.html',
  styleUrl: './deck-builder.component.css'
})
export class DeckBuilderComponent {
  readonly deckService = inject(DeckService);
  readonly cardService = inject(CardService);
  readonly modalService = inject(ModalService);

  quickSearchQuery = '';

  typeEntries(): { key: string; value: number }[] {
    const breakdown = this.deckService.typeBreakdown();
    return Object.keys(breakdown).map(key => ({ key, value: breakdown[key] }));
  }

  getCostPercentage(cost: number): number {
    const curve = this.deckService.costCurve();
    const count = curve[cost] || 0;
    const max = Math.max(...Object.values(curve), 1);
    return (count / max) * 100;
  }

  filteredQuickCards(): Card[] {
    const all = this.cardService.allCards();
    const q = this.quickSearchQuery.trim().toLowerCase();
    if (!q) return all.slice(0, 20);
    return all.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)).slice(0, 20);
  }

  copyDeckList(): void {
    const lines = [
      `=== ${this.deckService.deckName()} (Máscaras vs Cabelleras TCG) ===`,
      `Total Cartas: ${this.deckService.totalCards()}/50`,
      ''
    ];
    for (const item of this.deckService.deckItems()) {
      lines.push(`${item.quantity}x ${item.card.name} (#${item.card.number}) - ${item.card.type}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    alert('¡Lista del mazo copiada al portapapeles!');
  }

  exportDeckFile(): void {
    const json = this.deckService.exportDeck();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.deckService.deckName().toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  triggerImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event: any) => {
          const content = event.target.result;
          const success = this.deckService.importDeck(content);
          if (success) {
            alert('¡Mazo importado con éxito!');
          } else {
            alert('El archivo JSON no tiene un formato de mazo válido.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  clearDeck(): void {
    if (confirm('¿Estás seguro de que deseas vaciar el mazo actual?')) {
      this.deckService.clearDeck();
    }
  }
}
