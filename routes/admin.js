import express from 'express';
import { supabase } from '../supabase.js';

const adminRouter = express.Router();

// Middleware to protect admin routes (Simple API key check)
const checkAdminAuth = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: 'Forbidden: Admin access required.' });
    }
    next();
};

adminRouter.use(checkAdminAuth);

// --------------------------------------------
// GET ALL CATEGORIES
// --------------------------------------------
adminRouter.get('/categories', async (req, res) => {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

// --------------------------------------------
// ADD CATEGORY
// --------------------------------------------
adminRouter.post('/categories', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name }])
        .select('*');
    if (error) return res.status(400).json({ message: 'Error adding category.', error });
    res.status(201).json(data[0]);
});

// --------------------------------------------
// UPDATE CATEGORY (name and/or description)
// --------------------------------------------
adminRouter.patch('/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    // Build update object only with provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'At least one field (name or description) is required to update.' });
    }

    const { data, error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

    if (error) {
        return res.status(500).json({ message: 'Failed to update category.', error });
    }

    res.status(200).json(data);
});

// --------------------------------------------
// DELETE CATEGORY
// --------------------------------------------
adminRouter.delete('/categories/:id', async (req, res) => {
    const { id } = req.params;

    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (error) {
        return res.status(500).json({ message: 'Failed to delete category.', error });
    }

    res.status(200).json({ message: 'Category deleted successfully.' });
});

// --------------------------------------------
// GET ALL NOMINEES
// --------------------------------------------
adminRouter.get('/nominees', async (req, res) => {
    const { data, error } = await supabase.from('nominees').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

// --------------------------------------------
// ADD NOMINEE
// --------------------------------------------
adminRouter.post('/nominees', async (req, res) => {
    const { name, category_id } = req.body;
    const { data, error } = await supabase
        .from('nominees')
        .insert([{ name, category_id }])
        .select('*');
    if (error) return res.status(400).json({ message: 'Error adding nominee.', error });
    res.status(201).json(data[0]);
});

// --------------------------------------------
// UPDATE NOMINEE
// --------------------------------------------
adminRouter.patch('/nominees/:id', async (req, res) => {
    const { id } = req.params;
    const { name, category_id } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category_id !== undefined) updateData.category_id = category_id;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'At least one field (name or category_id) is required to update.' });
    }

    const { data, error } = await supabase
        .from('nominees')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

    if (error) {
        return res.status(500).json({ message: 'Failed to update nominee.', error });
    }

    res.status(200).json(data);
});

// --------------------------------------------
// DELETE NOMINEE
// --------------------------------------------
adminRouter.delete('/nominees/:id', async (req, res) => {
    const { id } = req.params;

    // 1. Delete all votes associated with this nominee first (to satisfy Foreign Key Constraint)
    const { error: votesError } = await supabase
        .from('votes')
        .delete()
        .eq('nominee_id', id);

    if (votesError) {
        console.error('Error deleting associated votes:', votesError);
        return res.status(500).json({ message: 'Failed to delete associated votes before deleting nominee.', error: votesError });
    }

    // 2. Now delete the nominee
    const { error: nomineeError } = await supabase
        .from('nominees')
        .delete()
        .eq('id', id);

    if (nomineeError) {
        console.error('Error deleting nominee:', nomineeError);
        return res.status(500).json({ message: 'Failed to delete nominee.', error: nomineeError });
    }

    res.status(200).json({ message: 'Nominee and all associated votes deleted successfully.' });
});

// --------------------------------------------
// GET WINNERS / RESULTS
// --------------------------------------------
adminRouter.get('/winners', async (req, res) => {
    const [{ data: allCategories }, { data: allNominees }, { data: allVotes }] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('nominees').select('*'),
        supabase.from('votes').select('*')
    ]);

    const results = allCategories.map(cat => {
        const nomineesInCat = allNominees.filter(n => n.category_id === cat.id);
        const tally = nomineesInCat.map(n => ({
            ...n,
            voteCount: allVotes.filter(v => v.nominee_id === n.id).length
        }));

        tally.sort((a, b) => b.voteCount - a.voteCount);

        return {
            categoryName: cat.name,
            winner: tally[0] || { name: 'No votes yet', voteCount: 0 },
            fullTally: tally
        };
    });

    res.json(results);
});

export default adminRouter;