import { Injectable, computed, signal } from '@angular/core';
import { 
  createClient, 
  SupabaseClient, 
  Session, 
  User, 
  AuthChangeEvent,
  AuthResponse
} from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { UserProfile, UserRole } from '../../domain/models';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private readonly supabaseClient: SupabaseClient;

  // Reactivity with Angular Signals
  readonly session = signal<Session | null>(null);
  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  readonly authInitialized = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);

  // Computed signals
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly userEmail = computed(() => this.currentUser()?.email ?? '');
  readonly userId = computed(() => this.currentUser()?.id ?? '');
  readonly userRole = computed<UserRole>(() => {
    const profile = this.userProfile();
    if (profile?.role) return profile.role;
    // Check app_metadata / user_metadata fallback
    const metaRole = this.currentUser()?.user_metadata?.['role'] || this.currentUser()?.app_metadata?.['role'];
    return (metaRole === 'admin') ? 'admin' : 'jugador';
  });
  readonly isAdmin = computed<boolean>(() => this.userRole() === 'admin');
  readonly userDisplayName = computed(() => {
    const profile = this.userProfile();
    if (profile?.full_name) return profile.full_name;
    const user = this.currentUser();
    if (!user) return '';
    return user.user_metadata?.['full_name'] || user.email?.split('@')[0] || 'Luchador';
  });

  constructor() {
    this.supabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      }
    });

    this.initializeAuth();
  }

  /**
   * Direct access to the Supabase client instance for queries & RPC
   */
  get client(): SupabaseClient {
    return this.supabaseClient;
  }

  private async initializeAuth(): Promise<void> {
    try {
      // 1. Initial session check
      const { data, error } = await this.supabaseClient.auth.getSession();
      if (error) {
        console.warn('Error fetching initial Supabase session:', error.message);
      }
      await this.updateAuthState(data.session);
    } catch (err) {
      console.error('Unexpected error on auth initialization:', err);
    } finally {
      this.authInitialized.set(true);
    }

    // 2. Real-time auth state synchronization
    this.supabaseClient.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      await this.updateAuthState(session);
    });
  }

  private async updateAuthState(session: Session | null): Promise<void> {
    this.session.set(session);
    this.currentUser.set(session?.user ?? null);

    if (session?.user) {
      await this.loadUserProfile(session.user);
    } else {
      this.userProfile.set(null);
    }
  }

  /**
   * Load user profile and role from the 'profiles' table
   */
  async loadUserProfile(user: User): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('Notice loading profile (table may need initial SQL migration):', error.message);
      }

      if (data) {
        const profile = data as UserProfile;
        this.userProfile.set(profile);
        return profile;
      } else {
        // Fallback profile if table is not yet seeded
        const fallback: UserProfile = {
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.['full_name'] || '',
          role: 'jugador'
        };
        this.userProfile.set(fallback);
        return fallback;
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return null;
    }
  }

  /**
   * Ensure auth and profile are initialized before evaluating guards
   */
  async waitForAuthInit(): Promise<boolean> {
    if (this.authInitialized()) {
      return this.isAuthenticated();
    }

    const { data } = await this.supabaseClient.auth.getSession();
    await this.updateAuthState(data.session);
    this.authInitialized.set(true);
    return !!data.session?.user;
  }

  /**
   * Iniciar sesión con Correo y Contraseña
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    this.isLoading.set(true);
    try {
      const response = await this.supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (response.error) throw response.error;
      await this.updateAuthState(response.data.session);
      return response;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Registrar nuevo usuario
   */
  async signUp(email: string, password: string, fullName?: string, stateLocation?: string): Promise<AuthResponse> {
    this.isLoading.set(true);
    try {
      const response = await this.supabaseClient.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName?.trim() || '',
            state_location: stateLocation || '',
            role: 'jugador'
          }
        }
      });

      if (response.error) throw response.error;
      if (response.data.session) {
        await this.updateAuthState(response.data.session);
      }
      return response;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Cerrar sesión
   */
  async signOut(): Promise<void> {
    this.isLoading.set(true);
    try {
      const { error } = await this.supabaseClient.auth.signOut();
      if (error) console.error('Error signing out:', error.message);
      await this.updateAuthState(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Enviar correo de restablecimiento de contraseña
   */
  async resetPassword(email: string): Promise<void> {
    const { error } = await this.supabaseClient.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  }

  /**
   * [ADMIN] Obtener todos los perfiles de usuario
   */
  async getAllProfiles(): Promise<UserProfile[]> {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as UserProfile[]) || [];
  }

  /**
   * [ADMIN] Actualizar rol de un usuario
   */
  async updateUserRole(userId: string, newRole: UserRole): Promise<UserProfile> {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    // If updating current user's role
    if (userId === this.userId()) {
      this.userProfile.update(current => current ? { ...current, role: newRole } : null);
    }

    return data as UserProfile;
  }

  /**
   * Actualizar perfil del usuario autenticado (nombre, estado/región)
   */
  async updateProfile(fullName: string, stateLocation: string): Promise<UserProfile> {
    const user = this.currentUser();
    if (!user) throw new Error('Usuario no autenticado');

    this.isLoading.set(true);
    try {
      // 1. Actualizar tabla profiles
      const { data, error } = await this.supabaseClient
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          state_location: stateLocation,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      // 2. Actualizar metadata de auth
      await this.supabaseClient.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          state_location: stateLocation
        }
      });

      // 3. Sincronizar estado local
      const updatedProfile = data as UserProfile;
      this.userProfile.set(updatedProfile);
      return updatedProfile;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Actualizar contraseña de la cuenta del usuario autenticado
   */
  async updatePassword(newPassword: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const { error } = await this.supabaseClient.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
    } finally {
      this.isLoading.set(false);
    }
  }
}
