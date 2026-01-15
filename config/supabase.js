const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if(!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase URL or Supbase Key is missing in .env file');
}

// INITIALIZE SUPABASE CLIENT
const supabase = createClient(SUPABASE_URL,SUPABASE_KEY);

module.exports = supabase;