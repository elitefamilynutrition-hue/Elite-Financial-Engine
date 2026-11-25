/** Product flags. Affiliate stays off until counsel disclosure copy exists. */
export function isAffiliateCtaEnabled(): boolean {
  return (process.env.ENABLE_AFFILIATE_CTA || '').trim().toLowerCase() === 'true';
}
