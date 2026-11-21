import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { stampHistoricalSnapshot } from '@/lib/analytics/stamp-snapshot';

/**
 * Sole session-scoped snapshot writer. Cron uses stampHistoricalSnapshot directly.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const stamped = await stampHistoricalSnapshot(user.id);

    return NextResponse.json({
      status: 'SUCCESS',
      message: `Historical snapshot stamped for ${stamped.snapshot_date}.`,
      telemetry: {
        liquid_capital: stamped.liquid_capital,
        investment_capital: stamped.investment_capital,
        total_liabilities: stamped.total_liabilities,
        survival_floor: stamped.survival_floor,
        monthly_burn_rate: stamped.monthly_burn_rate,
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'snapshot');
  }
}
