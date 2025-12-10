import express from 'express';
import { supabase } from '../supabase.js';

const adminRouter = express.Router();

// NOTE: Replace process.env.VITE_ADMIN_KEY with the actual secret environment variable name used on your server
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'your_fallback_admin_key';

// Middleware to check for the Admin Key header
const checkAdminKey = (req, res, next) => {
    // The key is passed via the X-Admin-Key header from the frontend
    if (req.header('X-Admin-Key') !== ADMIN_SECRET_KEY) {
        return res.status(401).json({ message: 'Unauthorized: Invalid Admin Key.' });
    }
    next();
};

// Apply the middleware to all admin routes
adminRouter.use(checkAdminKey);

// --- 1. Admin Category Management Routes ---

// GET /api/admin/categories - Get ALL categories (with nominees) for the dashboard
adminRouter.get('/categories', async (req, res) => {
    // Fetch all categories (active or inactive) and their nominees
    const { data, error } = await supabase
        .from('categories')
        .select(`
            id, 
            name, 
            is_active,
            nominees (id, name)
        `)
        .order('created_at', { ascending: true }); 

    if (error) return res.status(500).json(error);
    res.json(data);
});

// POST /api/admin/categories - Create a new category
adminRouter.post('/categories', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name }])
        .select('id, name')
        .single();

    if (error) {
        return res.status(400).json({ message: 'Failed to create category.', error });
    }
    res.status(201).json(data);
});

// PUT /api/admin/categories/:id - Update category name (for the Edit button)
adminRouter.put('/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    const { data, error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', id)
        .select('id, name')
        .single();

    if (error) {
        return res.status(500).json({ message: 'Failed to update category.', error });
    }
    res.status(200).json(data);
});

// DELETE /api/admin/categories/:id - Delete a category
adminRouter.delete('/categories/:id', async (req, res) => {
    const { id } = req.params;

    // Supabase will automatically handle cascading deletion if configured, 
    // but the RESTRICT constraint may cause an error if there are nominees or votes.
    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (error) {
        // If DELETE is restricted, inform the admin (e.g., if votes exist)
        return res.status(409).json({ message: 'Failed to delete. Category may contain associated nominees or votes.', error });
    }
    res.status(204).send(); // 204 No Content is standard for successful deletion
});


// --- 2. Nominee Management Routes (Simplified example) ---

// POST /api/admin/nominees - Add a new nominee
adminRouter.post('/nominees', async (req, res) => {
    const { name, category_id } = req.body;
    const { data, error } = await supabase
        .from('nominees')
        .insert([{ name, category_id }])
        .select('id, name')
        .single();

    if (error) {
        return res.status(400).json({ message: 'Failed to add nominee.', error });
    }
    res.status(201).json(data);
});


// --- 3. Voter Listing Route (Fixes the 404 Error) ---

// GET /api/admin/voters - Get all registered voters (Fixes 404 error)
adminRouter.get('/voters', async (req, res) => {
    const { data, error } = await supabase
        .from('voters')
        .select('id, name, email, phone, last_signin_ip, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Supabase Error fetching voters:", error);
        return res.status(500).json({ message: 'Failed to retrieve voter data.' });
    }

    // This data structure matches what your frontend is expecting for the Table
    res.json(data); 
});

export default adminRouter;