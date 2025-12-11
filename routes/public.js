import express from 'express';
import { supabase } from '../supabase.js';

const publicRouter = express.Router();

// GET /api/public/categories-nominees - Get all categories with ONLY the linked nominees attached
publicRouter.get('/categories-nominees', async (req, res) => {
    try {
        // 1. Fetch all active categories and perform a JOIN to get the linked nominees.
        // FIX: Removed comments from the select string to prevent PGRST100 error.
        const { data: categoriesWithNominees, error: fetchErr } = await supabase
            .from('categories')
            .select(`
                id, 
                name, 
                description,
                nominations( 
                    nominee:nominee_id ( id, name ) 
                )
            `)
            .eq('is_active', true)
            .order('name', { ascending: true });
        
        if (fetchErr) throw fetchErr;

        // 2. Transform the data into the final desired structure for the frontend
        const finalData = (categoriesWithNominees || []).map(category => {
            // Extract the nominee list from the nested 'nominations' array.
            // Defensive: Filter out any null links or null nominees that might be returned.
            const nomineesInCat = (category.nominations || [])
                .map(link => link.nominee)
                .filter(nominee => nominee && nominee.id); // Ensure the nominee object exists and is valid

            return {
                id: category.id,
                name: category.name,
                description: category.description,
                // Assign ONLY the relevant nominees to this category
                nominees: nomineesInCat
            };
        });
        
        res.json(finalData);

    } catch (error) {
        console.error('Error fetching categories and nominees (M:M):', error);
        // Include the actual error object in the response for better debugging
        res.status(500).json({ message: 'Failed to load voting data.', error: error.message || error });
    }
});

// POST /api/public/signin - Voter registration/check
publicRouter.post('/signin', async (req, res) => {
    const { name, email, phone } = req.body;

    // 1. Check for existing voter using ONLY the email address
    let { data: voter, error: selectError } = await supabase
        .from('voters')
        .select('id')
        .eq('email', email)
        .maybeSingle(); 

    if (selectError) {
        console.error('SUPABASE SELECT ERROR on /signin:', selectError); 
        return res.status(500).json({ message: 'Failed to check voter existence.' });
    }

    let voterId;
    if (voter) {
        voterId = voter.id;
    } else {
        const { data: newVoter, error: insertError } = await supabase
            .from('voters')
            .insert([{ name, email, phone }])
            .select('id')
            .single();
        
        if (insertError) {
            console.error('SUPABASE INSERT ERROR on /signin:', insertError); 
            // In a real app, check for unique constraint errors on email
            return res.status(500).json({ message: 'Failed to register voter due to a server error.' });
        }
        voterId = newVoter.id;
    }

    res.status(200).json({ voterId, message: 'Sign-in successful.' });
});

// GET /api/public/voter-votes/:voterId - Get all existing votes for a specific voter
publicRouter.get('/voter-votes/:voterId', async (req, res) => {
    const { voterId } = req.params;

    const { data, error } = await supabase
        .from('votes')
        .select('category_id, nominee_id')
        .eq('voter_id', voterId);

    if (error) {
        console.error('Error fetching voter votes:', error);
        return res.status(500).json({ message: 'Failed to retrieve past votes.' });
    }

    res.json(data);
});

// POST /api/public/vote - Record a vote
publicRouter.post('/vote', async (req, res) => {
    const { voterId, categoryId, nomineeId } = req.body;

    // CRITICAL VALIDATION: Check if the nominee is actually nominated in the category
    const { count: isNominated, error: checkNominationError } = await supabase
        .from('nominations')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .eq('nominee_id', nomineeId);

    if (checkNominationError || isNominated === 0) {
        // Reject the vote if the pairing doesn't exist in the nominations table
        return res.status(400).json({ message: 'Invalid vote: Nominee is not nominated in this category.' });
    }
    
    // Check for duplicate vote (Voter ID + Category ID)
    const { data: existingVote, error: selectVoteError } = await supabase
        .from('votes')
        .select('id')
        .eq('voter_id', voterId)
        .eq('category_id', categoryId)
        .maybeSingle();

    if (selectVoteError) {
        console.error('Error checking existing vote:', selectVoteError);
        return res.status(500).json({ message: 'Vote submission failed due to pre-check error.' });
    }
    
    if (existingVote) {
        // If vote exists, return 409 error as per previous logic (no vote changing allowed)
        return res.status(409).json({ message: 'You have already voted in this category.' });
    }

    // Record the vote
    const { error: insertVoteError } = await supabase
        .from('votes')
        .insert([{ 
            voter_id: voterId, 
            nominee_id: nomineeId, 
            category_id: categoryId,
        }]);

    if (insertVoteError) {
        return res.status(500).json({ message: 'Vote submission failed.', error: insertVoteError });
    }

    res.status(201).json({ message: 'Vote recorded successfully!' });
});

export default publicRouter;