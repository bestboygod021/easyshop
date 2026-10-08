import { get, run } from '../db/index.js';

/**
 * سرویس برچسب‌گذاری خودکار کالاها با هوش مصنوعی (AI Auto-Tagging & Classification)
 */
export class AiAutoTaggingService {
  /**
   * استخراج برچسب‌ها و دسته‌بندی کالا بر اساس عنوان و توضیحات
   */
  generateTags(product) {
    if (!product) return { tags: [], suggested_keywords: [] };

    const text = `${product.name_fa || ''} ${product.description_fa || ''} ${product.brand || ''}`.toLowerCase();

    const tagDictionary = [
      { tag: 'دیجیتال', keywords: ['گوشی', 'موبایل', 'لپتاپ', 'تبلت', 'هدفون', 'ساعت هوشمند', 'رم', 'حافظه'] },
      { tag: 'لوازم خانگی', keywords: ['تلویزیون', 'فرش', 'یخچال', 'جاروبرقی', 'آشپزخانه', 'مایکروویو'] },
      { tag: 'مد و پوشاک', keywords: ['پیراهن', 'شلوار', 'کفش', 'کت', 'لباس', 'تیشرت', 'کیف'] },
      { tag: 'آرایشی و بهداشتی', keywords: ['کرم', 'عطر', 'شامپو', 'پوست', 'مو', 'ضدآفتاب'] },
      { tag: 'ارسال فوری', keywords: ['اکسپرس', 'فوری', 'آماده ارسال', 'تحویل امروز'] },
      { tag: 'گارانتی اصالت', keywords: ['اورجینال', 'گارانتی', 'ضمانت', 'اصلی'] },
      { tag: 'تخفیف ویژه', keywords: ['شگفت‌انگیز', 'تخفیف', 'آفر', 'پیشنهاد'] },
    ];

    const matchedTags = new Set();
    const matchedKeywords = new Set();

    for (const entry of tagDictionary) {
      for (const kw of entry.keywords) {
        if (text.includes(kw)) {
          matchedTags.add(entry.tag);
          matchedKeywords.add(kw);
        }
      }
    }

    if (product.brand) {
      matchedTags.add(product.brand);
    }

    const tagsArray = Array.from(matchedTags);
    const keywordsArray = Array.from(matchedKeywords);

    return {
      product_id: product.id,
      tags: tagsArray.length > 0 ? tagsArray : ['کالای برگزیده'],
      suggested_keywords: keywordsArray,
      seo_meta_keywords: [...tagsArray, ...keywordsArray].join(', '),
    };
  }

  /**
   * اعمال برچسب‌های تولید شده روی کالا در پایگاه‌داده
   */
  applyTagsToProduct(productId) {
    const product = get(`SELECT * FROM products WHERE id = ?`, productId);
    if (!product) return null;

    const result = this.generateTags(product);
    run(
      `UPDATE products 
       SET tags = ? 
       WHERE id = ?`,
      JSON.stringify(result.tags), productId
    );

    return result;
  }
}

export const aiAutoTaggingService = new AiAutoTaggingService();
