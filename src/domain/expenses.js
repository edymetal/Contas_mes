export function addMonths(dateStr, months) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  const yearOut = date.getUTCFullYear();
  const monthOut = date.getUTCMonth();
  const maxDays = new Date(Date.UTC(yearOut, monthOut + 1, 0)).getUTCDate();
  const dayOut = Math.min(day, maxDays);
  const paddedMonth = String(monthOut + 1).padStart(2, "0");
  const paddedDay = String(dayOut).padStart(2, "0");
  return `${yearOut}-${paddedMonth}-${paddedDay}`;
}

export function shiftMonth(monthStr, delta) {
  if (!monthStr) return "";
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const yearOut = date.getUTCFullYear();
  const monthOut = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yearOut}-${monthOut}`;
}

export function getMonthDistance(fromMonth, toMonth) {
  if (!fromMonth || !toMonth) return 0;
  const [fromYear, fromMonthNumber] = fromMonth.split("-").map(Number);
  const [toYear, toMonthNumber] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export const SPLIT_MODES = Object.freeze({
  EQUAL: "equal",
  PERCENTAGE: "percentage",
  FIXED: "fixed",
});

function normalizeParticipantIds(participants) {
  return [...new Set((participants || []).filter(Boolean))];
}

function parseSplitNumber(value) {
  if (typeof value === "string") {
    return Number(value.replace(",", "."));
  }
  return Number(value);
}

export function normalizeSplitMode(mode) {
  return Object.values(SPLIT_MODES).includes(mode) ? mode : SPLIT_MODES.EQUAL;
}

function allocateCents(totalCents, participantIds, weights) {
  const weightTotal = participantIds.reduce(
    (total, personId) => total + Math.max(0, Number(weights[personId] || 0)),
    0,
  );
  if (!weightTotal) {
    return Object.fromEntries(participantIds.map((personId) => [personId, 0]));
  }

  const allocations = {};
  const fractions = [];
  let allocatedCents = 0;

  participantIds.forEach((personId, index) => {
    const exactCents = totalCents * Math.max(0, Number(weights[personId] || 0)) / weightTotal;
    const cents = Math.floor(exactCents);
    allocations[personId] = cents;
    allocatedCents += cents;
    fractions.push({ personId, fraction: exactCents - cents, index });
  });

  fractions
    .sort((first, second) => second.fraction - first.fraction || first.index - second.index)
    .slice(0, Math.max(0, totalCents - allocatedCents))
    .forEach(({ personId }) => {
      allocations[personId] += 1;
    });

  return Object.fromEntries(
    participantIds.map((personId) => [personId, allocations[personId] / 100]),
  );
}

export function calculateSplitAmounts(
  totalValue,
  participants,
  splitMode = SPLIT_MODES.EQUAL,
  splitValues = {},
) {
  const participantIds = normalizeParticipantIds(participants);
  const mode = normalizeSplitMode(splitMode);
  const total = roundMoney(parseSplitNumber(totalValue));
  const emptyAmounts = Object.fromEntries(participantIds.map((personId) => [personId, 0]));

  if (!Number.isFinite(total) || total <= 0) {
    return {
      mode,
      amounts: emptyAmounts,
      inputTotal: 0,
      allocatedTotal: 0,
      difference: Number.isFinite(total) ? total : 0,
      isValid: false,
      error: "Informe um valor válido para calcular o rateio.",
    };
  }

  if (!participantIds.length) {
    return {
      mode,
      amounts: {},
      inputTotal: 0,
      allocatedTotal: 0,
      difference: total,
      isValid: false,
      error: "Selecione pelo menos uma pessoa no rateio.",
    };
  }

  const totalCents = Math.round(total * 100);

  if (mode === SPLIT_MODES.EQUAL) {
    const weights = Object.fromEntries(participantIds.map((personId) => [personId, 1]));
    const amounts = allocateCents(totalCents, participantIds, weights);
    return {
      mode,
      amounts,
      inputTotal: participantIds.length,
      allocatedTotal: total,
      difference: 0,
      isValid: true,
      error: "",
    };
  }

  const parsedValues = {};
  const invalidPerson = participantIds.find((personId) => {
    const value = parseSplitNumber(splitValues?.[personId] ?? "");
    parsedValues[personId] = value;
    return !Number.isFinite(value) || value < 0;
  });

  if (invalidPerson) {
    return {
      mode,
      amounts: emptyAmounts,
      inputTotal: 0,
      allocatedTotal: 0,
      difference: total,
      isValid: false,
      error: "Preencha o rateio apenas com valores válidos e não negativos.",
    };
  }

  if (mode === SPLIT_MODES.PERCENTAGE) {
    const percentageTotal = roundMoney(
      participantIds.reduce((sum, personId) => sum + parsedValues[personId], 0),
    );
    const isValid = Math.abs(percentageTotal - 100) < 0.01;
    const amounts = isValid
      ? allocateCents(totalCents, participantIds, parsedValues)
      : Object.fromEntries(
          participantIds.map((personId) => [
            personId,
            roundMoney(total * parsedValues[personId] / 100),
          ]),
        );
    const allocatedTotal = roundMoney(
      Object.values(amounts).reduce((sum, amount) => sum + amount, 0),
    );

    return {
      mode,
      amounts,
      inputTotal: percentageTotal,
      allocatedTotal,
      difference: roundMoney(total - allocatedTotal),
      isValid,
      error: isValid ? "" : `A soma dos percentuais deve ser 100% (atual: ${percentageTotal}%).`,
    };
  }

  const amounts = Object.fromEntries(
    participantIds.map((personId) => [personId, roundMoney(parsedValues[personId])]),
  );
  const allocatedTotal = roundMoney(
    Object.values(amounts).reduce((sum, amount) => sum + amount, 0),
  );
  const difference = roundMoney(total - allocatedTotal);
  const isValid = Math.abs(difference) < 0.01;

  return {
    mode,
    amounts,
    inputTotal: allocatedTotal,
    allocatedTotal,
    difference,
    isValid,
    error: isValid
      ? ""
      : `A soma dos valores deve ser igual ao total da conta (diferença: ${Math.abs(difference).toFixed(2)} €).`,
  };
}

export function createEqualSplitValues(
  totalValue,
  participants,
  splitMode = SPLIT_MODES.PERCENTAGE,
) {
  const participantIds = normalizeParticipantIds(participants);
  const mode = normalizeSplitMode(splitMode);
  if (!participantIds.length || mode === SPLIT_MODES.EQUAL) return {};

  if (mode === SPLIT_MODES.FIXED) {
    return calculateSplitAmounts(totalValue, participantIds, SPLIT_MODES.EQUAL).amounts;
  }

  const percentageCents = allocateCents(
    10_000,
    participantIds,
    Object.fromEntries(participantIds.map((personId) => [personId, 1])),
  );
  return percentageCents;
}

export function serializeSplitValues(participants, splitMode, splitValues = {}) {
  const mode = normalizeSplitMode(splitMode);
  if (mode === SPLIT_MODES.EQUAL) return {};

  return Object.fromEntries(
    normalizeParticipantIds(participants).map((personId) => [
      personId,
      roundMoney(parseSplitNumber(splitValues?.[personId] ?? 0)),
    ]),
  );
}

export function getExpenseSplitConfiguration(expense) {
  const participants = normalizeParticipantIds(expense?.participants);
  const mode = normalizeSplitMode(expense?.splitMode);
  if (mode === SPLIT_MODES.EQUAL) {
    return { mode, values: {} };
  }

  if (expense?.splitValues && typeof expense.splitValues === "object") {
    return {
      mode,
      values: serializeSplitValues(participants, mode, expense.splitValues),
    };
  }

  if (mode === SPLIT_MODES.FIXED) {
    return {
      mode,
      values: Object.fromEntries(
        participants.map((personId) => [
          personId,
          roundMoney(Number(expense?.shares?.[personId]?.amount || 0)),
        ]),
      ),
    };
  }

  const total = Number(expense?.totalValue || 0);
  if (!total) return { mode: SPLIT_MODES.EQUAL, values: {} };
  const values = Object.fromEntries(
    participants.map((personId) => [
      personId,
      roundMoney(Number(expense?.shares?.[personId]?.amount || 0) / total * 100),
    ]),
  );
  const percentageTotal = roundMoney(Object.values(values).reduce((sum, value) => sum + value, 0));
  const lastParticipant = participants.at(-1);
  if (lastParticipant && percentageTotal !== 100) {
    values[lastParticipant] = roundMoney(values[lastParticipant] + 100 - percentageTotal);
  }

  return { mode, values };
}

export function monthFromDate(date) {
  return date ? date.slice(0, 7) : "";
}

export function getExpenseMonthKey({ dueDate, expenseDate, type }) {
  if ((type || "normal") === "normal") {
    return monthFromDate(expenseDate || dueDate);
  }

  return monthFromDate(dueDate);
}

export function isFixedExpense(expense) {
  const installment = String(expense?.installment || "").trim().toLowerCase();
  const type = String(expense?.type || "").trim().toLowerCase();

  return (
    installment.startsWith("fixo") ||
    installment.startsWith("fixa") ||
    type === "recurring" ||
    type === "fixed" ||
    expense?.recurring === true ||
    expense?.isFixed === true
  );
}

export function formatInstallmentLabel(label) {
  if (!label) return "";
  if (isFixedExpense({ installment: label })) return "Fixo";
  return label;
}

export function getInstallmentInfo(expense) {
  const meta = expense?.installmentMeta;
  if (meta) {
    const current = Number(meta.current);
    const total = Number(meta.total);
    if (Number.isInteger(current) && Number.isInteger(total) && current >= 1 && total >= 1) {
      return {
        current,
        total,
        finalDueDate: meta.finalDueDate || "",
      };
    }
  }

  const match = expense?.installment?.match(/^Parcela\s+(\d+)\s+de\s+(\d+)$/i);
  if (!match) return null;

  return {
    current: Number(match[1]),
    total: Number(match[2]),
    finalDueDate: "",
  };
}

export function getExpenseKind(expense) {
  if (isFixedExpense(expense)) return "fixed";
  if (getInstallmentInfo(expense)) return "installment";
  return "normal";
}

export function isValidInstallmentExpense(expense) {
  const installmentInfo = getInstallmentInfo(expense);
  if (!installmentInfo) return true;
  return installmentInfo.current <= installmentInfo.total;
}

export function isSettledStatus(status) {
  return status === "paid" || status === "settled" || status === "self";
}

export function isExpenseFullySettled(expense) {
  const shares = Object.values(expense.shares || {});
  return shares.length > 0 && shares.every((share) => isSettledStatus(share.status));
}

export function getExpenseSettledValue(expense) {
  return roundMoney(
    Object.values(expense.shares || {}).reduce((total, share) => (
      isSettledStatus(share.status)
        ? total + Number(share.amount || 0)
        : total
    ), 0),
  );
}

function getLegacyInstallmentSeriesKey(expense, installmentInfo) {
  return [
    (expense.title || "").trim().toLowerCase(),
    expense.payerId || "",
    String(installmentInfo.total),
    String(expense.totalValue || ""),
    (expense.participants || []).slice().sort().join(","),
  ].join("|");
}

export function getInstallmentSeriesKey(expense, installmentInfo) {
  if (expense?.installmentSeriesId) return `series:${expense.installmentSeriesId}`;
  return `legacy:${getLegacyInstallmentSeriesKey(expense, installmentInfo)}`;
}

export function isSameInstallmentSeries(referenceExpense, candidateExpense) {
  const referenceInfo = getInstallmentInfo(referenceExpense);
  const candidateInfo = getInstallmentInfo(candidateExpense);
  if (!referenceInfo || !candidateInfo) return false;

  if (referenceExpense.installmentSeriesId && candidateExpense.installmentSeriesId) {
    return referenceExpense.installmentSeriesId === candidateExpense.installmentSeriesId;
  }

  return (
    getLegacyInstallmentSeriesKey(referenceExpense, referenceInfo) ===
    getLegacyInstallmentSeriesKey(candidateExpense, candidateInfo)
  );
}

export function getInstallmentSeriesExpenses(expenses, referenceExpense) {
  if (!getInstallmentInfo(referenceExpense)) return [];
  return expenses.filter((expense) => isSameInstallmentSeries(referenceExpense, expense));
}

function getFirestoreTimestampKey(value) {
  if (!value) return "";
  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (Number.isFinite(Number(seconds))) return `${seconds}:${nanoseconds}`;
  return "";
}

function getLegacyFixedSeriesKey(expense) {
  const createdAtKey = getFirestoreTimestampKey(expense?.createdAt);
  if (createdAtKey) return `created:${expense.createdBy || ""}:${createdAtKey}`;

  return [
    (expense?.title || "").trim().toLowerCase(),
    expense?.payerId || "",
    String(expense?.totalValue || ""),
    (expense?.participants || []).slice().sort().join(","),
    expense?.category || "",
  ].join("|");
}

export function isSameFixedSeries(referenceExpense, candidateExpense) {
  if (!isFixedExpense(referenceExpense) || !isFixedExpense(candidateExpense)) return false;

  if (referenceExpense.fixedSeriesId && candidateExpense.fixedSeriesId) {
    return referenceExpense.fixedSeriesId === candidateExpense.fixedSeriesId;
  }

  return getLegacyFixedSeriesKey(referenceExpense) === getLegacyFixedSeriesKey(candidateExpense);
}

function normalizeExpenseTitle(title) {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isSameExpenseHistory(referenceExpense, candidateExpense) {
  const referenceKind = getExpenseKind(referenceExpense);
  if (referenceKind === "installment") {
    return isSameInstallmentSeries(referenceExpense, candidateExpense);
  }
  if (referenceKind === "fixed") {
    return isSameFixedSeries(referenceExpense, candidateExpense);
  }

  return (
    getExpenseKind(candidateExpense) === "normal"
    && normalizeExpenseTitle(referenceExpense.title) === normalizeExpenseTitle(candidateExpense.title)
  );
}

export function getExpenseHistorySummary(expenses, referenceExpense, cutoffMonth) {
  const historyExpenses = getNormalizedExpenses(expenses)
    .filter((expense) => isSameExpenseHistory(referenceExpense, expense))
    .filter((expense) => {
      const monthKey = getExpenseDisplayMonthKey(expense);
      return monthKey && (!cutoffMonth || monthKey <= cutoffMonth);
    })
    .map((expense) => {
      const totalValue = Number(expense.totalValue || 0);
      const settledValue = Math.min(getExpenseSettledValue(expense), totalValue);
      const isPaid = isExpenseFullySettled(expense);

      return {
        ...expense,
        historyMonthKey: getExpenseDisplayMonthKey(expense),
        historyPaidValue: settledValue,
        historyStatus: isPaid ? "paid" : settledValue > 0 ? "partial" : "pending",
      };
    })
    .sort((first, second) => (
      (second.historyMonthKey || second.dueDate || "")
        .localeCompare(first.historyMonthKey || first.dueDate || "")
      || (second.dueDate || "").localeCompare(first.dueDate || "")
    ));
  const totalValue = historyExpenses.reduce(
    (total, expense) => roundMoney(total + Number(expense.totalValue || 0)),
    0,
  );
  const paidValue = historyExpenses.reduce(
    (total, expense) => roundMoney(total + Number(expense.historyPaidValue || 0)),
    0,
  );

  return {
    expenses: historyExpenses,
    totalCount: historyExpenses.length,
    paidCount: historyExpenses.filter((expense) => expense.historyStatus === "paid").length,
    totalValue,
    paidValue,
    pendingValue: roundMoney(Math.max(totalValue - paidValue, 0)),
  };
}

function getExpenseSettlementDate(expense) {
  return Object.values(expense.shares || {})
    .map((share) => share?.payment?.paidAt)
    .filter(Boolean)
    .sort()
    .at(-1) || expense.dueDate || "";
}

export function getInstallmentSeriesSummaries(expenses) {
  const groups = new Map();

  expenses.filter(isValidInstallmentExpense).forEach((expense) => {
    const installmentInfo = getInstallmentInfo(expense);
    if (!installmentInfo) return;

    const key = getInstallmentSeriesKey(expense, installmentInfo);
    const group = groups.get(key) || {
      key,
      title: expense.title || "Conta parcelada",
      category: expense.category || "",
      payerId: expense.payerId || "",
      participants: expense.participants || [],
      first: installmentInfo.current,
      total: installmentInfo.total,
      installmentValue: Number(expense.totalValue || 0),
      finalDueDate: installmentInfo.finalDueDate || "",
      installments: new Map(),
    };

    const currentExpense = group.installments.get(installmentInfo.current);
    group.first = Math.min(group.first, installmentInfo.current);
    group.total = Math.max(group.total, installmentInfo.total);
    group.finalDueDate = group.finalDueDate || installmentInfo.finalDueDate || "";
    if (!currentExpense || (expense.dueDate || "") < (currentExpense.dueDate || "")) {
      group.installments.set(installmentInfo.current, expense);
    }
    groups.set(key, group);
  });

  return Array.from(groups.values())
    .map((group) => {
      const installments = Array.from(group.installments.entries())
        .sort(([first], [second]) => first - second)
        .map(([, expense]) => expense);
      const firstExpense = installments[0];
      const lastExpense = installments.at(-1);
      const firstDueDate = firstExpense?.dueDate || (firstExpense?.monthKey ? `${firstExpense.monthKey}-01` : "");
      const finalDueDate =
        group.finalDueDate ||
        group.installments.get(group.total)?.dueDate ||
        (firstDueDate ? addMonths(firstDueDate, group.total - group.first) : lastExpense?.dueDate || "");
      const paidTrackedCount = installments.filter(isExpenseFullySettled).length;
      const paidInstallments = Math.min(group.total, Math.max(0, group.first - 1) + paidTrackedCount);
      const totalValue = roundMoney(group.installmentValue * group.total);
      const paidValue = roundMoney(group.installmentValue * paidInstallments);
      const remainingValue = roundMoney(Math.max(totalValue - paidValue, 0));
      const completed = remainingValue <= 0 && paidInstallments >= group.total;
      const finalizedDate = completed
        ? installments.map(getExpenseSettlementDate).filter(Boolean).sort().at(-1) || finalDueDate
        : "";

      return {
        ...group,
        firstDueDate,
        finalDueDate,
        finalizedDate,
        paidInstallments,
        remainingInstallments: Math.max(group.total - paidInstallments, 0),
        totalValue,
        paidValue,
        remainingValue,
        completed,
      };
    })
    .sort((first, second) => (first.finalDueDate || "").localeCompare(second.finalDueDate || ""));
}

export function getInstallmentSeriesMissingHistory(expenses) {
  const groups = new Map();

  expenses.filter(isValidInstallmentExpense).forEach((expense) => {
    const installmentInfo = getInstallmentInfo(expense);
    if (!installmentInfo) return;

    const key = getInstallmentSeriesKey(expense, installmentInfo);
    const group = groups.get(key) || {
      key,
      first: installmentInfo.current,
      total: installmentInfo.total,
      firstExpense: expense,
      expenses: [],
    };

    group.expenses.push(expense);
    group.total = Math.max(group.total, installmentInfo.total);
    if (
      installmentInfo.current < group.first ||
      (installmentInfo.current === group.first && (expense.dueDate || "") < (group.firstExpense?.dueDate || ""))
    ) {
      group.first = installmentInfo.current;
      group.firstExpense = expense;
    }
    groups.set(key, group);
  });

  return Array.from(groups.values()).filter((group) => group.first > 1 && group.firstExpense?.dueDate);
}

export function getExpenseDisplayMonthKey(expense) {
  if (expense.displayMonthKey) return expense.displayMonthKey;
  return monthFromDate(expense.dueDate || expense.monthKey || "");
}

export function getFixedExpenseMonthGroups(expenses) {
  const groups = new Map();

  expenses
    .filter(isFixedExpense)
    .sort((first, second) => (first.dueDate || "").localeCompare(second.dueDate || ""))
    .forEach((expense) => {
      const monthKey = getExpenseDisplayMonthKey(expense);
      if (!monthKey) return;

      const group = groups.get(monthKey) || {
        monthKey,
        total: 0,
        expenses: [],
      };

      group.total = roundMoney(group.total + Number(expense.totalValue || 0));
      group.expenses.push(expense);
      groups.set(monthKey, group);
    });

  return Array.from(groups.values()).sort((first, second) => (
    (second.monthKey || "").localeCompare(first.monthKey || "")
  ));
}

export function getNormalizedExpenses(expenses) {
  const installmentGroups = new Map();
  const regularExpenses = [];

  expenses.filter(isValidInstallmentExpense).forEach((expense) => {
    const installmentInfo = getInstallmentInfo(expense);
    if (!installmentInfo) {
      regularExpenses.push(expense);
      return;
    }

    const key = getInstallmentSeriesKey(expense, installmentInfo);
    const group = installmentGroups.get(key) || {
      first: installmentInfo.current,
      installments: new Map(),
    };
    const currentExpense = group.installments.get(installmentInfo.current);

    group.first = Math.min(group.first, installmentInfo.current);
    if (!currentExpense || (expense.dueDate || "") < (currentExpense.dueDate || "")) {
      group.installments.set(installmentInfo.current, expense);
    }
    installmentGroups.set(key, group);
  });

  const normalizedInstallments = Array.from(installmentGroups.values()).flatMap((group) => {
    const firstExpense = group.installments.get(group.first);
    const firstDueDate = firstExpense?.dueDate || (firstExpense?.monthKey ? `${firstExpense.monthKey}-01` : "");

    return Array.from(group.installments.entries()).map(([currentInstallment, expense]) => {
      const expectedDueDate = firstDueDate ? addMonths(firstDueDate, currentInstallment - group.first) : "";
      return {
        ...expense,
        displayMonthKey: expectedDueDate ? monthFromDate(expectedDueDate) : getExpenseDisplayMonthKey(expense),
      };
    });
  });

  return [...regularExpenses, ...normalizedInstallments];
}

export function filterExpensesForMonth(normalizedExpenses, monthKey) {
  return normalizedExpenses
    .filter((expense) => getExpenseDisplayMonthKey(expense) === monthKey)
    .sort((first, second) => (first.dueDate || "").localeCompare(second.dueDate || ""));
}

export function getExpensesForMonth(expenses, monthKey) {
  return filterExpensesForMonth(getNormalizedExpenses(expenses), monthKey);
}

export function sumInstallmentExpenses(expenses) {
  return expenses
    .filter((expense) => getInstallmentInfo(expense))
    .reduce((sum, expense) => roundMoney(sum + Number(expense.totalValue || 0)), 0);
}
