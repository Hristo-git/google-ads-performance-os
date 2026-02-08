
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Manually load .env.local to be sure
const envPath = path.resolve(process.cwd(), '.env.local');
console.log('Loading env from:', envPath);

if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} else {
    console.error('.env.local not found at:', envPath);
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase variables in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAdmin() {
    console.log('Checking for "admin" user...');

    // Check user existence
    const { data: user, error } = await supabase
        .from('gads_users')
        .select('*')
        .eq('username', 'admin')
        .single();

    if (error) {
        console.error('Error fetching user:', error.message);
        return;
    }

    if (user) {
        console.log('✅ User "admin" FOUND.');
        console.log('ID:', user.id);

        // Reset password to 'admin'
        console.log('Resetting password to "admin"...');

        const { data: newHash, error: hashError } = await supabase.rpc('hash_password', {
            password: 'admin'
        });

        if (hashError) {
            console.error('Error hashing password:', hashError);
            return;
        }

        const { error: updateError } = await supabase
            .from('gads_users')
            .update({ password_hash: newHash })
            .eq('id', user.id);

        if (updateError) {
            console.error('Error updating user password:', updateError);
        } else {
            console.log('✅ Password successfully reset to "admin".');
        }

        // Verify again
        const { data: isValid, error: rpcError } = await supabase.rpc('verify_password', {
            input_password: 'admin',
            stored_hash: newHash
        });

        if (rpcError) {
            console.error('RPC Error during verification:', rpcError.message);
        } else {
            console.log('Password "admin" is valid now:', isValid);
        }

    } else {
        console.error('❌ User "admin" NOT FOUND.');
    }
}

checkAdmin();
