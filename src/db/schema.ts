// Postgres-compatible schema. Key changes from SQLite version:
// - TEXT DEFAULT (datetime('now')) -> TIMESTAMP DEFAULT NOW()
// - REAL -> DOUBLE PRECISION
// - Added `access_token` to clients for secure URL-based access
// - Added `admin_reviewed` flag for the Vortis review step before notifying client
export const SCHEMA = `
-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  access_token TEXT UNIQUE,
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT DEFAULT 'Argentina',
  product_service TEXT NOT NULL,
  differentiators TEXT,
  price_range TEXT,
  campaign_objective TEXT NOT NULL,
  destination_url TEXT,
  daily_budget_usd DOUBLE PRECISION DEFAULT 6.67,
  brand_tone TEXT DEFAULT 'profesional',
  prohibited_words TEXT,
  mandatory_words TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_name TEXT NOT NULL,

  meta_ad_account_id TEXT,
  meta_page_id TEXT,

  logo_url TEXT,
  brand_colors TEXT,
  brand_fonts TEXT,
  photo_urls TEXT,
  slogan TEXT,
  visual_style TEXT DEFAULT 'moderno',
  creative_notes TEXT,

  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  plan_price_usd DOUBLE PRECISION DEFAULT 299,

  status TEXT DEFAULT 'onboarding',
  admin_reviewed INTEGER DEFAULT 0,
  admin_reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_token ON clients(access_token);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),

  meta_campaign_id TEXT,
  meta_adset_id TEXT,

  business_analysis TEXT,
  targeting_config TEXT,
  budget_config TEXT,

  status TEXT DEFAULT 'generating',
  meta_status TEXT DEFAULT 'PAUSED',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);

-- Ads
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  client_id TEXT NOT NULL REFERENCES clients(id),

  meta_ad_id TEXT,

  headline TEXT NOT NULL,
  description TEXT NOT NULL,
  cta_text TEXT DEFAULT 'Enviar mensaje',
  cta_type TEXT DEFAULT 'SEND_MESSAGE',

  validation_status TEXT DEFAULT 'pending',
  validation_notes TEXT,

  client_approved INTEGER DEFAULT 0,
  client_feedback TEXT,
  approved_at TIMESTAMP,

  template_id TEXT,
  format TEXT DEFAULT 'feed',
  creative_url TEXT,

  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  spend_usd DOUBLE PRECISION DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_campaign ON ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_client ON ads(client_id);

-- Agent logs
CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  campaign_id TEXT REFERENCES campaigns(id),
  agent_name TEXT NOT NULL,
  input_data TEXT,
  output_data TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Performance snapshots (daily metrics)
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  campaign_id TEXT REFERENCES campaigns(id),
  date TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  spend_usd DOUBLE PRECISION DEFAULT 0,
  cpm DOUBLE PRECISION DEFAULT 0,
  cpc DOUBLE PRECISION DEFAULT 0,
  ctr DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creative templates
CREATE TABLE IF NOT EXISTS creative_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  industry TEXT,
  dimensions TEXT,
  description TEXT,
  thumbnail_url TEXT,
  template_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creative briefs
CREATE TABLE IF NOT EXISTS creative_briefs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  campaign_id TEXT REFERENCES campaigns(id),
  status TEXT DEFAULT 'pending',
  industry TEXT NOT NULL,
  format TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  headline TEXT,
  description TEXT,
  cta_text TEXT,
  brand_colors TEXT,
  brand_fonts TEXT,
  visual_style TEXT,
  logo_url TEXT,
  photo_urls TEXT,
  slogan TEXT,
  creative_notes TEXT,
  required_assets TEXT,
  designer_notes TEXT,
  output_url TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Client assets (Cloudinary URLs)
CREATE TABLE IF NOT EXISTS client_assets (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  asset_type TEXT NOT NULL,
  label TEXT,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- RAG knowledge base
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  industry TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
`;
