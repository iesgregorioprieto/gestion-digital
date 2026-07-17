import { createClient } from '@supabase/supabase-js';

// Cliente único compartido por toda la app.
// Evita el warning "Multiple GoTrueClient instances" que causa
// comportamiento no determinista al competir por el mismo auth token.

let _supabase = null;

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'ies-prieto-auth',
        },
      }
    );
  }
  return _supabase;
}
