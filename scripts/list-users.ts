
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('--- CONNECTION DEBUG ---');
console.log('Using Supabase URL:', supabaseUrl);
console.log('Project ID (from URL):', supabaseUrl.split('.')[0].replace('https://', ''));
console.log('------------------------');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listUsers() {
    console.log('Fetching all users...');

    const { data: users, error } = await supabase
        .from('gads_users')
        .select('id, username, role, is_active, created_at');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    if (users && users.length > 0) {
        console.log(`Found ${users.length} users:`);
        console.table(users);
    } else {
        console.log('No users found in database!');
    }
}

listUsers();
