import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCategoryTotals,
  calculateDashboardBreakdown,
  calculateDashboardMetrics,
  calculateDashboardYearSummary,
} from "../src/domain/dashboard.js";

const expenses = [
  {
    id: "normal",
    category: "Casa",
    dueDate: "2026-01-10",
    payerId: "edney",
    totalValue: 120,
    shares: {
      edney: { amount: 40, status: "self" },
      sonia: { amount: 40, status: "pending" },
      rodney: { amount: 40, status: "paid" },
    },
  },
  {
    id: "fixed",
    category: "Casa",
    dueDate: "2026-02-10",
    payerId: "sonia",
    totalValue: 60,
    type: "recurring",
    shares: {
      edney: { amount: 20, status: "settled" },
      sonia: { amount: 20, status: "self" },
      rodney: { amount: 20, status: "pending" },
    },
  },
  {
    id: "installment",
    category: "Carro",
    dueDate: "2026-02-20",
    payerId: "rodney",
    totalValue: 30,
    installment: "Parcela 2 de 6",
    shares: {
      edney: { amount: 10, status: "pending" },
      sonia: { amount: 10, status: "paid" },
      rodney: { amount: 10, status: "self" },
    },
  },
];

test("calcula indicadores de rateio sem contar a cota do pagador", () => {
  assert.deepEqual(calculateDashboardMetrics(expenses), {
    total: 210,
    pending: 70,
    paid: 70,
  });
});

test("agrupa totais por categoria e mantém categorias sem lançamentos", () => {
  assert.deepEqual(calculateCategoryTotals(expenses, ["Casa", "Carro", "Viagem"]), [
    { category: "Casa", total: 180, percent: 100 },
    { category: "Carro", total: 30, percent: 30 / 180 * 100 },
    { category: "Viagem", total: 0, percent: 0 },
  ]);
});

test("separa contas normais, fixas e parceladas no dashboard", () => {
  assert.deepEqual(calculateDashboardBreakdown(expenses), {
    total: 210,
    rows: [
      {
        id: "normal",
        label: "Normais",
        total: 120,
        count: 1,
        percent: 120 / 210 * 100,
        barPercent: 100,
      },
      {
        id: "fixed",
        label: "Fixas",
        total: 60,
        count: 1,
        percent: 60 / 210 * 100,
        barPercent: 50,
      },
      {
        id: "installment",
        label: "Parceladas",
        total: 30,
        count: 1,
        percent: 30 / 210 * 100,
        barPercent: 25,
      },
    ],
  });
});

test("resume o ano usando o mês exibido de cada conta", () => {
  const summary = calculateDashboardYearSummary(expenses, "2026-02", [
    { value: "01", short: "Jan" },
    { value: "02", short: "Fev" },
    { value: "03", short: "Mar" },
  ]);

  assert.deepEqual(summary, {
    year: "2026",
    total: 210,
    months: [
      { monthKey: "2026-01", label: "Jan", count: 1, total: 120, percent: 100 },
      { monthKey: "2026-02", label: "Fev", count: 2, total: 90, percent: 75 },
      { monthKey: "2026-03", label: "Mar", count: 0, total: 0, percent: 0 },
    ],
  });
});
