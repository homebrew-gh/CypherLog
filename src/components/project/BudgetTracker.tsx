import { DollarSign, TrendingUp, TrendingDown, PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useBudgetSummary } from '@/hooks/useProjectMaterials';
import { useCurrency } from '@/hooks/useCurrency';
import { EXPENSE_CATEGORIES } from '@/lib/types';

interface BudgetTrackerProps {
  projectId: string;
  originalBudget?: string;
}

const getCategoryLabel = (value: string) => {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label || value;
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'materials': return 'bg-blue-500';
    case 'labor': return 'bg-purple-500';
    case 'rentals': return 'bg-orange-500';
    case 'permits': return 'bg-red-500';
    case 'tools': return 'bg-slate-500';
    case 'delivery': return 'bg-green-500';
    default: return 'bg-gray-500';
  }
};

export function BudgetTracker({ projectId, originalBudget }: BudgetTrackerProps) {
  const {
    totalPlanned,
    totalEstimated,
    totalActual,
    variance,
    budgetAmount,
    remaining,
    percentUsed,
    categoryBreakdown,
    isOverBudget,
  } = useBudgetSummary(projectId, originalBudget);
  const { formatForDisplay } = useCurrency();

  const hasBudget = budgetAmount > 0;
  const hasExpenses = totalPlanned > 0;
  const hasVariance = totalEstimated !== totalActual && (totalEstimated > 0 || totalActual > 0);
  const categories = Object.entries(categoryBreakdown);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5 text-primary" />
          Budget Tracker
        </CardTitle>
        {hasBudget && (
          <CardDescription>
            Tracking against {formatForDisplay(budgetAmount)} budget
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6 budget-tracker">
        {/* Main Stats - use class for PWA-only layout overrides in index.css */}
        <div className="budget-tracker-stats grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Total Actual (Spent) */}
          <div className="text-left sm:text-center p-4 rounded-lg bg-muted/50 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">Actual (Spent)</p>
            <p className={`budget-tracker-value text-xl sm:text-2xl font-bold tabular-nums break-words sm:truncate ${isOverBudget ? 'text-destructive' : 'text-foreground'}`} title={formatForDisplay(totalActual)}>
              {formatForDisplay(totalActual)}
            </p>
          </div>

          {/* Estimated (Planned) / Budget */}
          <div className="text-left sm:text-center p-4 rounded-lg bg-muted/50 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">
              {hasBudget ? 'Budget' : 'Estimated'}
            </p>
            <p className="budget-tracker-value text-xl sm:text-2xl font-bold tabular-nums break-words sm:truncate text-foreground" title={formatForDisplay(hasBudget ? budgetAmount : totalEstimated)}>
              {formatForDisplay(hasBudget ? budgetAmount : totalEstimated)}
            </p>
          </div>

          {/* Remaining / Variance / To Spend */}
          <div className="text-left sm:text-center p-4 rounded-lg bg-muted/50 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">
              {hasBudget ? 'Remaining' : hasVariance ? 'Variance' : 'To Spend'}
            </p>
            <p className={`budget-tracker-value text-xl sm:text-2xl font-bold tabular-nums flex flex-wrap sm:flex-nowrap items-center gap-1 min-w-0 sm:justify-center ${
              hasBudget
                ? isOverBudget ? 'text-destructive' : 'text-green-600'
                : hasVariance
                  ? variance > 0 ? 'text-green-600' : 'text-destructive'
                  : 'text-foreground'
            }`} title={
              hasBudget ? formatForDisplay(Math.abs(remaining)) : hasVariance ? formatForDisplay(Math.abs(variance)) : formatForDisplay(totalEstimated - totalActual)
            }>
              {hasBudget ? (
                <>
                  <span className="shrink-0">{isOverBudget ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}</span>
                  <span className="min-w-0 break-words sm:truncate">{formatForDisplay(Math.abs(remaining))}</span>
                </>
              ) : hasVariance ? (
                <>
                  <span className="shrink-0">{variance > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}</span>
                  <span className="min-w-0 break-words sm:truncate">{formatForDisplay(Math.abs(variance))} {variance > 0 ? 'under' : 'over'}</span>
                </>
              ) : (
                <span className="min-w-0 break-words sm:truncate">{formatForDisplay(totalEstimated - totalActual)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Estimated vs Actual summary when there is variance */}
        {hasVariance && (
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Est. total: {formatForDisplay(totalEstimated)}</span>
            <span>Actual total: {formatForDisplay(totalActual)}</span>
          </div>
        )}

        {/* Progress Bar (only if budget is set) */}
        {hasBudget && (
          <div className="space-y-2 budget-tracker-progress">
            <div className="flex justify-between items-center gap-2 text-sm min-w-0">
              <span className="text-muted-foreground shrink-0">Budget Used</span>
              <span className={`font-medium truncate text-right ${isOverBudget ? 'text-destructive' : 'text-foreground'}`}>
                {Math.min(percentUsed, 100).toFixed(0)}%
                {percentUsed > 100 && ` (${percentUsed.toFixed(0)}% of budget)`}
              </span>
            </div>
            <Progress 
              value={Math.min(percentUsed, 100)} 
              className={`h-3 ${isOverBudget ? '[&>div]:bg-destructive' : ''}`}
            />
          </div>
        )}

        {/* Category Breakdown */}
        {hasExpenses && categories.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <PieChart className="h-4 w-4" />
              Breakdown by Category
            </div>
            <div className="space-y-2">
              {categories.map(([category, { planned, spent }]) => {
                const categoryPercent = totalPlanned > 0 ? (planned / totalPlanned) * 100 : 0;
                const _spentPercent = planned > 0 ? (spent / planned) * 100 : 0;
                
                return (
                  <div key={category} className="space-y-1 budget-tracker-category">
                    <div className="flex justify-between items-center gap-2 text-sm min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${getCategoryColor(category)}`} />
                        <span className="truncate">{getCategoryLabel(category)}</span>
                      </div>
                      <div className="text-right shrink-0 whitespace-nowrap">
                        <span className="font-medium">{formatForDisplay(spent)}</span>
                        <span className="text-muted-foreground"> / {formatForDisplay(planned)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 h-2">
                      <div 
                        className={`${getCategoryColor(category)} rounded-full opacity-30`}
                        style={{ width: `${categoryPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No expenses message */}
        {!hasExpenses && (
          <div className="text-center py-6 text-muted-foreground">
            <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>No expenses tracked yet.</p>
            <p className="text-sm">Add materials or expenses to see budget tracking.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
