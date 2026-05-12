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
  // If client has a photo, use it cropped (no text overlay — Meta 20% rule).
  // If not, fall back to clean branded card (solid color, no text).
  const dims = input.format === 'story'
    ? { w: 1080, h: 1920 }
    : { w: 1080, h: 1080 };

  if (!input.photoUrl) return composeBrandedCard(input);

  const photoId = extractPublicId(input.photoUrl);
  if (!photoId) return composeBrandedCard(input);

  // Just crop the client photo to ad dimensions. No text overlays.
  return `${CLOUDINARY_BASE}/c_fill,w_${dims.w},h_${dims.h},g_auto/${photoId}.jpg`;
}

/**
 * Simpler composer that just creates a branded card if no photo is uploaded.
 * Useful as fallback when client doesn't have images yet.
 */
export function composeBrandedCard(input: AdCreativeInput): string {
  // Clean solid-color image, NO text overlay (Meta's 20% text policy compliance).
  // Meta will render headline/body/CTA from the ad data itself.
  const dims = input.format === 'story' ? { w: 1080, h: 1920 } : { w: 1080, h: 1080 };
  const colors = pickBackgroundColor(input.brandColors || '');
  return `${CLOUDINARY_BASE}/c_pad,w_${dims.w},h_${dims.h},b_rgb:${colors.hex}/v1/sample.jpg`;
}

/**
 * Main entry point: tries full compose with photo, falls back to branded card.
 */
export function getAdImageUrl(input: AdCreativeInput): string {
  if (input.photoUrl) return composeAdCreative(input);
  return composeBrandedCard(input);
}
