import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  
  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ passwordMismatch: true });
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

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
    'Zacatecas',
    'Extranjero / Fuera de México'
  ];

  // Searchable dropdown state
  readonly isStateDropdownOpen = signal<boolean>(false);
  readonly stateSearchText = signal<string>('');

  // Computed: filtered states
  readonly filteredStates = computed(() => {
    const search = this.stateSearchText().trim().toLowerCase();
    if (!search) return this.statesList;
    return this.statesList.filter(s => s.toLowerCase().includes(search));
  });

  readonly registerForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    stateLocation: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: passwordMatchValidator });

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const dropdownEl = this.elementRef.nativeElement.querySelector('.searchable-dropdown');
    if (dropdownEl && !dropdownEl.contains(target)) {
      this.isStateDropdownOpen.set(false);
    }
  }

  toggleStateDropdown(): void {
    this.isStateDropdownOpen.update(open => !open);
    if (this.isStateDropdownOpen()) {
      this.stateSearchText.set('');
    }
  }

  selectState(state: string): void {
    this.registerForm.patchValue({ stateLocation: state });
    this.registerForm.get('stateLocation')?.markAsTouched();
    this.registerForm.get('stateLocation')?.markAsDirty();
    this.isStateDropdownOpen.set(false);
    this.stateSearchText.set('');
  }

  clearSelectedState(event: MouseEvent): void {
    event.stopPropagation();
    this.registerForm.patchValue({ stateLocation: '' });
    this.registerForm.get('stateLocation')?.markAsTouched();
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { fullName, email, password, stateLocation } = this.registerForm.value;

    try {
      const response = await this.supabase.signUp(email, password, fullName, stateLocation);
      
      // Si la sesión fue iniciada de inmediato (sin confirmación obligatoria de correo)
      if (response.data.session) {
        await this.router.navigate(['/mazo']);
      } else {
        // Confirmación por email requerida
        this.successMessage.set(
          '¡Cuenta creada exitosamente! Hemos enviado un enlace de confirmación a tu correo electrónico. Verifica tu bandeja antes de iniciar sesión.'
        );
        this.registerForm.reset();
      }
    } catch (err: any) {
      console.error('Error during registration:', err);
      let message = 'No se pudo completar el registro.';
      if (err.message?.includes('already registered')) {
        message = 'Este correo electrónico ya está registrado. Prueba iniciando sesión.';
      } else if (err.message?.includes('weak password')) {
        message = 'La contraseña es demasiado débil. Usa al menos 6 caracteres combinando letras y números.';
      } else if (err.message) {
        message = err.message;
      }
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
