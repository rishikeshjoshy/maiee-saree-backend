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
const projectRef = String(SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0];

function getTokenRef(token) {
    try {
        const payload = String(token || '').split('.')[1];
        if (!payload) return null;
        const decoded = Buffer.from(payload, 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded);
        return parsed?.ref || null;
    } catch {
        return null;
    }
}

function pickMatchingKey() {
    const candidates = [
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        process.env.SUPABASE_KEY,
        process.env.SUPABASE_ANON_KEY,
    ].filter(Boolean);

    const matched = candidates.find((candidate) => getTokenRef(candidate) === projectRef);
    return matched || candidates[0] || null;
}

const SUPABASE_KEY = pickMatchingKey();

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