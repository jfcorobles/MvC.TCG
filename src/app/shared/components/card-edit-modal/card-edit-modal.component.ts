import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CardEditService } from '../../../application/services/card-edit.service';
import { CardService } from '../../../application/services/card.service';
import { Card } from '../../../domain/models';

@Component({
  selector: 'app-card-edit-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './card-edit-modal.component.html',
  styleUrl: './card-edit-modal.component.css'
})
export class CardEditModalComponent {
  readonly cardEditService = inject(CardEditService);
  private readonly cardService = inject(CardService);
  private readonly fb = inject(FormBuilder);

  readonly isSaving = signal<boolean>(false);
  readonly toastSuccess = signal<string | null>(null);

  readonly cardForm: FormGroup = this.fb.group({
    id: ['', [Validators.required]],
    number: ['', [Validators.required]],
    name: ['', [Validators.required]],
    type: ['', [Validators.required]],
    cost: [null],
    strength: [null],
    bando: [''],
    style: [''],
    rarity: ['Novato', [Validators.required]],
    artist: [''],
    set: ['Primera Edición', [Validators.required]],
    setId: ['ed1', [Validators.required]],
    image: ['', [Validators.required]],
    effect: [''],
    rawDescription: ['']
  });

  constructor() {
    effect(() => {
      const card = this.cardEditService.selectedCard();
      if (card) {
        this.cardForm.patchValue({
          id: card.id,
          number: card.number,
          name: card.name,
          type: card.type,
          cost: card.cost,
          strength: card.strength,
          bando: card.bando || '',
          style: card.style || '',
          rarity: card.rarity,
          artist: card.artist || '',
          set: card.set,
          setId: card.setId,
          image: card.image,
          effect: card.effect || '',
          rawDescription: card.rawDescription || ''
        });
      }
    });
  }

  get card(): Card | null {
    return this.cardEditService.selectedCard();
  }

  close(): void {
    this.cardEditService.close();
  }

  async save(): Promise<void> {
    if (this.cardForm.invalid) {
      this.cardForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const formVal = this.cardForm.value;
    const cardId = formVal.id;

    try {
      const updates: Partial<Card> = {
        name: formVal.name.trim(),
        number: formVal.number.trim(),
        type: formVal.type.trim(),
        cost: formVal.cost !== null && formVal.cost !== '' ? Number(formVal.cost) : null,
        strength: formVal.strength !== null && formVal.strength !== '' ? Number(formVal.strength) : null,
        bando: formVal.bando || '',
        style: formVal.style || '',
        rarity: formVal.rarity,
        artist: formVal.artist || '',
        set: formVal.set,
        setId: formVal.setId,
        image: formVal.image,
        effect: formVal.effect ? formVal.effect.trim() : null,
        rawDescription: formVal.rawDescription || ''
      };

      await this.cardService.updateCard(cardId, updates);
      this.showToast(`¡Carta "${updates.name}" guardada con éxito!`);
      setTimeout(() => {
        this.close();
      }, 1000);
    } catch (err: any) {
      console.error('Error saving card to Supabase:', err);
      alert('Error al guardar en Supabase: ' + (err.message || 'Verifica permisos de admin.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private showToast(msg: string): void {
    this.toastSuccess.set(msg);
    setTimeout(() => this.toastSuccess.set(null), 3500);
  }
}
