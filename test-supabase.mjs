import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing supabase env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFetch() {
  const { data, error } = await supabase.from('clients').select('*');
  if (error) {
    console.error("Fetch Error:", JSON.stringify(error, null, 2));
    console.error("Raw Error:", error);
  } else {
    console.log("Fetch Success:", data);
  }
}

testFetch();
