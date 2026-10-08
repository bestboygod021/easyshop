/**
 * System Feature Toggles & Module Controller Service (Round 29)
 * Centralizes on/off switch toggles for all continuous improvement modules and store features.
 * Persists toggles in system settings or database with instant admin control.
 */

export class FeatureTogglesService {
  constructor(db) {
    this.db = db;
    // Default system modules
    this.defaultFeatures = {
      // Round 29
      click_and_collect: true,
      gross_profit_analyzer: true,
      ai_next_order_predictor: true,
      affiliate_shortlinks: true,
      vendor_digital_contracts: true,

      // Round 28
      wholesale_volume_pricing: true,
      volumetric_packaging_optimizer: true,
      pattern_transactional_sms: true,
      checkout_cross_sell_bumper: true,
      open_box_outlet: true,

      // Round 27
      currency_pegged_pricing: true,
      high_value_bank_transfers: true,
      tiered_vendor_commission: true,
      personalized_gift_wrap: true,
      third_party_warranty_registry: true,

      // Round 26
      scratch_authenticity: true,
      smart_replenishment: true,
      inventory_cycle_count: true,
      b2b_corporate_invoicing: true,
      social_banner_generator: true,

      // Round 25
      pre_order_deposits: true,
      order_consolidation: true,
      rma_fraud_shield: true,
      b2b_price_list: true,
      spin_the_wheel: true
    };
  }

  /**
   * Get current state of all feature toggles
   */
  async getAllFeatures() {
    const rows = await this.db.all('SELECT feature_key, is_enabled FROM system_feature_toggles');
    const toggles = { ...this.defaultFeatures };

    for (const row of rows) {
      toggles[row.feature_key] = Boolean(row.is_enabled);
    }

    return toggles;
  }

  /**
   * Check if a specific feature is enabled
   */
  async isFeatureEnabled(featureKey) {
    const row = await this.db.get(
      'SELECT is_enabled FROM system_feature_toggles WHERE feature_key = ?',
      [featureKey]
    );

    if (row !== null && row !== undefined) {
      return Boolean(row.is_enabled);
    }

    return this.defaultFeatures[featureKey] !== undefined ? this.defaultFeatures[featureKey] : true;
  }

  /**
   * Toggle or set feature state
   */
  async setFeatureState(featureKey, isEnabled, updatedByUserId = null) {
    if (!featureKey) throw new Error('کلید ماژول الزامی است');
    const enabled = isEnabled ? 1 : 0;
    const now = new Date().toISOString();

    const existing = await this.db.get(
      'SELECT * FROM system_feature_toggles WHERE feature_key = ?',
      [featureKey]
    );

    if (existing) {
      await this.db.run(
        'UPDATE system_feature_toggles SET is_enabled = ?, updated_by_user_id = ?, updated_at = ? WHERE feature_key = ?',
        [enabled, updatedByUserId, now, featureKey]
      );
    } else {
      await this.db.run(
        'INSERT INTO system_feature_toggles (feature_key, is_enabled, updated_by_user_id, updated_at) VALUES (?, ?, ?, ?)',
        [featureKey, enabled, updatedByUserId, now]
      );
    }

    return {
      feature_key: featureKey,
      is_enabled: Boolean(enabled),
      updated_at: now,
      message: `ماژول «${featureKey}» با موفقیت ${enabled ? 'فعال (روشن)' : 'غیرفعال (خاموش)'} گردید.`
    };
  }
}
