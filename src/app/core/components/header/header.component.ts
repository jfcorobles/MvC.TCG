import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DeckService } from '../../../application/services/deck.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  readonly deckService = inject(DeckService);
  readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isMobileMenuOpen = signal<boolean>(false);
  readonly isUserDropdownOpen = signal<boolean>(false);

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update(open => !open);
    if (this.isMobileMenuOpen()) {
      this.isUserDropdownOpen.set(false);
    }
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  toggleUserDropdown(event: Event): void {
    event.stopPropagation();
    this.isUserDropdownOpen.update(open => !open);
  }

  closeUserDropdown(): void {
    this.isUserDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isUserDropdownOpen.set(false);
      this.isMobileMenuOpen.set(false);
    }
  }

  async logout(): Promise<void> {
    this.closeMobileMenu();
    this.closeUserDropdown();
    await this.supabase.signOut();
    await this.router.navigate(['/']);
  }
}
