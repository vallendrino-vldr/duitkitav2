import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import scanRoutes from './routes/scan';
import adminRoutes from './routes/admin';

const app = express();
const PORT = process.env.PORT || 4000;

// Strict CORS accepting only the Vite frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'DuitKita API is running' });
});

app.listen(PORT, () => {
  console.log(`[API] Server is running on port ${PORT}`);
});
