import { describe, expect, it } from 'vitest';
import { CATEGORY_BUCKETS, resolveCategoryBucket } from '@/lib/analytics/category-buckets';

describe('resolveCategoryBucket', () => {
  it('exposes the display catalog', () => {
    expect(CATEGORY_BUCKETS.length).toBeGreaterThanOrEqual(8);
  });

  it('maps groceries to essentials', () => {
    expect(resolveCategoryBucket('FOOD_AND_DRINK_GROCERIES').id).toBe('essentials');
  });

  it('maps rent to housing', () => {
    expect(resolveCategoryBucket('RENT_AND_UTILITIES_RENT').id).toBe('housing');
  });

  it('falls back to other for unknown codes', () => {
    expect(resolveCategoryBucket('TOTALLY_UNKNOWN_XYZ').id).toBe('other');
  });
});
