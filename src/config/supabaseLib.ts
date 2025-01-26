import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config()

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // Use service role key instead of anon key
  {
    auth: {
      persistSession: false
    }
  }
);

export default supabase;