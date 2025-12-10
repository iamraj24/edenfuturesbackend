import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import publicRouter from './routes/public.js';
import adminRouter from './routes/admin.js';

// Load .env variables from the root directory
dotenv.config({ path: './.env' }); 

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: 'http://localhost:5173', // Allow CORS from Vite frontend default port
    credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/public', publicRouter); // Open access
app.use('/api/admin', adminRouter);   // Protected access

// Simple health check route
app.get('/', (req, res) => {
    res.send('Award Nomination Backend is Running!');
});

// Start server
app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
});