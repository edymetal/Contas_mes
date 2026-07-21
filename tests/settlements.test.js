import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSettlementRows,
  collectPendingSettlementShares,
  getSettlementAccountingMonth,
  hasLaterSettlementPayment,
  resolveLegacyAffectedShares,
} from "../src/domain/settlements.js";

function expense({ id, payerId, shares }) {
  return { id, payerId, shares };
}

test("mantém o mês contábil mesmo quando a data do pagamento está em outro mês", () => {
  assert.equal(
    getSettlementAccountingMonth({ monthKey: "2026-07", paidAt: "2026-08-02" }),
    "2026-07",
  );
  assert.equal(getSettlementAccountingMonth({ paidAt: "2026-08-02" }), "2026-08");
});

test("calcula o saldo líquido entre duas pessoas e desconta pagamentos parciais", () => {
  const expenses = [
    expense({
      id: "expense-a",
      payerId: "edney",
      shares: {
        edney: { amount: 50, status: "self" },
        sonia: { amount: 50, status: "pending" },
      },
    }),
    expense({
      id: "expense-b",
      payerId: "sonia",
      shares: {
        edney: { amount: 20, status: "pending" },
        sonia: { amount: 20, status: "self" },
      },
    }),
  ];
  const payments = [{ fromId: "sonia", toId: "edney", amount: 10 }];

  assert.deepEqual(calculateSettlementRows(expenses, payments), [
    {
      fromId: "sonia",
      toId: "edney",
      originalAmount: 50,
      paidAmount: 10,
      crossPaidAmount: 20,
      amount: 20,
    },
  ]);
});

test("seleciona somente os rateios pendentes envolvidos na quitação", () => {
  const expenses = [
    expense({
      id: "direct",
      payerId: "edney",
      shares: { sonia: { amount: 40, status: "pending", payment: null } },
    }),
    expense({
      id: "reverse",
      payerId: "sonia",
      shares: { edney: { amount: 10, status: "pending", payment: null } },
    }),
    expense({
      id: "already-paid",
      payerId: "edney",
      shares: { sonia: { amount: 5, status: "paid", payment: { type: "PIX" } } },
    }),
  ];

  assert.deepEqual(collectPendingSettlementShares(expenses, { fromId: "sonia", toId: "edney" }), [
    {
      expenseId: "direct",
      personId: "sonia",
      direction: "direct",
      previousStatus: "pending",
      previousPayment: null,
    },
    {
      expenseId: "reverse",
      personId: "edney",
      direction: "reverse",
      previousStatus: "pending",
      previousPayment: null,
    },
  ]);
});

test("identifica pagamento posterior do mesmo par e mês, mesmo no sentido inverso", () => {
  const payment = {
    id: "a",
    kind: "payment",
    monthKey: "2026-07",
    fromId: "sonia",
    toId: "edney",
    createdAtClient: "2026-07-10T10:00:00.000Z",
  };
  const later = {
    id: "b",
    kind: "payment",
    monthKey: "2026-07",
    fromId: "edney",
    toId: "sonia",
    createdAtClient: "2026-07-11T10:00:00.000Z",
  };

  assert.equal(hasLaterSettlementPayment(payment, [payment, later]), true);
  assert.equal(hasLaterSettlementPayment(later, [payment, later]), false);
});

test("ignora pagamentos posteriores de outro mês ou de outro par", () => {
  const payment = {
    id: "a",
    kind: "payment",
    monthKey: "2026-07",
    fromId: "sonia",
    toId: "edney",
    createdAtClient: "2026-07-10T10:00:00.000Z",
  };
  const unrelated = [
    { ...payment, id: "b", monthKey: "2026-08", createdAtClient: "2026-08-10T10:00:00.000Z" },
    { ...payment, id: "c", fromId: "rodney", createdAtClient: "2026-07-12T10:00:00.000Z" },
  ];

  assert.equal(hasLaterSettlementPayment(payment, unrelated), false);
});

test("resolve rateios legados pela data e metadados do pagamento", () => {
  const payment = {
    id: "legacy",
    monthKey: "2026-07",
    fromId: "sonia",
    toId: "edney",
    paidAt: "2026-07-15",
    type: "PIX",
    createdBy: "edney",
    createdAt: { seconds: Date.parse("2026-07-15T10:00:01.000Z") / 1000, nanoseconds: 0 },
  };
  const registeredAt = "2026-07-15T10:00:00.000Z";
  const expenses = [
    expense({
      id: "direct",
      payerId: "edney",
      shares: {
        sonia: {
          amount: 40,
          status: "settled",
          payment: { paidAt: payment.paidAt, type: "PIX", registeredBy: "edney", registeredAt },
        },
      },
    }),
    expense({
      id: "reverse",
      payerId: "sonia",
      shares: {
        edney: {
          amount: 10,
          status: "settled",
          payment: { paidAt: payment.paidAt, type: "Compensação", registeredBy: "edney", registeredAt },
        },
      },
    }),
  ];

  assert.deepEqual(resolveLegacyAffectedShares(expenses, payment), {
    affectedShares: [
      {
        expenseId: "direct",
        personId: "sonia",
        direction: "direct",
        previousStatus: "pending",
        previousPayment: null,
      },
      {
        expenseId: "reverse",
        personId: "edney",
        direction: "reverse",
        previousStatus: "pending",
        previousPayment: null,
      },
    ],
    ambiguous: false,
  });
});

test("bloqueia resolução legada quando há grupos indistinguíveis", () => {
  const payment = {
    id: "legacy",
    fromId: "sonia",
    toId: "edney",
    paidAt: "2026-07-15",
    type: "PIX",
  };
  const expenses = ["10:00:00", "11:00:00"].map((time, index) => expense({
    id: `expense-${index}`,
    payerId: "edney",
    shares: {
      sonia: {
        status: "settled",
        payment: {
          paidAt: payment.paidAt,
          type: "PIX",
          registeredAt: `2026-07-15T${time}.000Z`,
        },
      },
    },
  }));

  assert.deepEqual(resolveLegacyAffectedShares(expenses, payment), {
    affectedShares: [],
    ambiguous: true,
  });
});

test("não associa ao legado um rateio vinculado a outro settlement", () => {
  const payment = {
    id: "legacy",
    fromId: "sonia",
    toId: "edney",
    paidAt: "2026-07-15",
    type: "PIX",
  };
  const expenses = [expense({
    id: "expense",
    payerId: "edney",
    shares: {
      sonia: {
        status: "settled",
        payment: {
          settlementId: "another-settlement",
          paidAt: payment.paidAt,
          type: "PIX",
        },
      },
    },
  })];

  assert.deepEqual(resolveLegacyAffectedShares(expenses, payment), {
    affectedShares: [],
    ambiguous: false,
  });
});
