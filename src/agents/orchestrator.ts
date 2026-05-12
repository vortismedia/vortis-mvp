import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database';
import { analyzeClient } from './analyzer';
import { generateCopies } from './copywriter';
import { defineSegmentation } from './segmenter';
import { validateAds } from './validator';
import { recommendBudget } from './budget';
// Email/WhatsApp notifications happen on admin approval, not auto-fire
import {
  getMockAnalysis,
  getMockCopies,
  getMockSegmentation,
  getMockValidation,
  getMockBudget,
} from './mock-responses';

export interface OrchestrationResult {
  campaignId: string;
  analysis: any;
  copies: any;
  segmentation: any;
  validation: any;
  budget: any;
  totalTokens: number;
  totalDurationMs: number;
}

export async function orchestrateCampaignCreation(clientId: string): Promise<OrchestrationResult> {
  const db = getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get<any>(clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const campaignId = uuid();
  await db.prepare(
    `INSERT INTO campaigns (id, client_id, status) VALUES (?, ?, 'generating')`
  ).run(campaignId, clientId);

  let totalTokens = 0;
  let totalDurationMs = 0;

  const useMock = !process.env.ANTHROPIC_API_KEY;
  if (useMock) {
    console.log(`[Orchestrator] MODO DEMO - No hay ANTHROPIC_API_KEY, usando datos simulados`);
  }

  console.log(`[Orchestrator] Starting campaign generation for ${client.business_name}...`);

  let analysis: any, copies: any, segmentation: any, validation: any, budget: any;

  if (useMock) {
    await delay(800);
    console.log('[1/5] Analyzer (demo)...');
    analysis = getMockAnalysis(client);

    await delay(600);
    console.log('[2/5] Copywriter (demo)...');
    copies = getMockCopies(client, analysis);

    await delay(400);
    console.log('[3/5] Segmenter (demo)...');
    segmentation = getMockSegmentation(client, analysis);

    await delay(300);
    console.log('[4/5] Validator (demo)...');
    validation = getMockValidation(copies.ads);

    await delay(300);
    console.log('[5/5] Budget (demo)...');
    budget = getMockBudget(client);

    totalTokens = 0;
    totalDurationMs = 2400;
  } else {
    // Step 1: Analyze the business
    console.log('[1/5] Running Analyzer agent...');
    const analysisResult = await analyzeClient({
      id: client.id,
      business_name: client.business_name,
      industry: client.industry,
      city: client.city,
      country: client.country,
      product_service: client.product_service,
      differentiators: client.differentiators || '',
      price_range: client.price_range || '',
      campaign_objective: client.campaign_objective,
      brand_tone: client.brand_tone || 'profesional',
    });
    analysis = analysisResult.parsedOutput;
    totalTokens += analysisResult.tokensUsed;
    totalDurationMs += analysisResult.durationMs;
    console.log(`  -> Analysis complete (${analysisResult.tokensUsed} tokens)`);

    // Step 2: Generate copies
    console.log('[2/5] Running Copywriter agent...');
    const copiesResult = await generateCopies({
      clientId,
      campaignId,
      businessName: client.business_name,
      industry: client.industry,
      productService: client.product_service,
      differentiators: client.differentiators || '',
      priceRange: client.price_range || '',
      brandTone: client.brand_tone || 'profesional',
      prohibitedWords: client.prohibited_words || '',
      mandatoryWords: client.mandatory_words || '',
      campaignObjective: client.campaign_objective,
      targetCity: client.city,
      country: client.country,
      analysis,
    });
    copies = copiesResult.parsedOutput;
    totalTokens += copiesResult.tokensUsed;
    totalDurationMs += copiesResult.durationMs;
    console.log(`  -> ${copies?.ads?.length || 0} ad copies generated (${copiesResult.tokensUsed} tokens)`);

    // Step 3: Define segmentation
    console.log('[3/5] Running Segmenter agent...');
    const segResult = await defineSegmentation({
      clientId,
      campaignId,
      businessName: client.business_name,
      industry: client.industry,
      city: client.city,
      country: client.country,
      productService: client.product_service,
      analysis,
    });
    segmentation = segResult.parsedOutput;
    totalTokens += segResult.tokensUsed;
    totalDurationMs += segResult.durationMs;
    console.log(`  -> Segmentation defined (${segResult.tokensUsed} tokens)`);

    // Step 4: Validate ads
    console.log('[4/5] Running Validator agent...');
    const adsToValidate = (copies?.ads || []).map((ad: any) => ({
      variant: ad.variant,
      headline: ad.headline,
      body: ad.body,
      description: ad.description,
      cta_text: ad.cta_text,
    }));

    const validationResult = await validateAds({
      clientId,
      campaignId,
      ads: adsToValidate,
      industry: client.industry,
      prohibitedWords: client.prohibited_words || '',
    });
    validation = validationResult.parsedOutput;
    totalTokens += validationResult.tokensUsed;
    totalDurationMs += validationResult.durationMs;
    console.log(`  -> Validation complete: ${validation?.overall_compliance || 'unknown'} (${validationResult.tokensUsed} tokens)`);

    // Step 5: Recommend budget
    console.log('[5/5] Running Budget agent...');
    const budgetResult = await recommendBudget({
      clientId,
      campaignId,
      country: client.country,
      city: client.city,
      industry: client.industry,
      campaignObjective: client.campaign_objective,
      analysis,
    });
    budget = budgetResult.parsedOutput;
    totalTokens += budgetResult.tokensUsed;
    totalDurationMs += budgetResult.durationMs;
    console.log(`  -> Budget recommendation ready (${budgetResult.tokensUsed} tokens)`);
  }

  // Save results to campaign
  await db.prepare(
    `UPDATE campaigns SET business_analysis = ?, targeting_config = ?, budget_config = ?, status = 'ready', updated_at = NOW() WHERE id = ?`
  ).run(JSON.stringify(analysis), JSON.stringify(segmentation), JSON.stringify(budget), campaignId);

  // ============ Save 3 Ad Sets (TOFU/MOFU/BOFU) ============
  const adSetsConfig = segmentation?.ad_sets || [];
  const dailyBudgetCents = Math.round((client.daily_budget_usd || 6.67) * 100);
  // Distribute budget: TOFU 40%, MOFU 30%, BOFU 30%
  const budgetSplit = { TOFU: 0.40, MOFU: 0.30, BOFU: 0.30 };

  const adSetIdByStage: Record<string, string> = {};
  const insertAdSet = db.prepare(
    `INSERT INTO ad_sets (id, campaign_id, client_id, stage, name, targeting_config, daily_budget_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const stage of ['TOFU', 'MOFU', 'BOFU'] as const) {
    const config = adSetsConfig.find((s: any) => s.stage === stage) || { stage, name: stage, targeting: {} };
    const adSetId = uuid();
    const stageBudget = Math.round(dailyBudgetCents * budgetSplit[stage]);
    await insertAdSet.run(
      adSetId,
      campaignId,
      clientId,
      stage,
      config.name || `${stage} - ${client.business_name}`,
      JSON.stringify(config.targeting || {}),
      stageBudget
    );
    adSetIdByStage[stage] = adSetId;
  }

  // ============ Save Ads (15 total, organized by stage) ============
  const validatedAds = copies?.ads || [];
  const validations = validation?.validations || [];

  const insertAd = db.prepare(
    `INSERT INTO ads (id, campaign_id, client_id, ad_set_id, funnel_stage, angle, headline, description, cta_text, cta_type, validation_status, validation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let i = 0; i < validatedAds.length; i++) {
    const ad = validatedAds[i];
    const val = validations[i];
    const isApproved = val?.status === 'APROBADO' || val?.status === 'AJUSTADO';
    // Fallback if AI didn't tag funnel_stage: distribute by position (1-5=TOFU, 6-10=MOFU, 11-15=BOFU)
    const stage = ad.funnel_stage || (i < 5 ? 'TOFU' : i < 10 ? 'MOFU' : 'BOFU');
    const adSetId = adSetIdByStage[stage] || adSetIdByStage['TOFU'];

    await insertAd.run(
      uuid(), campaignId, clientId, adSetId, stage, ad.angle || null,
      val?.corrected_headline || ad.headline,
      val?.corrected_body || ad.body,
      ad.cta_text || 'Enviar mensaje',
      ad.cta_type || 'SEND_MESSAGE',
      isApproved ? 'approved' : 'rejected',
      val?.notes || null
    );
  }

  console.log(`  -> Created 3 ad sets + ${validatedAds.length} ads across funnel stages`);

  // Client status: pending_admin_review (NOT campaign_ready yet — admin must approve first)
  await db.prepare(
    `UPDATE clients SET status = 'pending_admin_review', updated_at = NOW() WHERE id = ?`
  ).run(clientId);

  // Notify ADMIN (Vortis team) that there's a campaign to review.
  // The client gets notified ONLY after admin approves.
  const { sendAdminReviewNotification } = await import('../services/email');
  sendAdminReviewNotification({
    business_name: client.business_name,
    contact_name: client.contact_name,
    industry: client.industry,
    id: client.id,
  }).catch((err) => console.error('[Orchestrator] Admin notify failed:', err));

  console.log(`\n[Orchestrator] DONE!`);
  console.log(`  Total tokens: ${totalTokens}`);
  console.log(`  Total time: ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Campaign ID: ${campaignId}`);

  return {
    campaignId,
    analysis,
    copies,
    segmentation,
    validation,
    budget,
    totalTokens,
    totalDurationMs,
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
