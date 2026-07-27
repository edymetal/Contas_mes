import { MONTHS_PT } from "../config/forms.js";
import { CATEGORIES } from "../config/people.js";
import {
  getExpenseDisplayMonthKey,
  getExpenseKind,
  roundMoney,
} from "./expenses.js";

export function calculateDashboardMetrics(expenses) {
  return expenses.reduce(
    (metrics, expense) => {
      metrics.total += Number(expense.totalValue || 0);

      Object.entries(expense.shares || {}).forEach(([personId, share]) => {
        if (personId === expense.payerId) return;
        if (share.status === "pending") metrics.pending += Number(share.amount || 0);
        if (share.status === "paid" || share.status === "settled") {
          metrics.paid += Number(share.amount || 0);
        }
      });

      return metrics;
    },
    { total: 0, pending: 0, paid: 0 },
  );
}

export function calculateCategoryTotals(expenses, categories = CATEGORIES) {
  const totals = categories.map((category) => ({
    category,
    total: expenses
      .filter((expense) => expense.category === category)
      .reduce((sum, expense) => sum + Number(expense.totalValue || 0), 0),
  }));
  const max = Math.max(...totals.map((item) => item.total), 1);

  return totals.map((item) => ({
    ...item,
    percent: (item.total / max) * 100,
  }));
}

export function calculateDashboardBreakdown(expenses) {
  const rows = [
    { id: "normal", label: "Normais", total: 0, count: 0 },
    { id: "fixed", label: "Fixas", total: 0, count: 0 },
    { id: "installment", label: "Parceladas", total: 0, count: 0 },
  ];
  const byId = new Map(rows.map((row) => [row.id, row]));

  expenses.forEach((expense) => {
    const row = byId.get(getExpenseKind(expense));
    if (!row) return;
    row.count += 1;
    row.total = roundMoney(row.total + Number(expense.totalValue || 0));
  });

  const total = rows.reduce((sum, row) => roundMoney(sum + row.total), 0);
  const max = Math.max(...rows.map((row) => row.total), 1);

  return {
    total,
    rows: rows.map((row) => ({
      ...row,
      percent: total ? (row.total / total) * 100 : 0,
      barPercent: (row.total / max) * 100,
    })),
  };
}

export function calculateDashboardYearSummary(
  normalizedExpenses,
  selectedMonth,
  monthsConfig = MONTHS_PT,
) {
  const year = selectedMonth.slice(0, 4);
  const months = monthsConfig.map((month) => {
    const monthKey = `${year}-${month.value}`;
    const monthExpenses = normalizedExpenses.filter(
      (expense) => getExpenseDisplayMonthKey(expense) === monthKey,
    );

    return {
      monthKey,
      label: month.short,
      count: monthExpenses.length,
      total: roundMoney(
        monthExpenses.reduce((sum, expense) => sum + Number(expense.totalValue || 0), 0),
      ),
    };
  });
  const total = roundMoney(months.reduce((sum, month) => sum + month.total, 0));
  const largestMonthTotal = Math.max(...months.map((month) => month.total), 1);

  return {
    year,
    total,
    months: months.map((month) => ({
      ...month,
      percent: (month.total / largestMonthTotal) * 100,
    })),
  };
}
