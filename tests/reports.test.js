import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateReportChange,
  createAnnualReport,
  createReportComparison,
  createReportCsv,
  createReportSnapshot,
} from "../src/domain/reports.js";

const expenses = [
  {
    id: "expense-july",
    title: "Aluguel",
    category: "Casa",
    dueDate: "2026-07-10",
    monthKey: "2026-07",
    payerId: "edney",
    participants: ["edney", "sonia", "rodney"],
    splitMode: "percentage",
    totalValue: 100,
    shares: {
      edney: { amount: 50, status: "self" },
      sonia: { amount: 30, status: "pending" },
      rodney: { amount: 20, status: "pending" },
    },
  },
  {
    id: "expense-june",
    title: "Internet",
    category: "Casa",
    dueDate: "2026-06-10",
    monthKey: "2026-06",
    payerId: "sonia",
    participants: ["edney", "sonia"],
    totalValue: 40,
    shares: {
      edney: { amount: 20, status: "pending" },
      sonia: { amount: 20, status: "self" },
    },
  },
];

const marketItems = [
  {
    id: "market-july",
    market: "ARD",
    product: "Arroz",
    description: "Alimento",
    purchasedAt: "2026-07-05",
    totalValue: 20,
  },
];

const otherPayments = [
  {
    id: "other-july",
    place: "Oficina",
    product: "Revisão",
    paymentMethod: "Cartão",
    paidAt: "2026-07-08",
    totalValue: 30,
  },
];

test("relatório mensal consolida fontes sem perder o rateio por pessoa", () => {
  const snapshot = createReportSnapshot(expenses, marketItems, otherPayments, "2026-07");

  assert.deepEqual(snapshot.totals, {
    shared: 100,
    market: 20,
    other: 30,
    consolidated: 150,
  });
  assert.deepEqual(snapshot.counts, {
    shared: 1,
    market: 1,
    other: 1,
    consolidated: 3,
  });
  assert.equal(snapshot.people.find((row) => row.key === "edney").value, 50);
  assert.equal(snapshot.people.find((row) => row.key === "sonia").value, 30);
  assert.equal(snapshot.establishments.find((row) => row.label === "ARD DISCOUNT").value, 20);
});

test("comparação calcula diferença e percentual entre os meses", () => {
  const comparison = createReportComparison(
    expenses,
    marketItems,
    otherPayments,
    "2026-07",
    "2026-06",
  );

  assert.deepEqual(comparison.changes.consolidated, {
    current: 150,
    comparison: 40,
    difference: 110,
    percent: 275,
  });
  assert.deepEqual(calculateReportChange(10, 0), {
    current: 10,
    comparison: 0,
    difference: 10,
    percent: null,
  });
});

test("evolução anual organiza meses e dimensões", () => {
  const report = createAnnualReport(expenses, marketItems, otherPayments, "2026");

  assert.equal(report.months.length, 12);
  assert.equal(report.total, 190);
  assert.equal(report.months.find((month) => month.monthKey === "2026-07").total, 150);
  assert.equal(report.dimensions.categories.find((row) => row.label === "Casa").total, 140);
  assert.equal(report.dimensions.establishments.find((row) => row.label === "Oficina").total, 30);
});

test("CSV exporta detalhes das três origens e escapa conteúdo", () => {
  const csv = createReportCsv(
    [{ ...expenses[0], title: 'Aluguel "principal"' }],
    marketItems,
    otherPayments,
    "2026-07",
  );

  assert.match(csv, /Contas compartilhadas/);
  assert.match(csv, /Mercado/);
  assert.match(csv, /Outros pagamentos/);
  assert.match(csv, /Aluguel ""principal""/);
  assert.match(csv, /Percentual/);
  assert.match(csv, /Edney: 50,00/);
});
