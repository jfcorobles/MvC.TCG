import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { DeckService } from '../../application/services/deck.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly supabase = inject(SupabaseService);
  readonly deckService = inject(DeckService);

  readonly statesList: string[] = [
    'Aguascalientes',
    'Baja California',
    'Baja California Sur',
    'Campeche',
    'Chiapas',
    'Chihuahua',
    'Ciudad de México (CDMX)',
    'Coahuila',
    'Colima',
    'Durango',
    'Estado de México',
    'Guanajuato',
    'Guerrero',
    'Hidalgo',
    'Jalisco',
    'Michoacán',
    'Morelos',
    'Nayarit',
    'Nuevo León',
    'Oaxaca',
    'Puebla',
    'Querétaro',
    'Quintana Roo',
    'San Luis Potosí',
    'Sinaloa',
    'Sonora',
    'Tabasco',
    'Tamaulipas',
    'Tlaxcala',
    'Veracruz',
    'Yucatán',
    'Zacatecas'
  ];

  // Forms
  readonly profileForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    stateLocation: ['', [Validators.required]]
  });

  readonly passwordForm: FormGroup = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  // State
  readonly isSavingProfile = signal<boolean>(false);
  readonly profileSuccess = signal<string | null>(null);
  readonly profileError = signal<string | null>(null);

  readonly isSavingPassword = signal<boolean>(false);
  readonly passwordSuccess = signal<string | null>(null);
  readonly passwordError = signal<string | null>(null);

  ngOnInit(): void {
    this.populateUserData();
  }

  populateUserData(): void {
    const profile = this.supabase.userProfile();
    if (profile) {
      this.profileForm.patchValue({
        fullName: profile.full_name || '',
        stateLocation: profile.state_location || ''
      });
    }
  }

  async onSaveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSavingProfile.set(true);
    this.profileSuccess.set(null);
    this.profileError.set(null);

    const { fullName, stateLocation } = this.profileForm.value;

    try {
      await this.supabase.updateProfile(fullName, stateLocation);
      this.profileSuccess.set('¡Tu perfil ha sido actualizado correctamente!');
      setTimeout(() => this.profileSuccess.set(null), 4000);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      this.profileError.set(err.message || 'No se pudo actualizar el perfil.');
    } finally {
      this.isSavingProfile.set(false);
    }
  }

  async onSavePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { newPassword, confirmPassword } = this.passwordForm.value;

    if (newPassword !== confirmPassword) {
      this.passwordError.set('Las contraseñas no coinciden. Verifica tus datos.');
      return;
    }

    this.isSavingPassword.set(true);
    this.passwordSuccess.set(null);
    this.passwordError.set(null);

    try {
      await this.supabase.updatePassword(newPassword);
      this.passwordSuccess.set('¡Tu contraseña ha sido cambiada exitosamente!');
      this.passwordForm.reset();
      setTimeout(() => this.passwordSuccess.set(null), 4000);
    } catch (err: any) {
      console.error('Error updating password:', err);
      this.passwordError.set(err.message || 'Error al cambiar la contraseña. Asegúrate de tener una sesión activa.');
    } finally {
      this.isSavingPassword.set(false);
    }
  }

  isProfileInvalid(field: string): boolean {
    const ctrl = this.profileForm.get(field);
    return !!(ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched));
  }

  isPasswordInvalid(field: string): boolean {
    const ctrl = this.passwordForm.get(field);
    return !!(ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched));
  }
}
