/**
 * Builds Schema.org JSON-LD microdata for rich Google search snippets.
 */

export function buildProductJsonLd(product, baseUrl = 'https://easyshop.example.com') {
  if (!product) return null;

  return {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name_fa || product.name,
    description: product.description || product.name_fa,
    sku: product.sku || product.id,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'IRR',
      price: (Number(product.price) || 0) * 10, // Toman to Rial for international schema standard
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${baseUrl}/products/${product.slug || product.id}`,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '24',
    },
  };
}
