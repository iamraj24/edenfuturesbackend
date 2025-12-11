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
// CATEGORY ROUTES
// --------------------------------------------
adminRouter.get('/categories', async (req, res) => {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

adminRouter.post('/categories', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name }])
        .select('*');
    if (error) return res.status(400).json({ message: 'Error adding category.', error });
    res.status(201).json(data[0]);
});

adminRouter.patch('/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

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
// DELETE CATEGORY (Updates for Nominations table)
// --------------------------------------------
adminRouter.delete('/categories/:id', async (req, res) => {
    const { id: categoryId } = req.params;

    // 1. Delete all Votes associated with this Category ID (since votes table has category_id)
    const { error: votesError } = await supabase
        .from('votes')
        .delete()
        .eq('category_id', categoryId);

    if (votesError) {
        console.error('Error deleting associated votes:', votesError);
        return res.status(500).json({ message: 'Failed to delete associated votes.', error: votesError });
    }
    
    // 2. Delete all links in the new nominations table for this category
    const { error: nominationsError } = await supabase
        .from('nominations')
        .delete()
        .eq('category_id', categoryId);

    if (nominationsError) {
        console.error('Error deleting associated nominations:', nominationsError);
        return res.status(500).json({ message: 'Failed to delete associated nominations.', error: nominationsError });
    }

    // 3. Finally, delete the Category itself
    const { error: categoryError } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

    if (categoryError) {
        console.log('Final Category Deletion Error:', categoryError);
        return res.status(500).json({ message: 'Failed to delete category (final step).', error: categoryError });
    }

    res.status(200).json({ message: 'Category, associated nominations, and votes deleted successfully.' });
});


// --------------------------------------------
// NOMINEE ROUTES (Person/Entity Management - NO category_id)
// --------------------------------------------
adminRouter.get('/nominees', async (req, res) => {
    // Now just fetching the list of unique people/entities
    const { data, error } = await supabase.from('nominees').select('*');
    if (error) return res.status(500).json(error);
    res.json(data);
});

adminRouter.post('/nominees', async (req, res) => {
    // Only accepts 'name' now
    const { name } = req.body;
    const { data, error } = await supabase
        .from('nominees')
        .insert([{ name }]) // No category_id field here anymore
        .select('*');
    if (error) return res.status(400).json({ message: 'Error adding nominee.', error });
    res.status(201).json(data[0]);
});

adminRouter.patch('/nominees/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body; // Only update name
    
    if (name === undefined) {
        return res.status(400).json({ message: 'The name field is required to update.' });
    }

    const { data, error } = await supabase
        .from('nominees')
        .update({ name })
        .eq('id', id)
        .select('*')
        .single();

    if (error) {
        return res.status(500).json({ message: 'Failed to update nominee.', error });
    }
    res.status(200).json(data);
});

// --------------------------------------------
// DELETE NOMINEE (Deletes the person/entity and related data)
// --------------------------------------------
adminRouter.delete('/nominees/:id', async (req, res) => {
    const { id } = req.params;

    // 1. Delete all votes associated with this nominee
    const { error: votesError } = await supabase
        .from('votes')
        .delete()
        .eq('nominee_id', id);

    if (votesError) {
        console.error('Error deleting associated votes:', votesError);
        return res.status(500).json({ message: 'Failed to delete associated votes.', error: votesError });
    }

    // 2. Delete all links in the nominations table for this nominee
    const { error: nominationsError } = await supabase
        .from('nominations')
        .delete()
        .eq('nominee_id', id);

    if (nominationsError) {
        console.error('Error deleting associated nominations:', nominationsError);
        return res.status(500).json({ message: 'Failed to delete associated nominations.', error: nominationsError });
    }

    // 3. Now delete the nominee (person/entity)
    const { error: nomineeError } = await supabase
        .from('nominees')
        .delete()
        .eq('id', id);

    if (nomineeError) {
        console.error('Error deleting nominee:', nomineeError);
        return res.status(500).json({ message: 'Failed to delete nominee.', error: nomineeError });
    }

    res.status(200).json({ message: 'Nominee, all associated nominations, and votes deleted successfully.' });
});


// --------------------------------------------
// NEW NOMINATIONS ROUTES (The Joining Links - Fixes the 404 Error)
// --------------------------------------------

/**
 * GET /api/admin/nominations
 * Fetches ALL nominee-category links. This is the endpoint that was causing the 404 error.
 */
adminRouter.get('/nominations', async (req, res) => {
    // Fetch all nominations and join to get nominee/category names for display
    const { data, error } = await supabase
        .from('nominations')
        .select(`
            id,
            category:category_id ( id, name ),
            nominee:nominee_id ( id, name )
        `);
        
    if (error) return res.status(500).json({ message: 'Failed to retrieve nominations.', error });
    res.json(data);
});

/**
 * POST /api/admin/nominations
 * Creates a new link between a nominee and a category.
 */
adminRouter.post('/nominations', async (req, res) => {
    const { nominee_id, category_id } = req.body;
    
    // Check for existing nomination to prevent duplicates (optional but recommended)
    const { count: existingCount, error: checkError } = await supabase
        .from('nominations')
        .select('*', { count: 'exact', head: true })
        .eq('nominee_id', nominee_id)
        .eq('category_id', category_id);

    if (checkError) return res.status(500).json({ message: 'Error checking nomination existence.', error: checkError });
    if (existingCount > 0) {
         return res.status(409).json({ message: 'This nominee is already nominated in this category.' });
    }

    const { data, error } = await supabase
        .from('nominations')
        .insert([{ nominee_id, category_id }])
        .select('*');
        
    if (error) return res.status(400).json({ message: 'Error adding nomination.', error });
    res.status(201).json(data[0]);
});

/**
 * DELETE /api/admin/nominations/:id
 * Deletes a specific nominee-category link.
 */
adminRouter.delete('/nominations/:id', async (req, res) => {
    const { id } = req.params;
    
    const { error } = await supabase
        .from('nominations')
        .delete()
        .eq('id', id);
        
    if (error) return res.status(500).json({ message: 'Failed to delete nomination.', error });
    res.status(200).json({ message: 'Nomination deleted successfully.' });
});


// --------------------------------------------
// GET WINNERS / RESULTS (Optimized for New Nominations Structure)
// --------------------------------------------
adminRouter.get('/winners', async (req, res) => {
    // 1. Fetch Categories
    const { data: allCategories, error: catError } = await supabase.from('categories').select('*');

    if (catError) {
        console.error('Error fetching categories:', catError);
        return res.status(500).json({ message: 'Failed to retrieve categories for results.', error: catError });
    }

    // FIX: Guard against allCategories being null
    const categories = allCategories || [];

    // 2. Process Categories and Count Votes for each Nominee
    const resultsPromises = categories.map(async cat => {
        // Fetch ALL nominees and their details nominated in THIS category via the nominations table
        const { data: nominatedLinks, error: linkError } = await supabase
            .from('nominations')
            .select(`
                nominee:nominee_id ( id, name ) 
            `)
            .eq('category_id', cat.id);

        if (linkError) {
             console.error(`Error fetching nominees for category ${cat.id}:`, linkError);
             return { categoryName: cat.name, winner: { name: 'Error', voteCount: 0 }, fullTally: [] };
        }

        // FIX: Ensure nomineesInCat is safely extracted and filters out any null nominees
        const nomineesInCat = (nominatedLinks || [])
            .map(link => link.nominee)
            .filter(n => n && n.id); // Ensures nominee exists and has an ID
        
        const tallyPromises = nomineesInCat.map(async n => {
            // Count votes for this specific nominee ID directly on the database
            const { count, error } = await supabase
                .from('votes')
                .select('id', { count: 'exact', head: true })
                .eq('nominee_id', n.id) // Filter by nominee ID
                .eq('category_id', cat.id); // Filter by category ID (VOTES MUST HAVE category_id!)

            if (error) {
                console.error(`Error counting votes for nominee ${n.id}:`, error);
                return { ...n, voteCount: 0 }; 
            }

            return {
                ...n,
                voteCount: count
            };
        });

        const tally = await Promise.all(tallyPromises);

        // Sort by vote count descending
        tally.sort((a, b) => b.voteCount - a.voteCount);

        return {
            categoryName: cat.name,
            winner: tally[0] || { name: 'No nominees', voteCount: 0 },
            fullTally: tally
        };
    });

    try {
        const results = await Promise.all(resultsPromises);
        res.json(results);
    } catch (finalError) {
        console.error('Final error processing results:', finalError);
        res.status(500).json({ message: 'Failed to process final results.', error: finalError });
    }
});

export default adminRouter;