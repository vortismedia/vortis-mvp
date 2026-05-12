import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { initializeSchema } from './db/database';

import onboardingRoutes from './routes/onboarding';
import clientRoutes from './routes/clients';
import campaignRoutes from './routes/campaigns';
import dashboardRoutes from './routes/dashboard';
import metaRoutes from './routes/meta';
import consultantRoutes from './routes/consultant';
import analyticsRoutes from './routes/analytics';
import creativesRoutes from './routes/creatives';
import authRoutes, { requireAuth } from './routes/auth';
import paymentRoutes from './routes/payment';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public APIs (no auth, but clients use token in URL)
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);

// Internal APIs (admin auth required, enforced inside each router)
app.use('/api/clients', clientRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/consultant', consultantRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/creatives', creativesRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Health (public)
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

// ===== Pages =====
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});
app.get('/checkout', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'checkout.html'));
});

// Internal pages (require admin login)
app.get('/panel', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'panel.html'));
});
app.get('/plantillas', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'plantillas.html'));
});

// /admin redirects to unified panel
app.get('/admin', (_req, res) => res.redirect('/panel'));
app.get('/analytics', (_req, res) => res.redirect('/panel#analytics'));
app.get('/creativos', (_req, res) => res.redirect('/panel#creativos'));

// Client-facing page (uses ?token=XXX, not ?id=)
app.get('/mi-campana', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'client.html'));
});

// Legacy /aprobar redirects to /mi-campana (merged flow)
app.get('/aprobar', (req, res) => {
  const params = new URLSearchParams(req.query as any).toString();
  res.redirect(`/mi-campana?${params}#aprobar`);
});

// SPA fallback - serve index.html (onboarding) for unknown routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function startServer() {
  try {
    console.log('[Server] Initializing database schema...');
    await initializeSchema();
    console.log('[Server] Database ready.');

    app.listen(PORT, () => {
      console.log(`
  ╔═══════════════════════════════════════════╗
  ║       VORTIS MEDIA - MVP Server           ║
  ║       Port: ${PORT}                        ║
  ╚═══════════════════════════════════════════╝
      `);
    });
  } catch (err: any) {
    console.error('[Server] Fatal error during startup:', err.message);
    process.exit(1);
  }
}

startServer();
