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

export function calculateSettlementRows(expenses, settlementPayments = []) {
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

  const rows = [];
  for (let index = 0; index < PEOPLE.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < PEOPLE.length; nextIndex += 1) {
      const first = PEOPLE[index].id;
      const second = PEOPLE[nextIndex].id;
      const firstOwesSecond = roundMoney(balances.get(`${first}->${second}`) || 0);
      const secondOwesFirst = roundMoney(balances.get(`${second}->${first}`) || 0);
      const firstPaidSecond = roundMoney(paidBalances.get(`${first}->${second}`) || 0);
      const secondPaidFirst = roundMoney(paidBalances.get(`${second}->${first}`) || 0);
      const firstOpenDebt = roundMoney(Math.max(firstOwesSecond - firstPaidSecond, 0));
      const secondOpenDebt = roundMoney(Math.max(secondOwesFirst - secondPaidFirst, 0));
      const net = roundMoney(firstOpenDebt - secondOpenDebt);

      if (net > 0) {
        const paidAmount = Math.min(firstPaidSecond, firstOwesSecond);
        const crossPaidAmount = Math.min(secondOpenDebt, firstOwesSecond - paidAmount);
        const remainingAmount = roundMoney(firstOwesSecond - paidAmount - crossPaidAmount);
        if (remainingAmount > 0) {
          rows.push({
            fromId: first,
            toId: second,
            originalAmount: firstOwesSecond,
            paidAmount,
            crossPaidAmount,
            amount: remainingAmount,
          });
        }
      }

      if (net < 0) {
        const paidAmount = Math.min(secondPaidFirst, secondOwesFirst);
        const crossPaidAmount = Math.min(firstOpenDebt, secondOwesFirst - paidAmount);
        const remainingAmount = roundMoney(secondOwesFirst - paidAmount - crossPaidAmount);
        if (remainingAmount > 0) {
          rows.push({
            fromId: second,
            toId: first,
            originalAmount: secondOwesFirst,
            paidAmount,
            crossPaidAmount,
            amount: remainingAmount,
          });
        }
      }
    }
  }

  return rows;
}
