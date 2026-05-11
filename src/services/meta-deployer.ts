import { getDb } from '../db/database';
import {
  createMetaCampaign,
  createMetaAdSet,
  createMetaAd,
  searchInterests,
  searchGeoLocations,
} from './meta-ads';

export async function deployToMeta(campaignId: string): Promise<{
  metaCampaignId: string;
  metaAdSetId: string;
  metaAdIds: string[];
}> {
  const db = getDb();

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get<any>(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(campaign.client_id);
  if (!client) throw new Error(`Client ${campaign.client_id} not found`);

  const ads = await db.prepare(
    "SELECT * FROM ads WHERE campaign_id = ? AND validation_status = 'approved'"
  ).all<any>(campaignId);

  if (ads.length === 0) throw new Error('No approved ads to deploy');

  let targeting: any;
  let budget: any;
  try { targeting = JSON.parse(campaign.targeting_config); } catch { targeting = {}; }
  try { budget = JSON.parse(campaign.budget_config); } catch { budget = {}; }

  console.log(`[Meta Deploy] Starting deployment for "${client.business_name}"...`);

  // Step 1: Create Campaign
  const dailyBudgetCents = Math.round((client.daily_budget_usd || 6.67) * 100);

  const metaCampaignId = await createMetaCampaign({
    name: `Vortis - ${client.business_name}`,
    objective: client.campaign_objective,
    dailyBudgetCents,
    status: 'PAUSED',
  });

  console.log(`  Campaign created: ${metaCampaignId}`);

  // Step 2: Resolve targeting
  const resolvedTargeting = await resolveTargeting(targeting, client);

  // Step 3: Create Ad Set
  const metaAdSetId = await createMetaAdSet({
    name: `AdSet - ${client.business_name}`,
    campaignId: metaCampaignId,
    dailyBudgetCents,
    targeting: resolvedTargeting,
    optimizationGoal: client.campaign_objective,
    status: 'PAUSED',
  });

  console.log(`  Ad Set created: ${metaAdSetId}`);

  // Step 4: Create Ads
  const metaAdIds: string[] = [];
  const linkUrl = normalizeLinkUrl(client.destination_url, client.contact_phone);

  const assets = await db.prepare(
    'SELECT url FROM client_assets WHERE client_id = ? ORDER BY uploaded_at'
  ).all<any>(client.id);
  const imageUrls = assets.map(a => a.url);

  for (let i = 0; i < ads.length; i++) {
    const ad = ads[i];
    // Cycle through uploaded images, or use placeholder
    const imageUrl = imageUrls.length > 0 ? imageUrls[i % imageUrls.length] : undefined;

    const metaAdId = await createMetaAd({
      name: `Ad ${i + 1} - ${client.business_name}`,
      adSetId: metaAdSetId,
      headline: ad.headline,
      body: ad.description,
      description: ad.headline,
      ctaType: ad.cta_type,
      linkUrl,
      imageUrl,
      status: 'PAUSED',
    });

    await db.prepare('UPDATE ads SET meta_ad_id = ? WHERE id = ?').run(metaAdId, ad.id);
    metaAdIds.push(metaAdId);
    console.log(`  Ad ${i + 1} created: ${metaAdId}`);
  }

  await db.prepare(
    `UPDATE campaigns SET meta_campaign_id = ?, meta_adset_id = ?, meta_status = 'PAUSED', status = 'deployed', updated_at = NOW() WHERE id = ?`
  ).run(metaCampaignId, metaAdSetId, campaignId);

  await db.prepare(
    "UPDATE clients SET status = 'deployed', updated_at = NOW() WHERE id = ?"
  ).run(client.id);

  console.log(`[Meta Deploy] DONE! Campaign deployed as PAUSED.`);

  return { metaCampaignId, metaAdSetId, metaAdIds };
}

async function resolveTargeting(targeting: any, client: any) {
  const ageMin = targeting.age_min || targeting.age_range?.min || 25;
  const ageMax = targeting.age_max || targeting.age_range?.max || 55;

  const genderMap: Record<string, number[]> = {
    todos: [0],
    hombres: [1],
    mujeres: [2],
    masculino: [1],
    femenino: [2],
  };
  const genders = genderMap[(targeting.genders || 'todos').toLowerCase()] || [0];

  let geoLocations: any = { countries: [countryCode(client.country)] };

  try {
    const cities = await searchGeoLocations(client.city);
    if (cities.length > 0) {
      geoLocations = {
        cities: [{
          key: cities[0].key,
          radius: 25,
          distance_unit: 'kilometer',
        }],
      };
    }
  } catch (err) {
    console.log('  Could not resolve city geo, using country fallback');
  }

  let interests: Array<{ id: string; name: string }> = [];
  const interestNames = targeting.interests || targeting.detailed_targeting?.interests || [];

  for (const interest of interestNames.slice(0, 5)) {
    try {
      const name = typeof interest === 'string' ? interest : interest.name || interest;
      const results = await searchInterests(name);
      if (results.length > 0) {
        interests.push({ id: results[0].id, name: results[0].name });
      }
    } catch {}
  }

  return { ageMin, ageMax, genders, geoLocations, interests };
}

/**
 * Returns a valid HTTPS URL for the ad's destination.
 * Handles 3 cases:
 * 1. destination_url is a valid URL → use it as-is
 * 2. destination_url is a phone number (or empty) → fall back to wa.me link
 * 3. No destination + no phone → use a placeholder Vortis page
 */
function normalizeLinkUrl(destinationUrl: string | null | undefined, contactPhone: string | null | undefined): string {
  const dest = (destinationUrl || '').trim();

  // Case 1: looks like a URL (starts with http or has a dot, no leading +)
  if (dest && (dest.startsWith('http://') || dest.startsWith('https://'))) {
    return dest;
  }
  if (dest && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(dest) && !dest.match(/^\+?\d/)) {
    return `https://${dest}`;
  }

  // Case 2: phone number — build wa.me URL
  const phoneSource = dest.match(/^\+?\d{8,}/) ? dest : (contactPhone || '');
  const digits = phoneSource.replace(/\D/g, '');
  if (digits.length >= 8) {
    return `https://wa.me/${digits}`;
  }

  // Case 3: no useful destination → safe placeholder
  return 'https://vortismedia.com';
}

function countryCode(country: string): string {
  const map: Record<string, string> = {
    Argentina: 'AR',
    Mexico: 'MX',
    Colombia: 'CO',
    Chile: 'CL',
    'USA': 'US',
    'USA (Latinos)': 'US',
  };
  return map[country] || 'AR';
}
