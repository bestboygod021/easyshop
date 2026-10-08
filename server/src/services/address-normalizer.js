/**
 * Validates Iranian 10-digit postal codes and normalizes address strings.
 * Rules for valid Iranian postal code:
 * - Exactly 10 digits
 * - Does not contain 0 or 2 in the first 5 digits (dispatch zone)
 * - First 4 digits are not repetitive (e.g. 1111 is invalid)
 */
export function validateIranianPostalCode(code) {
  const clean = String(code || '').replace(/[^0-9]/g, '');
  if (clean.length !== 10) {
    return { valid: false, reason: 'کد پستی باید دقیقاً ۱۰ رقم باشد.' };
  }
  const first5 = clean.slice(0, 5);
  if (first5.includes('0') || first5.includes('2')) {
    return { valid: false, reason: 'پنج رقم اول کد پستی ایران نمی‌تواند شامل ۰ یا ۲ باشد.' };
  }
  if (/^(\d)\1{3}/.test(clean)) {
    return { valid: false, reason: 'چهار رقم اول کد پستی نمی‌تواند یکسان و تکراری باشد.' };
  }
  return { valid: true, postal_code: clean };
}

/**
 * Normalizes address details and resolves coordinates / neighbourhood mock metadata.
 */
export function normalizeAddress({ province, city, line, postalCode, lat, lng }) {
  const normProvince = String(province || '').trim();
  const normCity = String(city || '').trim();
  const normLine = String(line || '').trim();
  const postalValidation = postalCode ? validateIranianPostalCode(postalCode) : { valid: true, postal_code: null };

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const hasCoordinates = !isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat >= 25 && parsedLat <= 40 && parsedLng >= 44 && parsedLng <= 64;

  return {
    province: normProvince,
    city: normCity,
    line: normLine,
    postal_code: postalValidation.postal_code || null,
    postal_code_valid: postalValidation.valid,
    coordinates: hasCoordinates ? { lat: parsedLat, lng: parsedLng } : null,
    geocoded: hasCoordinates,
    neighbourhood_hint: normCity === 'تهران' ? 'منطقه شهری تهران بزرگ' : normCity,
  };
}
