/**
 * Cloudinary auto-compose service.
 *
 * Composes the final ad image by layering: client logo + client photo + brand colors + headline + CTA
 * using Cloudinary's URL-based transformations (no server-side processing).
 *
 * URL structure:
 *   https://res.cloudinary.com/{cloud}/image/upload/{transformations}/{base_image_id}.jpg
 */

const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'demo';
const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload`;

// Default background colors per brand color hint
function pickBackgroundColor(brandColors: string): { hex: string; textColor: string } {
  const c = (brandColors || '').toLowerCase();
  if (c.includes('azul')) return { hex: '1a56db', textColor: 'ffffff' };
  if (c.includes('rojo')) return { hex: 'dc2626', textColor: 'ffffff' };
  if (c.includes('verde')) return { hex: '0d9f4f', textColor: 'ffffff' };
  if (c.includes('negro')) return { hex: '1a1a1a', textColor: 'ffffff' };
  if (c.includes('dorado')) return { hex: 'd4a017', textColor: '1a1a1a' };
  if (c.includes('rosa')) return { hex: 'ec4899', textColor: 'ffffff' };
  if (c.includes('celeste')) return { hex: '38bdf8', textColor: '1a1a1a' };
  if (c.includes('naranja')) return { hex: 'ea580c', textColor: 'ffffff' };
  if (c.includes('violeta') || c.includes('púrpura')) return { hex: '7c3aed', textColor: 'ffffff' };
  if (c.includes('marrón') || c.includes('marron')) return { hex: '78350f', textColor: 'ffffff' };
  return { hex: '4f6ef7', textColor: 'ffffff' };
}

// URL-encode text for Cloudinary overlays (very specific encoding)
function cloudinaryEncodeText(text: string): string {
  return encodeURIComponent(text)
    .replace(/%2C/g, '%252C')  // commas
    .replace(/'/g, '%E2%80%99') // smart quote
    .replace(/\//g, '%252F');   // slashes
}

// Extract Cloudinary public_id from a full Cloudinary URL
function extractPublicId(url: string): string | null {
  // Matches: https://res.cloudinary.com/{cloud}/image/upload/v{timestamp}/{public_id}.{ext}
  const match = url.match(/\/image\/upload\/(?:v\d+\/)?([^.]+)/);
  return match ? match[1] : null;
}

export interface AdCreativeInput {
  format: 'feed' | 'story' | 'square';
  headline: string;
  ctaText: string;
  logoUrl?: string;
  photoUrl?: string;
  brandColors?: string;
  businessName: string;
  city?: string;
}

/**
 * Generate the Cloudinary URL for a composed ad creative.
 * Returns a URL that, when fetched, produces a real JPG/PNG image with all layers applied.
 */
export function composeAdCreative(input: AdCreativeInput): string {
  const dims = input.format === 'story'
    ? { w: 1080, h: 1920 }
    : input.format === 'square'
    ? { w: 1080, h: 1080 }
    : { w: 1080, h: 1080 };

  const colors = pickBackgroundColor(input.brandColors || '');

  // Base: solid color background (we use a Cloudinary trick — text on solid color)
  // Use a generated background via the "background" parameter
  const transforms: string[] = [];

  // 1. Base canvas (solid brand color)
  transforms.push(`c_pad,w_${dims.w},h_${dims.h},b_rgb:${colors.hex}`);

  // 2. Photo overlay (if client uploaded a photo)
  if (input.photoUrl) {
    const photoId = extractPublicId(input.photoUrl);
    if (photoId) {
      // Photo in the center, ~60% of canvas, with overlay tint
      const photoW = Math.round(dims.w * 0.9);
      const photoH = Math.round(dims.h * 0.55);
      transforms.push(`l_${photoId},w_${photoW},h_${photoH},c_fill,g_north,y_${Math.round(dims.h * 0.05)},r_20`);
    }
  }

  // 3. Logo overlay (top-left corner, if uploaded)
  if (input.logoUrl) {
    const logoId = extractPublicId(input.logoUrl);
    if (logoId) {
      const logoSize = Math.round(dims.w * 0.12);
      transforms.push(`l_${logoId},w_${logoSize},c_fit,g_north_west,x_40,y_40,r_max,b_rgb:ffffff`);
    }
  }

  // 4. Headline text overlay (bottom area, brand color text on white panel)
  const headlineText = cloudinaryEncodeText(input.headline.substring(0, 60));
  const headlineFontSize = input.format === 'story' ? 70 : 56;
  transforms.push(
    `l_text:Arial_${headlineFontSize}_bold:${headlineText},co_rgb:${colors.textColor},c_fit,w_${Math.round(dims.w * 0.85)},g_south,y_${Math.round(dims.h * 0.18)}`
  );

  // 5. Business name (small, below headline)
  const bizText = cloudinaryEncodeText(input.businessName.substring(0, 40));
  transforms.push(
    `l_text:Arial_28:${bizText},co_rgb:${colors.textColor},c_fit,w_${Math.round(dims.w * 0.85)},g_south,y_${Math.round(dims.h * 0.12)}`
  );

  // 6. CTA badge (bottom)
  const ctaText = cloudinaryEncodeText(input.ctaText.substring(0, 25));
  transforms.push(
    `l_text:Arial_36_bold:${ctaText},co_rgb:${colors.hex},b_rgb:ffffff,c_fit,w_${Math.round(dims.w * 0.5)},h_60,g_south,y_${Math.round(dims.h * 0.04)},bo_2px_solid_rgb:${colors.hex},r_30`
  );

  // Compose final URL
  // We need a base "blank canvas" - use Cloudinary's "blank" trick via colored background
  // Trick: use a solid color image as base. Cloudinary's "sample.jpg" is a fallback.
  const transformString = transforms.join('/');
  return `${CLOUDINARY_BASE}/${transformString}/v1/sample.jpg`;
}

/**
 * Simpler composer that just creates a branded card if no photo is uploaded.
 * Useful as fallback when client doesn't have images yet.
 */
export function composeBrandedCard(input: AdCreativeInput): string {
  const dims = input.format === 'story' ? { w: 1080, h: 1920 } : { w: 1080, h: 1080 };
  const colors = pickBackgroundColor(input.brandColors || '');

  const headline = cloudinaryEncodeText(input.headline.substring(0, 60));
  const biz = cloudinaryEncodeText(input.businessName.substring(0, 40));
  const cta = cloudinaryEncodeText(input.ctaText.substring(0, 25));

  const transforms = [
    // Solid color canvas
    `c_pad,w_${dims.w},h_${dims.h},b_rgb:${colors.hex}`,
    // Business name (top)
    `l_text:Arial_40_bold:${biz},co_rgb:${colors.textColor},c_fit,w_${Math.round(dims.w * 0.8)},g_north,y_${Math.round(dims.h * 0.15)}`,
    // Headline (center, big)
    `l_text:Arial_72_bold:${headline},co_rgb:${colors.textColor},c_fit,w_${Math.round(dims.w * 0.85)},g_center`,
    // CTA badge (bottom)
    `l_text:Arial_44_bold:${cta},co_rgb:${colors.hex},b_rgb:ffffff,c_fit,w_${Math.round(dims.w * 0.5)},h_80,g_south,y_${Math.round(dims.h * 0.1)},r_40`,
  ];

  return `${CLOUDINARY_BASE}/${transforms.join('/')}/v1/sample.jpg`;
}

/**
 * Main entry point: tries full compose with photo, falls back to branded card.
 */
export function getAdImageUrl(input: AdCreativeInput): string {
  if (input.photoUrl) return composeAdCreative(input);
  return composeBrandedCard(input);
}
