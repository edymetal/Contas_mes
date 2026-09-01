import { PEOPLE } from "../config/people.js";

const LEGACY_REGISTRATION_TOLERANCE_MS = 5 * 60 * 1000;

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();

  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (Number.isFinite(Number(seconds))) {
    return Number(seconds) * 1000 + Math.floor(Number(nanoseconds) / 1_000_000);
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPaymentOrderMillis(payment) {
  return (
    timestampToMillis(payment?.createdAt) ||
    timestampToMillis(payment?.createdAtClient) ||
    timestampToMillis(payment?.paidAt)
  );
}

export function getSettlementPairKey(payment) {
  return [payment?.fromId || "", payment?.toId || ""].sort().join("<->");
}

export function getSettlementAccountingMonth(payment) {
  return payment?.monthKey || String(payment?.paidAt || "").slice(0, 7);
}

export function hasLaterSettlementPayment(payment, payments = []) {
  const referencePair = getSettlementPairKey(payment);
  const referenceTime = getPaymentOrderMillis(payment);
  const referenceId = String(payment?.id || "");

  return payments.some((candidate) => {
    if (!candidate || candidate.id === payment?.id || candidate.kind !== "payment") return false;
    if ((candidate.monthKey || "") !== (payment?.monthKey || "")) return false;
    if (getSettlementPairKey(candidate) !== referencePair) return false;

    const candidateTime = getPaymentOrderMillis(candidate);
    if (candidateTime !== referenceTime) return candidateTime > referenceTime;
    return String(candidate.id || "") > referenceId;
  });
}

export function collectPendingSettlementShares(expenses = [], row = {}) {
  const affectedShares = [];

  expenses.forEach((expense) => {
    const directShare = expense?.shares?.[row.fromId];
    if (expense?.payerId === row.toId && directShare?.status === "pending") {
      affectedShares.push({
        expenseId: expense.id,
        personId: row.fromId,
        direction: "direct",
        previousStatus: directShare.status,
        previousPayment: directShare.payment ?? null,
      });
    }

    const reverseShare = expense?.shares?.[row.toId];
    if (expense?.payerId === row.fromId && reverseShare?.status === "pending") {
      affectedShares.push({
        expenseId: expense.id,
        personId: row.toId,
        direction: "reverse",
        previousStatus: reverseShare.status,
        previousPayment: reverseShare.payment ?? null,
      });
    }
  });

  return affectedShares;
}

export function getSelectableSettlementDebts(expenses = [], row = {}) {
  const pendingDebts = expenses
    .flatMap((expense) => {
      const share = expense?.shares?.[row.fromId];
      const originalAmount = roundMoney(share?.amount);
      if (
        expense?.payerId !== row.toId ||
        share?.status !== "pending" ||
        originalAmount <= 0
      ) {
        return [];
      }

      return [{
        expenseId: expense.id,
        personId: row.fromId,
        direction: "direct",
        previousStatus: share.status,
        previousPayment: share.payment ?? null,
        title: expense.title || "Dívida sem descrição",
        category: expense.category || "",
        dueDate: expense.dueDate || "",
        originalAmount,
      }];
    })
    .sort((first, second) => (
      (first.dueDate || "9999-12-31").localeCompare(second.dueDate || "9999-12-31") ||
      first.title.localeCompare(second.title, "pt-BR") ||
      String(first.expenseId).localeCompare(String(second.expenseId))
    ));

  const pendingTotal = roundMoney(
    pendingDebts.reduce((total, debt) => total + debt.originalAmount, 0),
  );
  let reductionToApply = roundMoney(
    Math.max(pendingTotal - Math.max(Number(row.amount || 0), 0), 0),
  );

  return pendingDebts.flatMap((debt) => {
    const reduction = Math.min(debt.originalAmount, reductionToApply);
    const amount = roundMoney(debt.originalAmount - reduction);
    reductionToApply = roundMoney(reductionToApply - reduction);

    return amount > 0 ? [{ ...debt, amount }] : [];
  });
}

function isLegacyShareMatch(expense, personId, payment, direction) {
  const share = expense?.shares?.[personId];
  const sharePayment = share?.payment;
  if (share?.status !== "settled" || !sharePayment) return false;
  if (sharePayment.settlementId && sharePayment.settlementId !== payment.id) return false;
  if (payment.paidAt && sharePayment.paidAt !== payment.paidAt) return false;
  if (payment.createdBy && sharePayment.registeredBy && sharePayment.registeredBy !== payment.createdBy) return false;

  if (direction === "direct" && payment.type && sharePayment.type !== payment.type) return false;
  if (direction === "reverse" && !/^compensa[cç][aã]o$/i.test(String(sharePayment.type || ""))) return false;
  return true;
}

export function resolveLegacyAffectedShares(expenses = [], payment = {}) {
  const candidates = [];

  expenses.forEach((expense) => {
    if (
      expense?.payerId === payment.toId &&
      isLegacyShareMatch(expense, payment.fromId, payment, "direct")
    ) {
      candidates.push({
        expenseId: expense.id,
        personId: payment.fromId,
        direction: "direct",
        previousStatus: "pending",
        previousPayment: null,
        registeredAt: expense.shares[payment.fromId].payment.registeredAt || "",
      });
    }

    if (
      expense?.payerId === payment.fromId &&
      isLegacyShareMatch(expense, payment.toId, payment, "reverse")
    ) {
      candidates.push({
        expenseId: expense.id,
        personId: payment.toId,
        direction: "reverse",
        previousStatus: "pending",
        previousPayment: null,
        registeredAt: expense.shares[payment.toId].payment.registeredAt || "",
      });
    }
  });

  if (!candidates.length) return { affectedShares: [], ambiguous: false };

  const groups = new Map();
  candidates.forEach((candidate) => {
    const key = candidate.registeredAt || "unknown";
    const group = groups.get(key) || [];
    group.push(candidate);
    groups.set(key, group);
  });

  if (groups.size === 1) {
    return {
      affectedShares: candidates.map(({ registeredAt, ...candidate }) => candidate),
      ambiguous: false,
    };
  }

  const settlementTime = timestampToMillis(payment.createdAt);
  if (!settlementTime) return { affectedShares: [], ambiguous: true };

  const rankedGroups = Array.from(groups.entries())
    .map(([registeredAt, entries]) => ({
      entries,
      distance: Math.abs(timestampToMillis(registeredAt) - settlementTime),
    }))
    .filter((group) => Number.isFinite(group.distance))
    .sort((first, second) => first.distance - second.distance);

  if (
    !rankedGroups.length ||
    rankedGroups[0].distance > LEGACY_REGISTRATION_TOLERANCE_MS ||
    (rankedGroups[1] && rankedGroups[1].distance === rankedGroups[0].distance)
  ) {
    return { affectedShares: [], ambiguous: true };
  }

  return {
    affectedShares: rankedGroups[0].entries.map(({ registeredAt, ...candidate }) => candidate),
    ambiguous: false,
  };
}

function calculateSettlementPairs(expenses = [], settlementPayments = []) {
  const balances = new Map();
  const paidBalances = new Map();

  expenses.forEach((expense) => {
    Object.entries(expense.shares || {}).forEach(([personId, share]) => {
      if (personId === expense.payerId || !["pending", "settled"].includes(share.status)) return;
      const key = `${personId}->${expense.payerId}`;
      balances.set(key, (balances.get(key) || 0) + Number(share.amount || 0));
    });
  });

  settlementPayments.forEach((payment) => {
    const key = `${payment.fromId}->${payment.toId}`;
    paidBalances.set(key, roundMoney((paidBalances.get(key) || 0) + Number(payment.amount || 0)));
  });

  const pairs = [];
  for (let index = 0; index < PEOPLE.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < PEOPLE.length; nextIndex += 1) {
      const first = PEOPLE[index].id;
      const second = PEOPLE[nextIndex].id;
      const firstOwesSecond = roundMoney(balances.get(`${first}->${second}`) || 0);
      const secondOwesFirst = roundMoney(balances.get(`${second}->${first}`) || 0);
      const firstPaidSecond = roundMoney(paidBalances.get(`${first}->${second}`) || 0);
      const secondPaidFirst = roundMoney(paidBalances.get(`${second}->${first}`) || 0);
      if (firstOwesSecond <= 0 && secondOwesFirst <= 0) continue;

      const firstPaidAmount = roundMoney(Math.min(firstPaidSecond, firstOwesSecond));
      const secondPaidAmount = roundMoney(Math.min(secondPaidFirst, secondOwesFirst));
      const firstAfterPayment = roundMoney(Math.max(firstOwesSecond - firstPaidAmount, 0));
      const secondAfterPayment = roundMoney(Math.max(secondOwesFirst - secondPaidAmount, 0));
      const crossPaidAmount = roundMoney(Math.min(firstAfterPayment, secondAfterPayment));

      pairs.push({
        first: {
          fromId: first,
          toId: second,
          originalAmount: firstOwesSecond,
          paidAmount: firstPaidAmount,
          crossPaidAmount,
          amount: roundMoney(Math.max(firstAfterPayment - crossPaidAmount, 0)),
        },
        second: {
          fromId: second,
          toId: first,
          originalAmount: secondOwesFirst,
          paidAmount: secondPaidAmount,
          crossPaidAmount,
          amount: roundMoney(Math.max(secondAfterPayment - crossPaidAmount, 0)),
        },
      });
    }
  }

  return pairs;
}

export function calculateSettlementRows(expenses, settlementPayments = []) {
  return calculateSettlementPairs(expenses, settlementPayments)
    .flatMap(({ first, second }) => [first, second])
    .filter((row) => row.amount > 0);
}

export function calculateSettlementSummaries(expenses, settlementPayments = []) {
  return calculateSettlementPairs(expenses, settlementPayments).map(({ first, second }) => {
    if (first.amount > 0) return first;
    if (second.amount > 0) return second;

    const originalNet = roundMoney(first.originalAmount - second.originalAmount);
    if (originalNet > 0) return first;
    if (originalNet < 0) return second;

    const paidNet = roundMoney(first.paidAmount - second.paidAmount);
    if (paidNet > 0) return first;
    if (paidNet < 0) return second;

    return first.originalAmount > 0 ? first : second;
  });
}

export function calculatePersonSettlementSummary(
  expenses = [],
  settlementPayments = [],
  personId,
) {
  const directPaidBalances = new Map();

  expenses.forEach((expense) => {
    const share = expense?.shares?.[personId];
    if (
      !share ||
      expense?.payerId === personId ||
      share.status !== "paid"
    ) {
      return;
    }

    const key = `${personId}->${expense.payerId}`;
    directPaidBalances.set(
      key,
      roundMoney((directPaidBalances.get(key) || 0) + Number(share.amount || 0)),
    );
  });

  const pairs = calculateSettlementPairs(expenses, settlementPayments);
  const totalsByPayer = PEOPLE
    .filter((person) => person.id !== personId)
    .map((person) => {
      const pair = pairs.find(({ first, second }) => (
        first.fromId === personId && first.toId === person.id
      ) || (
        second.fromId === personId && second.toId === person.id
      ));
      const direction = pair
        ? pair.first.fromId === personId
          ? pair.first
          : pair.second
        : null;
      const reverseDirection = pair
        ? pair.first.fromId === personId
          ? pair.second
          : pair.first
        : null;
      const directPaidAmount = roundMoney(
        directPaidBalances.get(`${personId}->${person.id}`) || 0,
      );

      return {
        person,
        originalAmount: roundMoney(directPaidAmount + Number(direction?.originalAmount || 0)),
        paidAmount: roundMoney(directPaidAmount + Number(direction?.paidAmount || 0)),
        abatedAmount: roundMoney(direction?.crossPaidAmount || 0),
        amount: roundMoney(direction?.amount || 0),
        receivableAmount: roundMoney(reverseDirection?.amount || 0),
      };
    });

  const totals = totalsByPayer.reduce(
    (acc, row) => ({
      originalAmount: roundMoney(acc.originalAmount + row.originalAmount),
      paidAmount: roundMoney(acc.paidAmount + row.paidAmount),
      abatedAmount: roundMoney(acc.abatedAmount + row.abatedAmount),
      amount: roundMoney(acc.amount + row.amount),
      receivableAmount: roundMoney(acc.receivableAmount + row.receivableAmount),
    }),
    {
      originalAmount: 0,
      paidAmount: 0,
      abatedAmount: 0,
      amount: 0,
      receivableAmount: 0,
    },
  );

  return { totalsByPayer, totals };
}
