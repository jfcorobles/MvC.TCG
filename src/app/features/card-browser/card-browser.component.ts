import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CardService } from '../../application/services/card.service';
import { CardItemComponent } from '../../shared/components/card-item/card-item.component';
import { Card } from '../../domain/models';

@Component({
  selector: 'app-card-browser',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CardItemComponent],
  templateUrl: './card-browser.component.html',
  styleUrl: './card-browser.component.css'
})
export class CardBrowserComponent implements OnInit {
  readonly cardService = inject(CardService);
  private readonly route = inject(ActivatedRoute);

  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly isMobileFiltersOpen = signal<boolean>(false);
  readonly currentPage = signal<number>(1);
  readonly pageSize = 32;

  readonly availableTypes = ['Luchador', 'Castigo', 'Arena', 'Promotor', 'Contrato', 'Objeto'];
  readonly availableStyles = ['Clásico', 'Aéreo', 'Extremo', 'Fantasía', 'Mini'];
  readonly prominentArtists = ['James Darko', 'Araceli Salazar', 'Víctor Chang', 'Neomgon', 'Jack Coatl', 'Sam Purata', 'Akuro', 'Izumi Mortem'];

  ngOnInit(): void {
    // Check route query params (e.g. ?bando=Técnico)
    this.route.queryParams.subscribe(params => {
      if (params['bando']) {
        this.cardService.toggleBandoFilter(params['bando']);
      }
      if (params['type']) {
        this.cardService.toggleTypeFilter(params['type']);
      }
      if (params['set']) {
        this.cardService.toggleSetFilter(params['set']);
      }
    });
  }

  paginatedCards(): Card[] {
    const cards = this.cardService.filteredCards();
    const start = (this.currentPage() - 1) * this.pageSize;
    return cards.slice(start, start + this.pageSize);
  }

  totalPages(): number {
    return Math.ceil(this.cardService.filteredCards().length / this.pageSize) || 1;
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  onSearchChange(query: string): void {
    this.cardService.updateSearchQuery(query);
    this.currentPage.set(1);
  }

  clearSearch(): void {
    this.cardService.updateSearchQuery('');
    this.currentPage.set(1);
  }

  onSortChange(sortBy: any): void {
    this.cardService.setSorting(sortBy, 'asc');
  }

  resetAllFilters(): void {
    this.cardService.resetFilters();
    this.currentPage.set(1);
  }

  toggleMobileFilters(): void {
    this.isMobileFiltersOpen.update(open => !open);
  }
}
