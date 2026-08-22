import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DeckService } from '../../application/services/deck.service';
import { CardService } from '../../application/services/card.service';
import { ModalService } from '../../application/services/modal.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Card, SavedDeck, HandSimulation } from '../../domain/models';

@Component({
  selector: 'app-deck-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './deck-builder.component.html',
  styleUrl: './deck-builder.component.css'
})
export class DeckBuilderComponent implements OnInit {
  readonly deckService = inject(DeckService);
  readonly cardService = inject(CardService);
  readonly modalService = inject(ModalService);
  readonly supabase = inject(SupabaseService);

  // Active Tab
  readonly activeTab = signal<'editor' | 'stats' | 'hub'>('editor');

  // Search & Filter
  quickSearchQuery = '';
  communitySearchQuery = '';

  // Cloud Save Modal
  readonly isCloudSaveModalOpen = signal<boolean>(false);
  saveDeckTitle = '';
  saveDeckDesc = '';
  saveDeckIsPublic = false;
  saveToast = signal<string | null>(null);

  // Saved Decks Drawer
  readonly isSavedDecksDrawerOpen = signal<boolean>(false);

  // Hand Simulator Modal
  readonly isSimulatorModalOpen = signal<boolean>(false);
  readonly simulationState = signal<HandSimulation | null>(null);

  // Poster Social Modal
  readonly isPosterModalOpen = signal<boolean>(false);
  readonly posterDataUrl = signal<string | null>(null);
  readonly isGeneratingPoster = signal<boolean>(false);

  async ngOnInit(): Promise<void> {
    if (this.supabase.isAuthenticated()) {
      await this.deckService.loadUserDecks();
    }
  }

  // --- Tab Switching ---

  setTab(tab: 'editor' | 'stats' | 'hub'): void {
    this.activeTab.set(tab);
    if (tab === 'hub') {
      this.deckService.loadPublicDecks(this.communitySearchQuery);
    }
  }

  // --- Quick Card Search ---

  filteredQuickCards(): Card[] {
    const all = this.cardService.allCards();
    const q = this.quickSearchQuery.trim().toLowerCase();
    if (!q) return all.slice(0, 24);
    return all.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.type.toLowerCase().includes(q) ||
      (c.bando && c.bando.toLowerCase().includes(q)) ||
      (c.style && c.style.toLowerCase().includes(q))
    ).slice(0, 24);
  }

  // --- Cloud Deck Save & Management ---

  openCloudSaveModal(): void {
    if (!this.supabase.isAuthenticated()) {
      alert('Debes iniciar sesión para guardar mazos en la nube.');
      return;
    }
    this.saveDeckTitle = this.deckService.deckName();
    this.saveDeckDesc = this.deckService.deckDescription();
    this.saveDeckIsPublic = this.deckService.isPublic();
    this.isCloudSaveModalOpen.set(true);
  }

  closeCloudSaveModal(): void {
    this.isCloudSaveModalOpen.set(false);
  }

  async confirmSaveToCloud(): Promise<void> {
    if (!this.saveDeckTitle.trim()) {
      alert('El mazo debe tener un nombre.');
      return;
    }

    this.deckService.setDeckName(this.saveDeckTitle);
    this.deckService.setDeckDescription(this.saveDeckDesc);
    this.deckService.isPublic.set(this.saveDeckIsPublic);

    try {
      await this.deckService.saveActiveDeckToCloud();
      this.saveToast.set('¡Mazo guardado en la nube con éxito!');
      setTimeout(() => {
        this.saveToast.set(null);
        this.closeCloudSaveModal();
      }, 1500);
    } catch (err: any) {
      alert(`Error al guardar mazo: ${err.message || err}`);
    }
  }

  openSavedDecksDrawer(): void {
    if (!this.supabase.isAuthenticated()) {
      alert('Debes iniciar sesión para ver tus mazos guardados.');
      return;
    }
    this.deckService.loadUserDecks();
    this.isSavedDecksDrawerOpen.set(true);
  }

  closeSavedDecksDrawer(): void {
    this.isSavedDecksDrawerOpen.set(false);
  }

  loadDeck(deck: SavedDeck): void {
    this.deckService.loadSavedDeckIntoActive(deck, this.cardService.allCards());
    this.closeSavedDecksDrawer();
    this.setTab('editor');
  }

  async deleteSavedDeck(deck: SavedDeck, event: Event): Promise<void> {
    event.stopPropagation();
    if (confirm(`¿Eliminar permanentemente el mazo "${deck.name}" de la nube?`)) {
      await this.deckService.deleteSavedDeck(deck.id);
    }
  }

  newDeck(): void {
    if (this.deckService.deckItems().length > 0) {
      if (!confirm('¿Crear un nuevo mazo? Los cambios no guardados en la nube se perderán.')) {
        return;
      }
    }
    this.deckService.clearDeck();
    this.setTab('editor');
  }

  // --- Deck Hub (Community) ---

  onCommunitySearch(): void {
    this.deckService.loadPublicDecks(this.communitySearchQuery);
  }

  async toggleLike(deck: SavedDeck, event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.supabase.isAuthenticated()) {
      alert('Inicia sesión para dar Me Gusta a los mazos.');
      return;
    }
    await this.deckService.toggleDeckLike(deck.id);
  }

  cloneDeck(deck: SavedDeck): void {
    this.deckService.clonePublicDeck(deck, this.cardService.allCards());
    alert(`¡Mazo "${deck.name}" clonado con éxito a tu constructor! Puedes guardarlo en tu cuenta.`);
    this.setTab('editor');
  }

  // --- Hand Simulator (Playtest) ---

  openSimulator(): void {
    if (this.deckService.totalCards() === 0) {
      alert('Agrega cartas a tu mazo antes de probar el simulador.');
      return;
    }
    this.simulationState.set(this.deckService.initHandSimulation());
    this.isSimulatorModalOpen.set(true);
  }

  closeSimulator(): void {
    this.isSimulatorModalOpen.set(false);
  }

  mulligan(): void {
    this.simulationState.set(this.deckService.initHandSimulation());
  }

  drawTurn(): void {
    const current = this.simulationState();
    if (current) {
      this.simulationState.set(this.deckService.simulateDrawTurn(current));
    }
  }

  // --- Social Poster (Canvas) ---

  async openPosterModal(): Promise<void> {
    if (this.deckService.totalCards() === 0) {
      alert('Agrega cartas a tu mazo para generar el póster.');
      return;
    }
    this.isGeneratingPoster.set(true);
    this.isPosterModalOpen.set(true);

    try {
      const profile = this.supabase.userProfile();
      const authorName = profile?.full_name || this.supabase.userDisplayName() || 'Luchador Oficial';
      const authorState = profile?.state_location || '';
      const url = await this.deckService.generateDeckPosterDataUrl(authorName, authorState);
      this.posterDataUrl.set(url);
    } catch (err) {
      console.error('Error generando póster:', err);
      alert('No se pudo generar la imagen del póster.');
      this.closePosterModal();
    } finally {
      this.isGeneratingPoster.set(false);
    }
  }

  closePosterModal(): void {
    this.isPosterModalOpen.set(false);
    this.posterDataUrl.set(null);
  }

  downloadPoster(): void {
    const url = this.posterDataUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `mvc_mazo_${this.deckService.deckName().toLowerCase().replace(/\s+/g, '_')}.png`;
    a.click();
  }

  // --- Standard Utilities ---

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
}
