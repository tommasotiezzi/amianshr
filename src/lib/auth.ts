/**
 * Autenticazione via Supabase Auth + profilo utente con ruolo.
 */

import { supabase } from './supabase-client';
import type { UserRole } from './database-types';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

let currentUser: User | null = null;

/**
 * Inizializza l'auth: controlla sessione attiva e carica profilo.
 * Chiamare UNA volta all'avvio dell'app (in main.ts).
 */
export async function initAuth(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();

  if (data.session?.user) {
    currentUser = await loadProfile(data.session.user);
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = await loadProfile(session.user);
    } else {
      currentUser = null;
    }
  });

  return currentUser;
}

export function isAuthenticated(): boolean {
  return currentUser !== null;
}

export function isAdmin(): boolean {
  return currentUser?.role === 'admin';
}

export function getUser(): User | null {
  return currentUser;
}

export async function login(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Login fallito');

  currentUser = await loadProfile(data.user);
  return currentUser;
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
  currentUser = null;
}

/**
 * Carica il profilo dalla tabella profiles.
 * Se non esiste (non dovrebbe succedere grazie al trigger), usa i dati base.
 */
async function loadProfile(user: { id: string; email?: string }): Promise<User> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? '',
    name: (profile?.full_name as string) ?? user.email?.split('@')[0] ?? 'Utente',
    role: (profile?.role as UserRole) ?? 'candidate',
  };
}