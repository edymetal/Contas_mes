import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  filterExpensesForMonth,
  formatInstallmentLabel,
  getExpenseKind,
  getExpenseMonthKey,
  getExpensesForMonth,
  getFixedExpenseMonthGroups,
  getInstallmentInfo,
  getInstallmentSeriesMissingHistory,
  getInstallmentSeriesSummaries,
  getMonthDistance,
  getNormalizedExpenses,
  isFixedExpense,
  isSameFixedSeries,
  isSameInstallmentSeries,
  isValidInstallmentExpense,
  roundMoney,
  shiftMonth,
  sumInstallmentExpenses,
} from "../src/domain/expenses.js";

function installment({
  current,
  total = 4,
  dueDate,
  id = `installment-${current}`,
  seriesId = "series-1",
  status = "pending",
  totalValue = 25,
}) {
  return {
    id,
    title: "Notebook",
    category: "Outros",
    payerId: "edney",
    participants: ["edney", "sonia"],
    totalValue,
    dueDate,
    installment: `Parcela ${current} de ${total}`,
    installmentMeta: { current, total, finalDueDate: "" },
    installmentSeriesId: seriesId,
    shares: {
      edney: { amount: totalValue / 2, status: "self", payment: { paidAt: dueDate } },
      sonia: {
        amount: totalValue / 2,
        status,
        payment: status === "pending" ? null : { paidAt: dueDate },
      },
    },
  };
}

test("adiciona meses preservando o último dia válido", () => {
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2026-12-31", 1), "2027-01-31");
});

test("navega e calcula distância entre meses atravessando o ano", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(getMonthDistance("2025-11", "2026-02"), 3);
});

test("usa a data da compra em conta normal e o vencimento nas séries", () => {
  assert.equal(
    getExpenseMonthKey({ dueDate: "2026-08-10", expenseDate: "2026-07-28", type: "normal" }),
    "2026-07",
  );
  assert.equal(
    getExpenseMonthKey({ dueDate: "2026-08-10", expenseDate: "2026-07-28", type: "installment" }),
    "2026-08",
  );
});

test("reconhece parcelas atuais e o formato legado", () => {
  assert.deepEqual(
    getInstallmentInfo({ installmentMeta: { current: "2", total: "5", finalDueDate: "2026-12-10" } }),
    { current: 2, total: 5, finalDueDate: "2026-12-10" },
  );
  assert.deepEqual(
    getInstallmentInfo({ installment: "Parcela 3 de 8" }),
    { current: 3, total: 8, finalDueDate: "" },
  );
  assert.equal(isValidInstallmentExpense({ installment: "Parcela 6 de 5" }), false);
});

test("classifica contas normais, fixas e parceladas", () => {
  assert.equal(isFixedExpense({ installment: "Fixa mensal" }), true);
  assert.equal(isFixedExpense({ type: "recurring" }), true);
  assert.equal(formatInstallmentLabel("Fixo por 12 meses"), "Fixo");
  assert.equal(getExpenseKind({ title: "Água" }), "normal");
  assert.equal(getExpenseKind({ installment: "Parcela 1 de 2" }), "installment");
  assert.equal(getExpenseKind({ isFixed: true }), "fixed");
});

test("identifica séries explícitas e séries legadas equivalentes", () => {
  assert.equal(
    isSameInstallmentSeries(
      installment({ current: 1, dueDate: "2026-01-10", seriesId: "same" }),
      installment({ current: 2, dueDate: "2026-02-10", seriesId: "same" }),
    ),
    true,
  );

  const firstLegacy = {
    ...installment({ current: 1, dueDate: "2026-01-10", seriesId: undefined }),
    installmentSeriesId: undefined,
    participants: ["sonia", "edney"],
  };
  const secondLegacy = {
    ...installment({ current: 2, dueDate: "2026-02-10", seriesId: undefined }),
    installmentSeriesId: undefined,
    title: " notebook ",
    participants: ["edney", "sonia"],
  };
  assert.equal(isSameInstallmentSeries(firstLegacy, secondLegacy), true);

  const fixedReference = {
    installment: "Fixo",
    fixedSeriesId: "fixed-1",
  };
  assert.equal(isSameFixedSeries(fixedReference, { ...fixedReference }), true);
  assert.equal(isSameFixedSeries(fixedReference, { ...fixedReference, fixedSeriesId: "fixed-2" }), false);
});

test("normaliza o mês das parcelas a partir da primeira parcela rastreada", () => {
  const expenses = [
    installment({ current: 2, dueDate: "2026-04-30" }),
    installment({ current: 3, dueDate: "2026-06-30" }),
    installment({ current: 5, total: 4, dueDate: "2026-07-30", id: "invalid" }),
  ];

  const normalized = getNormalizedExpenses(expenses);
  assert.equal(normalized.length, 2);
  assert.equal(normalized.find((expense) => expense.id === "installment-2").displayMonthKey, "2026-04");
  assert.equal(normalized.find((expense) => expense.id === "installment-3").displayMonthKey, "2026-05");
  assert.deepEqual(
    getExpensesForMonth(expenses, "2026-05").map((expense) => expense.id),
    ["installment-3"],
  );
  assert.deepEqual(
    filterExpensesForMonth(normalized, "2026-05").map((expense) => expense.id),
    ["installment-3"],
  );
});

test("calcula totais pagos e restantes de uma série iniciada no histórico", () => {
  const summaries = getInstallmentSeriesSummaries([
    installment({ current: 2, dueDate: "2026-02-28", status: "paid" }),
    installment({ current: 3, dueDate: "2026-03-28", status: "pending" }),
  ]);

  assert.equal(summaries.length, 1);
  assert.deepEqual(
    {
      first: summaries[0].first,
      total: summaries[0].total,
      finalDueDate: summaries[0].finalDueDate,
      paidInstallments: summaries[0].paidInstallments,
      remainingInstallments: summaries[0].remainingInstallments,
      totalValue: summaries[0].totalValue,
      paidValue: summaries[0].paidValue,
      remainingValue: summaries[0].remainingValue,
      completed: summaries[0].completed,
    },
    {
      first: 2,
      total: 4,
      finalDueDate: "2026-04-28",
      paidInstallments: 2,
      remainingInstallments: 2,
      totalValue: 100,
      paidValue: 50,
      remainingValue: 50,
      completed: false,
    },
  );
});

test("detecta histórico ausente somente quando a série começa depois da primeira parcela", () => {
  const missing = getInstallmentSeriesMissingHistory([
    installment({ current: 3, dueDate: "2026-03-10" }),
    installment({ current: 4, dueDate: "2026-04-10" }),
  ]);
  const complete = getInstallmentSeriesMissingHistory([
    installment({ current: 1, dueDate: "2026-01-10" }),
    installment({ current: 2, dueDate: "2026-02-10" }),
  ]);

  assert.equal(missing.length, 1);
  assert.equal(missing[0].first, 3);
  assert.equal(complete.length, 0);
});

test("agrupa somente contas fixas por mês e soma com precisão monetária", () => {
  const groups = getFixedExpenseMonthGroups([
    { id: "a", installment: "Fixo", dueDate: "2026-07-05", totalValue: 10.1 },
    { id: "b", type: "recurring", dueDate: "2026-07-20", totalValue: 20.2 },
    { id: "c", installment: "Fixo", dueDate: "2026-08-05", totalValue: 5 },
    { id: "normal", dueDate: "2026-08-10", totalValue: 999 },
  ]);

  assert.deepEqual(groups.map(({ monthKey, total, expenses }) => ({
    monthKey,
    total,
    ids: expenses.map((expense) => expense.id),
  })), [
    { monthKey: "2026-08", total: 5, ids: ["c"] },
    { monthKey: "2026-07", total: 30.3, ids: ["a", "b"] },
  ]);
  assert.equal(roundMoney(1.005), 1.01);
});

test("soma apenas as parcelas no resumo mensal", () => {
  assert.equal(sumInstallmentExpenses([
    installment({ current: 1, dueDate: "2026-01-10", totalValue: 10.1 }),
    installment({ current: 2, dueDate: "2026-02-10", totalValue: 20.2 }),
    { id: "normal", totalValue: 999 },
  ]), 30.3);
});
