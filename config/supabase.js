const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

try {
    dns.setDefaultResultOrder('ipv4first');
} catch (error) {
    console.warn('DNS result order fallback skipped:', error?.message || error);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;

if(!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase URL or key is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_KEY in backend .env');
}

// INITIALIZE SUPABASE CLIENT
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

module.exports = supabase;