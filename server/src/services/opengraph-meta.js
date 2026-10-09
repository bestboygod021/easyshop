/**
 * موتور تولید خودکار متاتگ‌های پیشرفته شبکه‌های اجتماعی
 * (OpenGraph & Twitter Cards Meta Tags Generator)
 * بهینه‌شده برای پیش‌نمایش غنی و جذاب در تلگرام، واتس‌اپ، ایتا، بله، توییتر و فیس‌بوک
 */
export class OpenGraphMetaService {
  constructor(siteName = 'فروشگاه اینترنتی EasyShop', defaultUrl = 'https://easyshop.ir') {
    this.siteName = siteName;
    this.defaultUrl = defaultUrl;
  }

  /**
   * تولید تگ‌های HTML OpenGraph و کارت توییتر برای یک محصول مشخص
   */
  generateProductMetaTags(product, baseUrl = this.defaultUrl) {
    if (!product) return '';

    const title = `${product.name_fa || product.name || 'محصول ویژه'} | ${this.siteName}`;
    const description = (
      product.short_desc_fa ||
      product.short_desc ||
      product.description_fa ||
      'خرید آنلاین با بهترین قیمت، ضمانت اصالت و ارسال سریع'
    ).slice(0, 160).replace(/"/g, '&quot;');

    const url = `${baseUrl}/products/${product.slug || product.id}`;
    const imageUrl = (Array.isArray(product.images) && product.images[0]) || product.thumbnail || `${baseUrl}/logo.png`;
    const price = product.price || 0;
    const currency = 'IRT'; // تومان

    return `
<!-- OpenGraph / Facebook / Telegram / WhatsApp -->
<meta property="og:type" content="product" />
<meta property="og:site_name" content="${this.siteName}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:image:alt" content="${product.name_fa || product.name}" />
<meta property="product:price:amount" content="${price}" />
<meta property="product:price:currency" content="${currency}" />
<meta property="product:availability" content="${product.stock > 0 ? 'in stock' : 'out of stock'}" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${imageUrl}" />
    `.trim();
  }
}

export const openGraphMetaService = new OpenGraphMetaService();
