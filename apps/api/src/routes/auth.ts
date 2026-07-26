import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase with Service Role Key for admin privileges
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

router.post('/lookup', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Lookup the profile by username
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', username)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return the associated email
    return res.json({ email: profile.email });
  } catch (error) {
    console.error('Error in username lookup:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
