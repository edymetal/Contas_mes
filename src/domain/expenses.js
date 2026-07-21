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

function areExpenseSharesSettled(expense) {
  const shares = Object.values(expense.shares || {});
  return shares.length > 0 && shares.every((share) => isSettledStatus(share.status));
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
      const paidTrackedCount = installments.filter(areExpenseSharesSettled).length;
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
