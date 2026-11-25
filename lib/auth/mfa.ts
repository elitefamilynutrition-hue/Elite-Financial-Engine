import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ApiError } from '@/lib/http/api-error';

/** True when ENFORCE_MFA_FOR_LAB=true. */
export function isLabMfaEnforced(): boolean {
  return (process.env.ENFORCE_MFA_FOR_LAB || '').trim().toLowerCase() === 'true';
}

/**
 * If Lab MFA enforcement is on and the user has a verified TOTP factor,
 * require AAL2. Users with no factors yet can still enroll.
 */
export async function assertLabMfaIfRequired(
  supabase: SupabaseClient,
  _user: User
): Promise<void> {
  if (!isLabMfaEnforced()) return;

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    throw ApiError.forbidden('Unable to verify MFA assurance level.');
  }

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (factorsData?.totp || []).filter((f) => f.status === 'verified');

  if (verifiedTotp.length === 0) {
    // Enrollment still allowed — UI should send them to /lab/security
    return;
  }

  if (aal?.currentLevel !== 'aal2') {
    throw ApiError.forbidden('MFA challenge required for Lab. Complete verification at /lab/security.');
  }
}
