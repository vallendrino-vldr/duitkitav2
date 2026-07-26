import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

import { config } from '../config';

// Service Role Key: dipakai hanya di server untuk mencari email dari username.
const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
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
