/**
 * Volumetric Weight & Packaging Optimizer Service (Round 28)
 * Calculates volumetric weight according to Iran Post / IATA courier formula: (L x W x H cm) / 5000.
 * Determines the optimal standard postal carton size to prevent freight penalties and minimize shipping costs.
 */

export class VolumetricPackagingOptimizerService {
  constructor() {
    // Standard Iran Post carton dimensions (cm)
    this.standardCartons = [
      { id: 'POST_SIZE_1', name: 'کارتن سایز ۱ پستی', length: 15, width: 10, height: 10, maxVolumeCm3: 1500, emptyWeightGrams: 80 },
      { id: 'POST_SIZE_2', name: 'کارتن سایز ۲ پستی', length: 20, width: 15, height: 10, maxVolumeCm3: 3000, emptyWeightGrams: 120 },
      { id: 'POST_SIZE_3', name: 'کارتن سایز ۳ پستی', length: 20, width: 20, height: 15, maxVolumeCm3: 6000, emptyWeightGrams: 180 },
      { id: 'POST_SIZE_4', name: 'کارتن سایز ۴ پستی', length: 30, width: 20, height: 20, maxVolumeCm3: 12000, emptyWeightGrams: 260 },
      { id: 'POST_SIZE_5', name: 'کارتن سایز ۵ پستی', length: 40, width: 30, height: 25, maxVolumeCm3: 30000, emptyWeightGrams: 420 },
      { id: 'POST_SIZE_6', name: 'کارتن سایز ۶ پستی (بزرگ)', length: 50, width: 40, height: 35, maxVolumeCm3: 70000, emptyWeightGrams: 750 }
    ];
  }

  /**
   * Calculate volumetric weight and choose best carton
   * @param {Array<{lengthCm: number, widthCm: number, heightCm: number, weightGrams: number, quantity: number}>} items
   */
  optimizeShipmentPackage(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('فهرست اقلام ارسالی برای محاسبه بسته‌بندی الزامی است');
    }

    let totalPhysicalWeightGrams = 0;
    let totalVolumeCm3 = 0;

    for (const item of items) {
      const qty = Math.max(Number(item.quantity) || 1, 1);
      const l = Math.max(Number(item.lengthCm) || 10, 1);
      const w = Math.max(Number(item.widthCm) || 10, 1);
      const h = Math.max(Number(item.heightCm) || 5, 1);
      const weight = Math.max(Number(item.weightGrams) || 200, 10);

      totalPhysicalWeightGrams += weight * qty;
      totalVolumeCm3 += (l * w * h) * qty;
    }

    // Safety factor for bubble wrap & cushioning (+20% volume)
    const bufferedVolumeCm3 = Math.round(totalVolumeCm3 * 1.2);

    // Pick smallest carton that fits volume
    let chosenCarton = this.standardCartons.find(c => c.maxVolumeCm3 >= bufferedVolumeCm3);
    if (!chosenCarton) {
      chosenCarton = this.standardCartons[this.standardCartons.length - 1]; // largest
    }

    // Volumetric weight formula: (L * W * H) / 5000 in kg
    const cartonVolume = chosenCarton.length * chosenCarton.width * chosenCarton.height;
    const volumetricWeightKg = Math.round((cartonVolume / 5000) * 100) / 100;
    const physicalWeightKg = Math.round(((totalPhysicalWeightGrams + chosenCarton.emptyWeightGrams) / 1000) * 100) / 100;

    // Billable weight is maximum of physical vs volumetric weight
    const billableWeightKg = Math.max(physicalWeightKg, volumetricWeightKg);
    const isVolumetricPenaltyApplied = volumetricWeightKg > physicalWeightKg;

    return {
      recommended_carton: {
        id: chosenCarton.id,
        name: chosenCarton.name,
        dimensions: `${chosenCarton.length}x${chosenCarton.width}x${chosenCarton.height} cm`,
        max_capacity_cm3: chosenCarton.maxVolumeCm3
      },
      content_volume_cm3: totalVolumeCm3,
      buffered_volume_cm3: bufferedVolumeCm3,
      physical_weight_kg: physicalWeightKg,
      volumetric_weight_kg: volumetricWeightKg,
      billable_weight_kg: billableWeightKg,
      is_oversized_volumetric: isVolumetricPenaltyApplied,
      recommendation: isVolumetricPenaltyApplied
        ? 'توجه: وزن حجمی بسته از وزن فیزیکی بیشتر است و مبنای محاسبه هزینه کرایه پستی وزن حجمی خواهد بود.'
        : 'ابعاد کارتن کاملاً بهینه است و کرایه بر اساس وزن فیزیکی محاسبه می‌گردد.'
    };
  }
}
