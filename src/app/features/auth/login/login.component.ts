import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;

    try {
      await this.supabase.signIn(email, password);
      
      const isAdmin = this.supabase.isAdmin();
      const queryReturnUrl = this.route.snapshot.queryParams['returnUrl'];
      let targetUrl = queryReturnUrl;
      
      if (!targetUrl || targetUrl === '/reportes') {
        targetUrl = isAdmin ? '/admin' : '/mazo';
      }
      
      await this.router.navigateByUrl(targetUrl);
    } catch (err: any) {
      console.error('Error during login:', err);
      let message = 'Credenciales inválidas o error de conexión.';
      if (err.message?.includes('Invalid login credentials')) {
        message = 'Correo o contraseña incorrectos. Verifica tus datos.';
      } else if (err.message?.includes('Email not confirmed')) {
        message = 'Tu cuenta aún no ha sido confirmada. Revisa tu bandeja de entrada.';
      }
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
