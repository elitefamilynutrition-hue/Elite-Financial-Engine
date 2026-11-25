import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canAccessLab, isAdminEmail, isLabEnabled, isRagTaxEnabled } from '@/lib/auth/admin';
import { toErrorResponse } from '@/lib/http/api-error';

/**
 * Client-safe Lab visibility probe (does not leak the admin allowlist).
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const labEnabled = isLabEnabled();
    const allowed = canAccessLab(user);
    const admin = isAdminEmail(user);

    return NextResponse.json({
      lab_enabled: labEnabled,
      lab_allowed: allowed,
      is_admin: admin,
      rag_tax_enabled: isRagTaxEnabled() && allowed,
      mfa_enforcement: (process.env.ENFORCE_MFA_FOR_LAB || '').trim().toLowerCase() === 'true',
    });
  } catch (error) {
    return toErrorResponse(error, 'lab-access');
  }
}
