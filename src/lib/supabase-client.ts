

/**
 * Client Supabase.
 *
 * Sostituisci SUPABASE_URL e SUPABASE_ANON_KEY con i valori
 * del tuo progetto (li trovi in Settings > API sulla dashboard).
 *
 * Quando avrete Vite attivo, spostate i valori in un file .env:
 *   VITE_SUPABASE_URL=https://xxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbG...
 * e leggete con import.meta.env.VITE_SUPABASE_URL
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lekkiacgjhjdhfzztpwd.supabase.co';       // ← sostituisci
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla2tpYWNnamhqZGhmenp0cHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjA3OTMsImV4cCI6MjA4NjAzNjc5M30.69UEjEoyV-v6ZYR4QgsyVusQhtWesCEA_EEizHSEyHg';                        // ← sostituisci

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);