import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// Need Service Role Key for these admin operations
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

router.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;
    
    // ON DELETE CASCADE in Postgres schema will wipe their data
    res.json({ success: true, message: 'User and all associated data deleted successfully.' });
  } catch (error: any) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/storage', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.storage.from('receipts').list('', { limit: 10000 });
    
    if (error) throw error;

    let totalBytes = 0;
    if (data) {
      data.forEach(file => {
        if (file.metadata && file.metadata.size) {
          totalBytes += file.metadata.size;
        }
      });
    }

    const totalMB = totalBytes / (1024 * 1024);
    res.json({ totalMB });
  } catch (error: any) {
    console.error('Failed to calculate storage:', error);
    res.status(500).json({ error: 'Failed to calculate storage limit' });
  }
});

export default router;
