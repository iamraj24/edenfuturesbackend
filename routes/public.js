import express from 'express';
import { supabase } from '../supabase.js';

const publicRouter = express.Router();

// --------------------------------------------
// GET /api/public/categories-nominees
// --------------------------------------------
publicRouter.get('/categories-nominees', async (req, res) => {
    try {
        const { data: categories, error: catError } = await supabase
            .from('categories')
            .select('id, name, description')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (catError) throw catError;

        // If no categories, return empty result
        if (!categories || categories.length === 0) {
            return res.json([]);
        }

        const categoryIds = categories.map(c => c.id);

        const { data: nominations, error: nomError } = await supabase
            .from('nominations')
            .select(`
                id,
                category_id,
                nominee_id (
                    id,
                    name
                )
            `)
            .in('category_id', categoryIds);

        if (nomError) throw nomError;

        const categoriesWithNominees = categories.map(cat => {
            const nominees = nominations
                .filter(n => n.category_id === cat.id)
                .map(n => n.nominee_id)
                .filter(n => n && n.id);

            return {
                id: cat.id,
                name: cat.name,
                description: cat.description,
                nominees
            };
        });

        res.json(categoriesWithNominees);

    } catch (error) {
        console.error('Error fetching categories with nominees:', error);
        res.status(500).json({ 
            message: 'Failed to load voting data.', 
            error: error.message || error 
        });
    }
});

// --------------------------------------------
// POST /api/public/signin
// --------------------------------------------
publicRouter.post('/signin', async (req, res) => {
    const { name, email, phone } = req.body;

    try {
        const { data: voter, error: selectError } = await supabase
            .from('voters')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        let voterId;

        if (voter) {
            voterId = voter.id;
        } else {
            const { data: newVoter, error: insertError } = await supabase
                .from('voters')
                .insert([{ name, email, phone }])
                .select('id')
                .single();

            if (insertError) throw insertError;

            voterId = newVoter.id;
        }

        res.status(200).json({ voterId, message: 'Sign-in successful.' });

    } catch (error) {
        console.error('Error in /signin:', error);
        res.status(500).json({ 
            message: 'Failed to sign in.', 
            error: error.message || error 
        });
    }
});

// --------------------------------------------
// GET /api/public/voter-votes/:voterId
// --------------------------------------------
publicRouter.get('/voter-votes/:voterId', async (req, res) => {
    const { voterId } = req.params;

    try {
        const { data, error } = await supabase
            .from('votes')
            .select('category_id, nominee_id')
            .eq('voter_id', voterId);

        if (error) throw error;

        res.json(data);

    } catch (error) {
        console.error('Error fetching voter votes:', error);
        res.status(500).json({
            message: 'Failed to retrieve past votes.',
            error: error.message || error
        });
    }
});

// --------------------------------------------
// POST /api/public/vote
// --------------------------------------------
publicRouter.post('/vote', async (req, res) => {
    const { voterId, categoryId, nomineeId } = req.body;

    try {
        // Validate nomination
        const { count: isNominated, error: checkNomErr } = await supabase
            .from('nominations')
            .select('id', { count: 'exact', head: true })
            .eq('category_id', categoryId)
            .eq('nominee_id', nomineeId);

        if (checkNomErr) throw checkNomErr;

        if (isNominated === 0) {
            return res.status(400).json({
                message: 'Invalid vote: Nominee is not nominated in this category.'
            });
        }

        // Prevent duplicates
        const { data: existingVote, error: voteCheckErr } = await supabase
            .from('votes')
            .select('id')
            .eq('voter_id', voterId)
            .eq('category_id', categoryId)
            .maybeSingle();

        if (voteCheckErr && voteCheckErr.code !== 'PGRST116') throw voteCheckErr;

        if (existingVote) {
            return res.status(409).json({
                message: 'You have already voted in this category.'
            });
        }

        // Insert vote
        const { error: insertErr } = await supabase
            .from('votes')
            .insert([{ voter_id: voterId, category_id: categoryId, nominee_id: nomineeId }]);

        if (insertErr) throw insertErr;

        res.status(201).json({ message: 'Vote recorded successfully!' });

    } catch (error) {
        console.error('Error submitting vote:', error);
        res.status(500).json({
            message: 'Vote submission failed.',
            error: error.message || error
        });
    }
});

export default publicRouter;
