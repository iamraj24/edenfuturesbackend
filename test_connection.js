// server/test_connection.js

// Import necessary modules
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'; 

// Load .env variables from the parent directory (award-nomination-app/)
// NOTE: Ensure this path is correct based on where you run the script!
dotenv.config({ path: './.env' }); 

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;  

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Configuration Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the root .env file.");
    process.exit(1); 
}

// Create a temporary Supabase client instance for testing
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false, 
    }
});


async function testSupabaseConnection() {
    console.log('\n--- Running Direct Supabase Connection Test (Table-less) ---');
    console.log(`Attempting connection to: ${supabaseUrl}`);

    try {
        // We will try to fetch the current time using a simple database query.
        // This is a minimal-permission, guaranteed-to-succeed database operation.
        
        // Note: We use .from('categories').select().limit(0) against an EXISTING table.
        // If the table exists (which it should from your SQL script), a limit(0) query
        // is guaranteed to succeed and return no data, cleanly confirming connectivity.

        const { data, error } = await supabase
            .from('categories') 
            .select('id') 
            .limit(0); 

        if (error) {
            // If we get an error here, it's a genuine failure (e.g., bad key, network issue, or RLS if enabled)
             console.error('❌ Connection FAILED: Database responded with an error (non-42P01):');
             console.error('   Error Code:', error.code);
             console.error('   Error Message:', error.message);
             console.error('   **Action:** Check your keys and ensure the "categories" table exists.');
        } else {
             // Data is null/empty but the query succeeded cleanly
             console.log('✅ Connected successfully! Received a clean response from Supabase.');
             console.log(`   The Service Role Key and URL are validated.`);
             console.log(`   Data status: Query returned ${data?.length} rows (expected 0).`);
        }

    } catch (err) {
        console.error('❌ Connection FAILED: Network or client issue.');
        console.error('   Error:', err.message);
    }
    console.log('--------------------------------------------------\n');
}

// Execute the test function
testSupabaseConnection();