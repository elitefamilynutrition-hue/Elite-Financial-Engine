'use client';

interface Account {
  id: string;
  account_name: string;
  account_type: string;
  current_balance: number;
}

interface Transaction {
  id: string;
  amount: number;
  category: string | null;
  date: string;
  name: string;
}

interface TelemetryGridProps {
  accounts: Account[];
  transactions: Transaction[];
}

export function TelemetryGrid({ accounts, transactions }: TelemetryGridProps) {
  // 1. Calculate Top-Level Financial Metrics
  const liquidCapital = accounts
    .filter((a) => a.account_type.toLowerCase() === 'depository')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const revolvingDebt = accounts
    .filter((a) => a.account_type.toLowerCase() === 'credit')
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const netLiquidity = liquidCapital - revolvingDebt;

  // 2. Normalized Operational Burn Filter
  const nonOperationalKeywords = ['transfer', 'payment', 'credit card', 'deposit', 'wire', 'investment', 'payroll'];
  
  let operationalBurn = 0;
  const categoryMap: { [key: string]: number } = {};

  transactions
    .filter((t) => Number(t.amount) > 0)
    .forEach((t) => {
      const amt = Number(t.amount);
      const cat = (t.category || '').toLowerCase();
      const name = (t.name || '').toLowerCase();
      
      const isExcluded = nonOperationalKeywords.some((kw) => cat.includes(kw) || name.includes(kw));

      if (!isExcluded) {
        operationalBurn += amt;
        const primaryCat = t.category ? t.category.split(',')[0].trim() : 'Uncategorized';
        categoryMap[primaryCat] = (categoryMap[primaryCat] || 0) + amt;
      }
    });

  const sortedCategories = Object.entries(categoryMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: operationalBurn > 0 ? (amount / operationalBurn) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      {/* 4-KPI Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Liquid Capital</p>
          <p className="text-2xl font-bold tracking-tight text-emerald-400">
            ${liquidCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Revolving Debt</p>
          <p className="text-2xl font-bold tracking-tight text-rose-400">
            ${revolvingDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">Net Liquidity</p>
          <p className={`text-2xl font-bold tracking-tight ${netLiquidity >= 0 ? 'text-white' : 'text-rose-400'}`}>
            ${netLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-zinc-400">30-Day Outflow Burn</p>
          <p className="text-2xl font-bold tracking-tight text-amber-400">
            ${operationalBurn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Category Spending Breakdown */}
      {sortedCategories.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Category Burn Distribution
          </h3>
          <div className="space-y-4">
            {sortedCategories.map(({ category, amount, percentage }) => (
              <div key={category} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-zinc-200">{category}</span>
                  <span className="font-mono text-zinc-400">
                    ${amount.toFixed(2)} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}