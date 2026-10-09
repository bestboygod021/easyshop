import { create } from 'zustand';
import { useUI } from '../store';

/** دیکشنری دو‌زبانه — فارسی (پیش‌فرض) و انگلیسی */
export const dictionaries = {
  fa: {
    'nav.home': 'خانه',
    'nav.products': 'فروشگاه',
    'nav.categories': 'دسته‌بندی‌ها',
    'nav.deals': 'تخفیف‌ها',
    'nav.support': 'پشتیبانی',
    'nav.account': 'پنل کاربری',
    'nav.admin': 'پنل مدیریت',
    'nav.cart': 'سبد خرید',
    'nav.wishlist': 'علاقه‌مندی‌ها',
    'nav.login': 'ورود / ثبت‌نام',
    'nav.logout': 'خروج',
    'nav.orders': 'سفارش‌ها',
    'nav.wallet': 'کیف پول',
    'nav.tickets': 'تیکت‌ها',
    'nav.chat': 'گفتگوی زنده',
    'nav.notifications': 'اعلان‌ها',
    'action.add_to_cart': 'افزودن به سبد خرید',
    'action.buy_now': 'خرید سریع',
    'action.continue': 'ادامه',
    'action.checkout': 'تکمیل خرید',
    'action.save': 'ذخیره',
    'action.cancel': 'انصراف',
    'action.search': 'جستجوی محصول، برند یا دسته‌بندی…',
    'action.apply': 'اعمال',
    'action.more': 'بیشتر',
    'label.price': 'قیمت',
    'label.total': 'مبلغ کل',
    'label.subtotal': 'جمع کالاها',
    'label.discount': 'تخفیف',
    'label.shipping': 'هزینه ارسال',
    'label.tax': 'مالیات بر ارزش افزوده',
    'label.in_stock': 'موجود',
    'label.out_of_stock': 'ناموجود',
    'label.free_shipping': 'ارسال رایگان',
    'label.rating': 'امتیاز',
    'label.reviews': 'نظر',
    'label.quantity': 'تعداد',
    'label.new': 'جدید',
    'label.best_seller': 'پرفروش',
    'label.low_stock': 'موجودی کم',
    'home.hero_title': 'هر آنچه می‌خواهید، سریع و مطمئن',
    'home.hero_sub': 'هزاران کالا از برندهای معتبر، با ارسال سریع، ضمانت بازگشت و دستیار خرید هوشمند.',
    'home.featured': 'منتخب‌های EasyShop',
    'home.best_sellers': 'پرفروش‌ترین‌ها',
    'home.deals': 'پیشنهادهای شگفت‌انگیز',
    'home.newest': 'جدیدترین محصولات',
    'home.categories': 'دسته‌بندی‌های محبوب',
    'home.ai_assistant': 'دستیار هوشمند خرید',
    'home.ai_assistant_desc': 'بگویید دنبال چه هستید؛ هوش مصنوعی بهترین گزینه‌ها را پیشنهاد می‌دهد.',
  },
  en: {
    'nav.home': 'Home',
    'nav.products': 'Shop',
    'nav.categories': 'Categories',
    'nav.deals': 'Deals',
    'nav.support': 'Support',
    'nav.account': 'My account',
    'nav.admin': 'Admin panel',
    'nav.cart': 'Cart',
    'nav.wishlist': 'Wishlist',
    'nav.login': 'Sign in / Register',
    'nav.logout': 'Sign out',
    'nav.orders': 'Orders',
    'nav.wallet': 'Wallet',
    'nav.tickets': 'Tickets',
    'nav.chat': 'Live chat',
    'nav.notifications': 'Notifications',
    'action.add_to_cart': 'Add to cart',
    'action.buy_now': 'Buy now',
    'action.continue': 'Continue',
    'action.checkout': 'Checkout',
    'action.save': 'Save',
    'action.cancel': 'Cancel',
    'action.search': 'Search products, brands or categories…',
    'action.apply': 'Apply',
    'action.more': 'More',
    'label.price': 'Price',
    'label.total': 'Total',
    'label.subtotal': 'Subtotal',
    'label.discount': 'Discount',
    'label.shipping': 'Shipping',
    'label.tax': 'VAT',
    'label.in_stock': 'In stock',
    'label.out_of_stock': 'Out of stock',
    'label.free_shipping': 'Free shipping',
    'label.rating': 'Rating',
    'label.reviews': 'reviews',
    'label.quantity': 'Quantity',
    'label.new': 'New',
    'label.best_seller': 'Best seller',
    'label.low_stock': 'Low stock',
    'home.hero_title': 'Everything you need, fast and reliable',
    'home.hero_sub': 'Thousands of products from trusted brands with fast delivery, easy returns and an AI shopping assistant.',
    'home.featured': 'EasyShop picks',
    'home.best_sellers': 'Best sellers',
    'home.deals': 'Hot deals',
    'home.newest': 'New arrivals',
    'home.categories': 'Popular categories',
    'home.ai_assistant': 'AI shopping assistant',
    'home.ai_assistant_desc': 'Tell us what you need and AI will suggest the best options.',
  },
};

export function translate(locale, key, fallback) {
  return dictionaries[locale]?.[key] ?? dictionaries.fa[key] ?? fallback ?? key;
}

/** هوک ترجمه */
export function useI18n() {
  const locale = useUI((s) => s.locale);
  const setLocale = useUI((s) => s.setLocale);
  const t = (key, fallback) => translate(locale, key, fallback);
  return { locale, setLocale, t, rtl: locale === 'fa' };
}

/** انتخاب متن فارسی/انگلیسی از داده‌های دوزبانه */
export const pick = (locale, faText, enText) => (locale === 'en' ? enText || faText : faText);

export default { dictionaries, translate, useI18n, pick };
