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

  // IMPORTANT: Only react to actual sign-in / sign-out events.
  // TOKEN_REFRESHED fires on tab-focus after the JWT refresh and would
  // otherwise trigger a profile fetch that can hang in a backgrounded tab.
  // We also don't use `async` on the callback — Supabase's auth state
  // machine blocks on async callbacks, which can lock up the whole auth
  // system if a profile fetch hangs.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      currentUser = null;
      return;
    }

    if (event === 'SIGNED_IN') {
      // Fire and forget — don't block the auth state machine
      loadProfile(session.user).then((u) => { currentUser = u; }).catch(() => {});
      return;
    }

    // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, etc. — ignore.
    // The user is already loaded; the token refresh is transparent.
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