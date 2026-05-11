import dotenv from 'dotenv';
dotenv.config();

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// =========== ANTI-BAN PROTECTIONS ===========
// Rate limiter: max 1 call every 2 seconds, plus exponential backoff on errors
let lastCallTime = 0;
const MIN_INTERVAL_MS = 2000; // 2s between Meta API calls (well below their rate limits)

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - elapsed;
    await new Promise(r => setTimeout(r, wait));
  }
  lastCallTime = Date.now();
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err.message || '';
      // Only retry on transient errors
      const isTransient = msg.includes('rate limit') || msg.includes('temporarily') || msg.includes('try again') || msg.includes('timeout');
      if (!isTransient || i === attempts - 1) throw err;
      const backoff = Math.pow(2, i) * 5000; // 5s, 10s, 20s
      console.log(`[Meta] Transient error, retrying in ${backoff}ms: ${msg}`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN not configured in .env');
  return token;
}

function getAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error('META_AD_ACCOUNT_ID not configured in .env');
  return id;
}

function getPageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error('META_PAGE_ID not configured in .env');
  return id;
}

async function metaApiRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<any> {
  await rateLimit(); // Throttle ALL Meta API calls
  return withRetry(async () => _doMetaRequest(endpoint, method, body));
}

async function _doMetaRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: Record<string, any>
): Promise<any> {
  const url = `${META_BASE_URL}${endpoint}`;
  const token = getAccessToken();

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (method === 'GET') {
    const params = new URLSearchParams({ access_token: token, ...(body || {}) });
    const res = await fetch(`${url}?${params}`, options);
    const data: any = await res.json();
    if (data.error) throw new Error(`Meta API Error: ${data.error.message}`);
    return data;
  }

  const formBody = new URLSearchParams();
  formBody.append('access_token', token);
  if (body) {
    for (const [key, val] of Object.entries(body)) {
      formBody.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
    }
  }

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });

  const data: any = await res.json();
  if (data.error) {
    const details = data.error.error_user_msg || data.error.error_user_title || JSON.stringify(data.error);
    console.error('[Meta API Error Full]', JSON.stringify(data.error, null, 2));
    console.error('[Meta API Request]', endpoint, JSON.stringify(body, null, 2));
    throw new Error(`Meta API Error: ${data.error.message} - ${details}`);
  }
  return data;
}

export interface MetaCampaignInput {
  name: string;
  objective: string;
  dailyBudgetCents: number;
  status?: 'PAUSED' | 'ACTIVE';
}

export async function createMetaCampaign(input: MetaCampaignInput): Promise<string> {
  const accountId = getAdAccountId();

  const objectiveMap: Record<string, string> = {
    'Mensajes por WhatsApp': 'OUTCOME_ENGAGEMENT',
    'Trafico al sitio web': 'OUTCOME_TRAFFIC',
    'Leads / formularios': 'OUTCOME_LEADS',
    'Reconocimiento de marca': 'OUTCOME_AWARENESS',
  };

  const result = await metaApiRequest(`/${accountId}/campaigns`, 'POST', {
    name: input.name,
    objective: objectiveMap[input.objective] || 'OUTCOME_ENGAGEMENT',
    status: input.status || 'PAUSED',
    special_ad_categories: [],
    buying_type: 'AUCTION',
    is_adset_budget_sharing_enabled: false,
  });

  return result.id;
}

export interface MetaAdSetInput {
  name: string;
  campaignId: string;
  dailyBudgetCents: number;
  targeting: {
    ageMin: number;
    ageMax: number;
    genders: number[];
    geoLocations: { cities: Array<{ key: string; radius: number; distance_unit: string }> } | { countries: string[] };
    interests?: Array<{ id: string; name: string }>;
  };
  optimizationGoal: string;
  startTime?: string;
  status?: 'PAUSED' | 'ACTIVE';
}

export async function createMetaAdSet(input: MetaAdSetInput): Promise<string> {
  const accountId = getAdAccountId();

  const targeting: Record<string, any> = {
    age_min: input.targeting.ageMin,
    age_max: input.targeting.ageMax,
    genders: input.targeting.genders,
    geo_locations: input.targeting.geoLocations,
  };

  if (input.targeting.interests?.length) {
    targeting.flexible_spec = [{ interests: input.targeting.interests }];
  }

  const optimizationMap: Record<string, string> = {
    'Mensajes por WhatsApp': 'CONVERSATIONS',
    'Trafico al sitio web': 'LINK_CLICKS',
    'Leads / formularios': 'LEAD_GENERATION',
    'Reconocimiento de marca': 'REACH',
  };

  const result = await metaApiRequest(`/${accountId}/adsets`, 'POST', {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: input.dailyBudgetCents,
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    optimization_goal: optimizationMap[input.optimizationGoal] || 'CONVERSATIONS',
    targeting: targeting,
    start_time: input.startTime || new Date(Date.now() + 86400000).toISOString(),
    status: input.status || 'PAUSED',
  });

  return result.id;
}

export interface MetaAdInput {
  name: string;
  adSetId: string;
  headline: string;
  body: string;
  description: string;
  ctaType: string;
  linkUrl: string;
  imageUrl?: string;
  status?: 'PAUSED' | 'ACTIVE';
}

export async function createMetaAd(input: MetaAdInput): Promise<string> {
  const accountId = getAdAccountId();
  const pageId = getPageId();

  const ctaMap: Record<string, string> = {
    'SEND_MESSAGE': 'WHATSAPP_MESSAGE',
    'LEARN_MORE': 'LEARN_MORE',
    'SIGN_UP': 'SIGN_UP',
    'SHOP_NOW': 'SHOP_NOW',
    'CONTACT_US': 'CONTACT_US',
    'GET_QUOTE': 'GET_QUOTE',
    'BOOK_NOW': 'BOOK_NOW',
    'MESSAGE_PAGE': 'MESSAGE_PAGE',
  };

  const linkUrl = input.linkUrl || `https://wa.me/`;
  // Default placeholder if client didn't upload images. Cloudinary demo image.
  const imageUrl = input.imageUrl || 'https://res.cloudinary.com/dhcvy4zzq/image/upload/v1700000000/sample.jpg';

  const creative = {
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: input.body,
        name: input.headline,
        description: input.description,
        link: linkUrl,
        picture: imageUrl,
        call_to_action: {
          type: ctaMap[input.ctaType] || 'MESSAGE_PAGE',
          value: { link: linkUrl },
        },
      },
    },
  };

  const creativeResult = await metaApiRequest(`/${accountId}/adcreatives`, 'POST', {
    name: `Creative - ${input.name}`,
    ...creative,
  });

  const result = await metaApiRequest(`/${accountId}/ads`, 'POST', {
    name: input.name,
    adset_id: input.adSetId,
    creative: { creative_id: creativeResult.id },
    status: input.status || 'PAUSED',
  });

  return result.id;
}

export async function updateCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  await metaApiRequest(`/${campaignId}`, 'POST', { status });
}

export async function getCampaignInsights(campaignId: string): Promise<any> {
  return metaApiRequest(`/${campaignId}/insights`, 'GET', {
    fields: 'impressions,clicks,spend,actions,cost_per_action_type,cpm,cpc',
    date_preset: 'last_7d',
  });
}

export async function getAdSetInsights(adSetId: string): Promise<any> {
  return metaApiRequest(`/${adSetId}/insights`, 'GET', {
    fields: 'impressions,clicks,spend,actions,cost_per_action_type',
    date_preset: 'last_7d',
  });
}

export async function searchInterests(query: string): Promise<Array<{ id: string; name: string; audience_size: number }>> {
  const result = await metaApiRequest('/search', 'GET', {
    type: 'adinterest',
    q: query,
  });
  return (result.data || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    audience_size: item.audience_size_lower_bound || 0,
  }));
}

export async function searchGeoLocations(query: string, type: string = 'adcity'): Promise<any[]> {
  const result = await metaApiRequest('/search', 'GET', {
    type: 'adgeolocation',
    location_types: `["${type}"]`,
    q: query,
  });
  return result.data || [];
}
