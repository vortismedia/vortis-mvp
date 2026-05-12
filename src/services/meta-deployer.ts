import { getDb } from '../db/database';
import {
  createMetaCampaign,
  createMetaAdSet,
  createMetaAd,
  searchInterests,
  searchGeoLocations,
} from './meta-ads';
import { getAdImageUrl } from './cloudinary-compose';

export async function deployToMeta(campaignId: string): Promise<{
  metaCampaignId: string;
  metaAdSetIds: string[];
  metaAdIds: string[];
}> {
  const db = getDb();

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get<any>(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(campaign.client_id);
  if (!client) throw new Error(`Client ${campaign.client_id} not found`);

  const adSets = await db.prepare(
    "SELECT * FROM ad_sets WHERE campaign_id = ? ORDER BY CASE stage WHEN 'TOFU' THEN 1 WHEN 'MOFU' THEN 2 ELSE 3 END"
  ).all<any>(campaignId);

  if (adSets.length === 0) throw new Error('No ad sets found for this campaign');

  const allAds = await db.prepare(
    "SELECT * FROM ads WHERE campaign_id = ? AND validation_status = 'approved'"
  ).all<any>(campaignId);

  if (allAds.length === 0) throw new Error('No approved ads to deploy');

  console.log(`[Meta Deploy] Starting funnel deployment for "${client.business_name}"...`);
  console.log(`  → ${adSets.length} ad sets, ${allAds.length} ads total`);

  // Step 1: Create Campaign on Meta (use business name only, clean hierarchy)
  const metaCampaignId = await createMetaCampaign({
    name: client.business_name,
    objective: client.campaign_objective,
    dailyBudgetCents: Math.round((client.daily_budget_usd || 6.67) * 100),
    status: 'PAUSED',
  });
  console.log(`  Campaign created on Meta: ${metaCampaignId}`);

  // Step 2: Load client assets (uploaded photos)
  const assets = await db.prepare(
    'SELECT url FROM client_assets WHERE client_id = ? ORDER BY uploaded_at'
  ).all<any>(client.id);
  const imageUrls = assets.map(a => a.url);

  const linkUrl = normalizeLinkUrl(client.destination_url, client.contact_phone);
  const metaAdSetIds: string[] = [];
  const metaAdIds: string[] = [];

  // Step 3: For each ad set (TOFU, MOFU, BOFU), create ad set + its ads
  for (const adSet of adSets) {
    let stageTargeting: any = {};
    try { stageTargeting = JSON.parse(adSet.targeting_config); } catch {}

    const resolvedTargeting = await resolveTargeting(stageTargeting, client);

    // Create ad set on Meta (human-friendly Spanish names)
    const stageLabel: Record<string, string> = {
      TOFU: 'Conocimiento (audiencia fría)',
      MOFU: 'Consideración (audiencia tibia)',
      BOFU: 'Conversión (audiencia caliente)',
    };
    const metaAdSetId = await createMetaAdSet({
      name: stageLabel[adSet.stage] || adSet.stage,
      campaignId: metaCampaignId,
      dailyBudgetCents: adSet.daily_budget_cents,
      targeting: resolvedTargeting,
      optimizationGoal: client.campaign_objective,
      status: 'PAUSED',
    });

    await db.prepare('UPDATE ad_sets SET meta_adset_id = ? WHERE id = ?').run(metaAdSetId, adSet.id);
    metaAdSetIds.push(metaAdSetId);
    console.log(`  AdSet ${adSet.stage} created on Meta: ${metaAdSetId}`);

    // Get ads for this stage
    const stageAds = allAds.filter(a => a.ad_set_id === adSet.id);
    console.log(`    → ${stageAds.length} ads to deploy for ${adSet.stage}`);

    for (let i = 0; i < stageAds.length; i++) {
      const ad = stageAds[i];

      // Auto-compose creative image
      const clientPhotoUrl = imageUrls.length > 0 ? imageUrls[(metaAdIds.length) % imageUrls.length] : undefined;
      const composedImageUrl = getAdImageUrl({
        format: 'square',
        headline: ad.headline,
        ctaText: ad.cta_text || 'Enviar mensaje',
        logoUrl: client.logo_url || undefined,
        photoUrl: clientPhotoUrl,
        brandColors: client.brand_colors || '',
        businessName: client.business_name,
        city: client.city,
      });

      // Human-friendly angle labels
      const angleLabels: Record<string, string> = {
        curiosidad: 'Curiosidad', pattern_interrupt: 'Llamado de atención',
        storytelling: 'Historia', dato: 'Dato impactante', pregunta: 'Pregunta',
        diferenciador: 'Diferenciador', prueba_social: 'Prueba social',
        garantia: 'Garantía', comparativa: 'Comparativa', faq: 'Resuelve duda',
        oferta: 'Oferta', urgencia: 'Urgencia', friccion: 'Sin fricción',
        cta_directo: 'Llamado directo', recordatorio: 'Recordatorio',
      };
      const stageShort = adSet.stage === 'TOFU' ? 'Conocer' : adSet.stage === 'MOFU' ? 'Considerar' : 'Convertir';
      const angleHuman = angleLabels[ad.angle || ''] || (ad.angle || 'General');

      const metaAdId = await createMetaAd({
        name: `${stageShort} ${i + 1} - ${angleHuman}`,
        adSetId: metaAdSetId,
        headline: ad.headline,
        body: ad.description,
        description: ad.headline,
        ctaType: ad.cta_type,
        linkUrl,
        imageUrl: composedImageUrl,
        status: 'PAUSED',
      });

      await db.prepare('UPDATE ads SET meta_ad_id = ?, creative_url = ? WHERE id = ?')
        .run(metaAdId, composedImageUrl, ad.id);
      metaAdIds.push(metaAdId);
      console.log(`    Ad ${adSet.stage}-${i + 1} created: ${metaAdId}`);
    }
  }

  // Step 4: Update campaign in DB
  await db.prepare(
    `UPDATE campaigns SET meta_campaign_id = ?, meta_adset_id = ?, meta_status = 'PAUSED', status = 'deployed', updated_at = NOW() WHERE id = ?`
  ).run(metaCampaignId, metaAdSetIds[0] || null, campaignId);

  await db.prepare(
    "UPDATE clients SET status = 'deployed', updated_at = NOW() WHERE id = ?"
  ).run(client.id);

  console.log(`[Meta Deploy] DONE! ${metaAdSetIds.length} ad sets, ${metaAdIds.length} ads (all PAUSED).`);

  return { metaCampaignId, metaAdSetIds, metaAdIds };
}

async function resolveTargeting(targeting: any, client: any) {
  const ageMin = targeting.age_min || targeting.age_range?.min || 25;
  const ageMax = targeting.age_max || targeting.age_range?.max || 55;

  const genderMap: Record<string, number[]> = {
    todos: [0], hombres: [1], mujeres: [2], masculino: [1], femenino: [2],
  };
  const gendersRaw = targeting.genders;
  let genders: number[];
  if (Array.isArray(gendersRaw)) genders = gendersRaw;
  else genders = genderMap[(gendersRaw || 'todos').toLowerCase()] || [0];

  let geoLocations: any = { countries: [countryCode(client.country)] };

  // Try to resolve city from targeting first, then client.city
  const cityToSearch = targeting.geo_locations?.cities?.[0]?.name || client.city;
  try {
    const cities = await searchGeoLocations(cityToSearch);
    if (cities.length > 0) {
      const radius = targeting.geo_locations?.cities?.[0]?.radius || 25;
      geoLocations = {
        cities: [{ key: cities[0].key, radius, distance_unit: 'kilometer' }],
      };
    }
  } catch {
    console.log('  Could not resolve city geo, using country fallback');
  }

  let interests: Array<{ id: string; name: string }> = [];
  const interestNames = targeting.interests || [];

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

function normalizeLinkUrl(destinationUrl: string | null | undefined, contactPhone: string | null | undefined): string {
  const dest = (destinationUrl || '').trim();
  if (dest && (dest.startsWith('http://') || dest.startsWith('https://'))) return dest;
  if (dest && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(dest) && !dest.match(/^\+?\d/)) {
    return `https://${dest}`;
  }
  const phoneSource = dest.match(/^\+?\d{8,}/) ? dest : (contactPhone || '');
  const digits = phoneSource.replace(/\D/g, '');
  if (digits.length >= 8) return `https://wa.me/${digits}`;
  return 'https://vortismedia.com';
}

function countryCode(country: string): string {
  const map: Record<string, string> = {
    Argentina: 'AR', Mexico: 'MX', Colombia: 'CO', Chile: 'CL',
    'USA': 'US', 'USA (Latinos)': 'US',
  };
  return map[country] || 'AR';
}
