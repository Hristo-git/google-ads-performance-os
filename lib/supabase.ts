import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ CRITICAL ERROR: Missing Supabase environment variables during initialization!");
  if (!supabaseUrl) console.error("   - Missing SUPABASE_URL");
  if (!supabaseServiceKey) console.error("   - Missing SUPABASE_SERVICE_ROLE_KEY");
}

// Server-side Supabase client with service role for admin operations
// Use empty string fallback to prevent crash during module evaluation, but calls will fail
export const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Types for our tables
export interface GadsUser {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  email: string | null;
  role: 'admin' | 'viewer';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GadsUserAccount {
  id: string;
  user_id: string;
  account_id: string;
  created_at: string;
}

// Helper functions for user management
export async function getUserByUsername(username: string): Promise<GadsUser | null> {
  console.log('[Supabase] Fetching user:', username);
  const { data, error } = await supabaseAdmin
    .from('gads_users')
    .select('*')
    .eq('username', username)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('[Supabase] Error fetching user:', error.message, error.details, error.code);
    return null;
  }

  if (!data) {
    console.warn('[Supabase] User not found or inactive:', username);
    return null;
  }

  return data as GadsUser;
}

export async function verifyPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  // Use Supabase's pgcrypto to verify the password
  console.log('[Supabase] Verifying password for hash length:', storedHash?.length);

  const { data, error } = await supabaseAdmin.rpc('verify_password', {
    input_password: inputPassword,
    stored_hash: storedHash
  });

  if (error) {
    console.error('[Supabase] Password verification PRC error:', error);
    return false;
  }

  console.log('[Supabase] Verification result:', data);
  return data === true;
}

export async function getUserAllowedAccounts(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('gads_user_accounts')
    .select('account_id')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data.map(row => row.account_id);
}

export async function getAllUsers(): Promise<GadsUser[]> {
  const { data, error } = await supabaseAdmin
    .from('gads_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }

  return data as GadsUser[];
}

export async function createUser(user: {
  username: string;
  password: string;
  name: string;
  email?: string;
  role: 'admin' | 'viewer';
  allowedAccountIds: string[];
}): Promise<GadsUser> {
  // Hash password using pgcrypto
  const { data: hashData, error: hashError } = await supabaseAdmin.rpc('hash_password', {
    password: user.password
  });

  if (hashError) {
    console.error('Error hashing password:', hashError);
    throw new Error(`Password hashing failed: ${hashError.message}`);
  }

  // Insert user
  const { data: userData, error: userError } = await supabaseAdmin
    .from('gads_users')
    .insert({
      username: user.username,
      password_hash: hashData,
      name: user.name,
      email: user.email || null,
      role: user.role
    })
    .select()
    .single();

  if (userError || !userData) {
    console.error('Error creating user:', userError);
    if (userError?.code === '23505') {
      throw new Error('Username already exists');
    }
    throw new Error(userError?.message || 'Unknown database error');
  }

  // Insert account access
  if (user.allowedAccountIds.length > 0) {
    const accountRows = user.allowedAccountIds.map(accountId => ({
      user_id: userData.id,
      account_id: accountId
    }));

    const { error: accountsError } = await supabaseAdmin.from('gads_user_accounts').insert(accountRows);
    if (accountsError) {
      console.error('Error setting account access:', accountsError);
      // We don't throw here to at least keep the user, but maybe we should?
      // Let's at least log it.
    }
  }

  return userData as GadsUser;
}

export async function updateUser(userId: string, updates: {
  name?: string;
  email?: string;
  role?: 'admin' | 'viewer';
  password?: string;
  is_active?: boolean;
}): Promise<boolean> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (updates.name) updateData.name = updates.name;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.role) updateData.role = updates.role;
  if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

  // If password is being updated, hash it first
  if (updates.password) {
    const { data: hashData, error: hashError } = await supabaseAdmin.rpc('hash_password', {
      password: updates.password
    });

    if (hashError) {
      console.error('Error hashing password:', hashError);
      return false;
    }

    updateData.password_hash = hashData;
  }

  const { error } = await supabaseAdmin
    .from('gads_users')
    .update(updateData)
    .eq('id', userId);

  return !error;
}

export async function updateUserAccounts(userId: string, accountIds: string[]): Promise<boolean> {
  // Delete existing accounts
  await supabaseAdmin
    .from('gads_user_accounts')
    .delete()
    .eq('user_id', userId);

  // Insert new accounts
  if (accountIds.length > 0) {
    const accountRows = accountIds.map(accountId => ({
      user_id: userId,
      account_id: accountId
    }));

    const { error } = await supabaseAdmin.from('gads_user_accounts').insert(accountRows);
    return !error;
  }

  return true;
}

export async function deleteUser(userId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('gads_users')
    .delete()
    .eq('id', userId);

  return !error;
}

// ============================================
// QS & Ad Strength Snapshots
// ============================================

export interface QSSnapshot {
  customer_id: string;
  keyword_id: string;
  ad_group_id: string;
  quality_score: number | null;
  expected_ctr: string;
  landing_page_experience: string;
  ad_relevance: string;
  snapshot_date: string;
}

export interface AdStrengthSnapshot {
  customer_id: string;
  ad_id: string;
  ad_group_id: string;
  ad_strength: string;
  snapshot_date: string;
}

/** Upsert keyword QS snapshots for a given customer + date (batched) */
export async function saveQSSnapshots(snapshots: QSSnapshot[]): Promise<{ saved: number; error?: string }> {
  if (snapshots.length === 0) return { saved: 0 };

  const BATCH_SIZE = 500;
  let totalSaved = 0;

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from('gads_qs_snapshots')
      .upsert(batch, { onConflict: 'customer_id,keyword_id,snapshot_date' });

    if (error) {
      console.error(`[Snapshots] QS upsert error (batch ${i / BATCH_SIZE}):`, error.message, error.details, error.code);
      return { saved: totalSaved, error: `${error.message} (code: ${error.code})` };
    }
    totalSaved += batch.length;
  }

  return { saved: totalSaved };
}

/** Upsert ad strength snapshots for a given customer + date (batched) */
export async function saveAdStrengthSnapshots(snapshots: AdStrengthSnapshot[]): Promise<{ saved: number; error?: string }> {
  if (snapshots.length === 0) return { saved: 0 };

  const BATCH_SIZE = 500;
  let totalSaved = 0;

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from('gads_ad_strength_snapshots')
      .upsert(batch, { onConflict: 'customer_id,ad_id,snapshot_date' });

    if (error) {
      console.error(`[Snapshots] Ad Strength upsert error (batch ${i / BATCH_SIZE}):`, error.message, error.details, error.code);
      return { saved: totalSaved, error: `${error.message} (code: ${error.code})` };
    }
    totalSaved += batch.length;
  }

  return { saved: totalSaved };
}

/**
 * Get QS snapshots closest to a target date (within ±7 days).
 * Returns the snapshot_date that is nearest to targetDate.
 */
export async function getQSSnapshotsForDate(
  customerId: string,
  targetDate: string
): Promise<QSSnapshot[]> {
  // Find the closest snapshot date within ±7 days
  const target = new Date(targetDate);
  const from = new Date(target); from.setDate(from.getDate() - 7);
  const to = new Date(target); to.setDate(to.getDate() + 7);

  const { data, error } = await supabaseAdmin
    .from('gads_qs_snapshots')
    .select('*')
    .eq('customer_id', customerId)
    .gte('snapshot_date', from.toISOString().split('T')[0])
    .lte('snapshot_date', to.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: false });

  if (error || !data || data.length === 0) return [];

  // Group by snapshot_date, pick the one closest to targetDate
  const targetTime = target.getTime();
  let bestDate = data[0].snapshot_date;
  let bestDiff = Math.abs(new Date(bestDate).getTime() - targetTime);

  for (const row of data) {
    const diff = Math.abs(new Date(row.snapshot_date).getTime() - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestDate = row.snapshot_date;
    }
  }

  return data.filter(r => r.snapshot_date === bestDate) as QSSnapshot[];
}

/** Get Ad Strength snapshots closest to a target date (within ±7 days). */
export async function getAdStrengthSnapshotsForDate(
  customerId: string,
  targetDate: string
): Promise<AdStrengthSnapshot[]> {
  const target = new Date(targetDate);
  const from = new Date(target); from.setDate(from.getDate() - 7);
  const to = new Date(target); to.setDate(to.getDate() + 7);

  const { data, error } = await supabaseAdmin
    .from('gads_ad_strength_snapshots')
    .select('*')
    .eq('customer_id', customerId)
    .gte('snapshot_date', from.toISOString().split('T')[0])
    .lte('snapshot_date', to.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: false });

  if (error || !data || data.length === 0) return [];

  const targetTime = target.getTime();
  let bestDate = data[0].snapshot_date;
  let bestDiff = Math.abs(new Date(bestDate).getTime() - targetTime);

  for (const row of data) {
    const diff = Math.abs(new Date(row.snapshot_date).getTime() - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestDate = row.snapshot_date;
    }
  }

  return data.filter(r => r.snapshot_date === bestDate) as AdStrengthSnapshot[];
}
