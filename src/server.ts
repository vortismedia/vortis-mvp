import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root (works even when launched from a worktree)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import onboardingRoutes from './routes/onboarding';
import clientRoutes from './routes/clients';
import campaignRoutes from './routes/campaigns';
import dashboardRoutes from './routes/dashboard';
import metaRoutes from './routes/meta';
import consultantRoutes from './routes/consultant';
import approvalRoutes from './routes/approval';
import analyticsRoutes from './routes/analytics';
import creativesRoutes from './routes/creatives';
import authRoutes, { requireAuth } from './routes/auth';
import paymentRoutes from './routes/payment';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/consultant', consultantRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/creatives', creativesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Cloudinary config (public, no secrets)
app.get('/api/config/cloudinary', (_req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'demo',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'docs_upload_example_us_preset',
  });
});

// Login page (public)
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Named pages — INTERNAL (require auth)
app.get('/panel', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'panel.html'));
});
app.get('/plantillas', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'plantillas.html'));
});
// /admin redirects to unified panel
app.get('/admin', (_req, res) => res.redirect('/panel'));
app.get('/creativos-old', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'creativos.html'));
});
app.get('/mi-campana', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'client.html'));
});
app.get('/aprobar', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'aprobar.html'));
});
// /analytics and /creativos redirect to unified panel
app.get('/analytics', (_req, res) => res.redirect('/panel#analytics'));
app.get('/creativos', (_req, res) => res.redirect('/panel#creativos'));
app.get('/assets', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'assets.html'));
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║       VORTIS MEDIA - MVP Server           ║
  ║       http://localhost:${PORT}               ║
  ╚═══════════════════════════════════════════╝

  Endpoints:
    POST /api/onboarding     - Submit client onboarding
    GET  /api/clients         - List all clients
    GET  /api/clients/:id     - Client details
    GET  /api/campaigns       - List campaigns
    GET  /api/campaigns/:id   - Campaign details
    GET  /api/dashboard       - Dashboard stats
    POST /api/meta/:id/deploy  - Deploy campaign to Meta
    POST /api/meta/:id/activate - Activate campaign
    POST /api/meta/:id/pause   - Pause campaign
    GET  /api/meta/:id/insights - Get campaign metrics
    GET  /api/health          - Health check

  Frontend:
    /                         - Onboarding form
    /admin                    - Admin dashboard
  `);
});
