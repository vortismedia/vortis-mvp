export const SCHEMA = `
-- Clients table: businesses that use Vortis
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT DEFAULT 'Argentina',
  product_service TEXT NOT NULL,
  differentiators TEXT,
  price_range TEXT,
  campaign_objective TEXT NOT NULL,
  destination_url TEXT,
  daily_budget_usd REAL DEFAULT 6.67,
  brand_tone TEXT DEFAULT 'profesional',
  prohibited_words TEXT,
  mandatory_words TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_name TEXT NOT NULL,

  -- Meta Ads config (for Modelo B: Vortis manages)
  meta_ad_account_id TEXT,
  meta_page_id TEXT,

  -- Creative assets (for designer templates)
  logo_url TEXT,
  brand_colors TEXT,
  brand_fonts TEXT,
  photo_urls TEXT,
  slogan TEXT,
  visual_style TEXT DEFAULT 'moderno',
  creative_notes TEXT,

  -- Payment
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  plan_price_usd REAL DEFAULT 299,

  -- Status
  status TEXT DEFAULT 'onboarding',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),

  -- Meta Ads IDs
  meta_campaign_id TEXT,
  meta_adset_id TEXT,

  -- AI-generated content
  business_analysis TEXT,
  targeting_config TEXT,
  budget_config TEXT,

  -- Status
  status TEXT DEFAULT 'generating',
  meta_status TEXT DEFAULT 'PAUSED',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Ads table (multiple ads per campaign)
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  client_id TEXT NOT NULL REFERENCES clients(id),

  -- Meta Ads
  meta_ad_id TEXT,

  -- AI-generated copy
  headline TEXT NOT NULL,
  description TEXT NOT NULL,
  cta_text TEXT DEFAULT 'Enviar mensaje',
  cta_type TEXT DEFAULT 'SEND_MESSAGE',

  -- Validation
  validation_status TEXT DEFAULT 'pending',
  validation_notes TEXT,

  -- Client approval
  client_approved INTEGER DEFAULT 0,
  client_feedback TEXT,
  approved_at TEXT,

  -- Creative (template + format)
  template_id TEXT,
  format TEXT DEFAULT 'feed',
  creative_url TEXT,

  -- Performance (updated from Meta Insights)
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  spend_usd REAL DEFAULT 0,

  created_at TEXT DEFAULT (datetime('now'))
);

-- Agent logs: track what each AI agent did
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
  created_at TEXT DEFAULT (datetime('now'))
);

-- Performance snapshots (daily metrics for analytics)
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  campaign_id TEXT REFERENCES campaigns(id),
  date TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  spend_usd REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  cpc REAL DEFAULT 0,
  ctr REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
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
  created_at TEXT DEFAULT (datetime('now'))
);

-- Creative briefs (auto-generated for designer)
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
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Client assets (images uploaded by client)
CREATE TABLE IF NOT EXISTS client_assets (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  asset_type TEXT NOT NULL,
  label TEXT,
  url TEXT NOT NULL,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

-- RAG knowledge base
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  industry TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;
