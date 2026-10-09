import { get } from '../db/index.js';

/**
 * سرویس تولید شناسنامه فنی و مشخصات محصول (Product Spec Sheet Exporter)
 * جهت چاپ یا دانلود PDF/HTML توسط مشتریان B2B و همکاران
 */
export class ProductSpecSheetService {
  /**
   * تولید ساختار HTML استاندارد و قابل چاپ برای شناسنامه محصول
   */
  generateSpecSheet(productId) {
    const product = get(
      `SELECT p.*, c.name_fa as category_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      productId
    );

    if (!product) return null;

    let specs = [];
    try {
      if (product.specs) {
        specs = typeof product.specs === 'string' ? JSON.parse(product.specs) : product.specs;
      }
    } catch {
      specs = [];
    }

    const priceFormatted = (product.price || 0).toLocaleString('fa-IR');
    const qrPayload = `https://easyshop.local/p/${product.slug || product.id}`;

    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>شناسنامه فنی: ${product.name_fa || product.name_en}</title>
  <style>
    body { font-family: Tahoma, 'Vazirmatn', sans-serif; margin: 30px; color: #1e293b; }
    .header { border-bottom: 2px solid #0284c7; padding-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
    .sku { font-size: 14px; color: #64748b; }
    .title { font-size: 20px; font-weight: bold; margin: 15px 0 5px; color: #0f172a; }
    .price-tag { font-size: 16px; font-weight: bold; color: #0284c7; margin: 10px 0; }
    .specs-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .specs-table th, .specs-table td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; }
    .specs-table th { background: #f8fafc; width: 30%; }
    .footer { margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h2>فروشگاه ایزی‌شاپ — شناسنامه فنی کالا</h2>
    <div class="sku">شناسه کالا: ${product.id}</div>
  </div>
  <div class="title">${product.name_fa || product.name_en}</div>
  <div>دسته‌بندی: ${product.category_name || 'عمومی'}</div>
  <div class="price-tag">قیمت مصوب: ${priceFormatted} تومان</div>
  <p>${product.description_fa || product.description_en || 'بدون توضیحات تکمیلی.'}</p>
  
  <h3>جدول مشخصات فنی و ویژگی‌ها</h3>
  <table class="specs-table">
    <tbody>
      <tr><th>موجودی انبار</th><td>${product.stock > 0 ? `${product.stock} عدد موجود` : 'ناموجود'}</td></tr>
      <tr><th>وضعیت سلامت</th><td>گارانتی اصالت و سلامت فیزیکی کالا</td></tr>
      ${Array.isArray(specs) ? specs.map(s => `<tr><th>${s.key || s.label}</th><td>${s.value}</td></tr>`).join('') : ''}
    </tbody>
  </table>

  <div class="footer">
    تولید شده به صورت خودکار توسط سیستم مرکزی EasyShop — لینک کالا: ${qrPayload}
  </div>
</body>
</html>`;

    return {
      product_id: product.id,
      title: product.name_fa || product.name_en,
      html_content: html,
      qr_link: qrPayload,
      generated_at: new Date().toISOString()
    };
  }
}

export const productSpecSheetService = new ProductSpecSheetService();
