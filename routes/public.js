import express from 'express';
import { supabase } from '../supabase.js';

const publicRouter = express.Router();

// REMOVED: getClientIp helper function

// GET /api/public/categories-nominees - Get all categories with their nominees
publicRouter.get('/categories-nominees', async (req, res) => {
    // Efficiently fetch categories and related nominees using the PostgREST join syntax
    const { data, error } = await supabase
        .from('categories')
        .select(`
            id, 
            name,
            description, 
            nominees (
                id, 
                name
            )
        `)
        .eq('is_active', true); 

    if (error) return res.status(500).json(error);
    res.json(data);
});

// POST /api/public/signin - Voter registration/check
publicRouter.post('/signin', async (req, res) => {
    const { name, email, phone } = req.body;
    // REMOVED: const ip_address = getClientIp(req);

    // 1. Check for existing voter using ONLY the email address
    let { data: voter } = await supabase
        .from('voters')
        .select('id')
        .eq('email', email)
        .maybeSingle(); 

    let voterId;
    if (voter) {
        voterId = voter.id;
        // REMOVED: Update IP on login
        // await supabase.from('voters').update({ last_signin_ip: ip_address }).eq('id', voterId);
    } else {
        const { data: newVoter, error: insertError } = await supabase
            .from('voters')
            // REMOVED: last_signin_ip: ip_address from the insert object
            .insert([{ name, email, phone }])
            .select('id')
            .single();
        
        // 🛑 CRITICAL FIX: LOG THE FULL ERROR OBJECT HERE
        if (insertError) {
            console.error('SUPABASE INSERT ERROR on /signin:', insertError); 
            // Return a generic error message to the client 
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
    // REMOVED: const ip_address = getClientIp(req);

    // Check for duplicate vote (Voter ID + Category ID)
    const { data: existingVote } = await supabase
        .from('votes')
        .select('id')
        .eq('voter_id', voterId)
        .eq('category_id', categoryId)
        .maybeSingle();

    if (existingVote) {
        return res.status(409).json({ message: 'You have already voted in this category.' });
    }

    // Record the vote
    const { error } = await supabase
        .from('votes')
        // REMOVED: ip_address: ip_address from the insert object
        .insert([{ 
            voter_id: voterId, 
            nominee_id: nomineeId, 
            category_id: categoryId,
        }]);

    if (error) {
        return res.status(500).json({ message: 'Vote submission failed.', error });
    }

    res.status(201).json({ message: 'Vote recorded successfully!' });
});

export default publicRouter;