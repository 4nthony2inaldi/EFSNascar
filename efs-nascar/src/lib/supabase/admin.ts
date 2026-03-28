import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Admin client that uses service role key to bypass RLS
// Use this for server-side admin operations only

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function createAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY === '') {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set - falling back to anon key behavior')
    // Return null to signal that admin client isn't available
    return null
  }

  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
