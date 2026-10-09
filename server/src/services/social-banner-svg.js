/**
 * Social Media Banner SVG Generator (Round 26)
 * Generates dynamic, high-resolution vector banners (Instagram Story 1080x1920 & Post 1080x1080)
 * featuring product title, discounted price, discount badge, and store branding in Persian RTL.
 */

export class SocialBannerSvgGeneratorService {
  /**
   * Helper to escape XML
   */
  escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Format number to Persian comma-separated
   */
  formatPrice(num) {
    return Number(num || 0).toLocaleString('fa-IR');
  }

  /**
   * Generate SVG banner
   * @param {Object} options
   * @param {'story'|'post'} options.format
   */
  generateBanner({
    format = 'post',
    productTitle = 'محصول ویژه فروشگاه',
    originalPrice = 1200000,
    discountedPrice = 960000,
    discountPercent = 20,
    storeName = 'ایزی‌شاپ | EasyShop',
    badgeText = 'تخفیف شگفت‌انگیز'
  }) {
    const isStory = format === 'story';
    const width = 1080;
    const height = isStory ? 1920 : 1080;

    const safeTitle = this.escapeXml(productTitle);
    const safeStore = this.escapeXml(storeName);
    const safeBadge = this.escapeXml(badgeText);
    const formattedOriginal = this.formatPrice(originalPrice);
    const formattedDiscounted = this.formatPrice(discountedPrice);

    const centerY = height / 2;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#311042" />
    </linearGradient>
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#ef4444" />
    </linearGradient>
    <linearGradient id="badgeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGradient)" />

  <!-- Geometric Accent Circles -->
  <circle cx="${width * 0.85}" cy="${height * 0.15}" r="260" fill="#6366f1" opacity="0.15" filter="blur(60px)" />
  <circle cx="${width * 0.15}" cy="${height * 0.85}" r="220" fill="#ec4899" opacity="0.15" filter="blur(50px)" />

  <!-- Header Store Title -->
  <g direction="rtl" text-anchor="middle">
    <rect x="${width / 2 - 200}" y="${isStory ? 200 : 90}" width="400" height="54" rx="27" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.2" />
    <text x="${width / 2}" y="${isStory ? 236 : 126}" font-family="Vazirmatn, Tahoma, sans-serif" font-size="24" font-weight="600" fill="#ffffff">${safeStore}</text>
  </g>

  <!-- Special Offer Badge -->
  <g direction="rtl" text-anchor="middle">
    <rect x="${width / 2 - 160}" y="${isStory ? 420 : 230}" width="320" height="50" rx="25" fill="url(#badgeGradient)" filter="url(#shadow)" />
    <text x="${width / 2}" y="${isStory ? 454 : 264}" font-family="Vazirmatn, Tahoma, sans-serif" font-size="22" font-weight="700" fill="#ffffff">🔥 ${safeBadge}</text>
  </g>

  <!-- Main Card Container -->
  <rect x="${width * 0.08}" y="${isStory ? centerY - 380 : centerY - 210}" width="${width * 0.84}" height="${isStory ? 760 : 420}" rx="32" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.15" filter="url(#shadow)" />

  <!-- Product Title -->
  <text x="${width / 2}" y="${isStory ? centerY - 220 : centerY - 90}" text-anchor="middle" direction="rtl" font-family="Vazirmatn, Tahoma, sans-serif" font-size="44" font-weight="800" fill="#ffffff">
    ${safeTitle}
  </text>

  <!-- Discount Percentage Circle -->
  <g transform="translate(${width / 2 - 70}, ${isStory ? centerY - 130 : centerY - 30})">
    <rect width="140" height="60" rx="30" fill="url(#goldGradient)" filter="url(#shadow)" />
    <text x="70" y="40" text-anchor="middle" direction="rtl" font-family="Vazirmatn, Tahoma, sans-serif" font-size="28" font-weight="900" fill="#ffffff">
      ٪${discountPercent} تخفیف
    </text>
  </g>

  <!-- Pricing Details -->
  <!-- Original Price (Strikethrough) -->
  <g direction="rtl" text-anchor="middle">
    <text x="${width / 2}" y="${isStory ? centerY + 60 : centerY + 80}" font-family="Vazirmatn, Tahoma, sans-serif" font-size="30" fill="#94a3b8" text-decoration="line-through">
      ${formattedOriginal} تومان
    </text>

    <!-- Discounted Price -->
    <text x="${width / 2}" y="${isStory ? centerY + 160 : centerY + 145}" font-family="Vazirmatn, Tahoma, sans-serif" font-size="52" font-weight="900" fill="#22c55e" filter="url(#shadow)">
      ${formattedDiscounted} تومان
    </text>
  </g>

  <!-- Call to Action Footer -->
  <g direction="rtl" text-anchor="middle">
    <rect x="${width / 2 - 250}" y="${isStory ? height - 320 : height - 160}" width="500" height="74" rx="37" fill="#ffffff" filter="url(#shadow)" />
    <text x="${width / 2}" y="${isStory ? height - 272 : height - 114}" font-family="Vazirmatn, Tahoma, sans-serif" font-size="28" font-weight="800" fill="#0f172a">
      🛒 خرید فوری با ارسال رایگان
    </text>
  </g>
</svg>`;

    return {
      format,
      width,
      height,
      content_type: 'image/svg+xml',
      svg
    };
  }
}
