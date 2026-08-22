import { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'jugador';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  state_location?: string;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
}

