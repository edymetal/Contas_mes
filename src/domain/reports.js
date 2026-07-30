import { CATEGORIES, PEOPLE, getPersonById } from "../config/people.js";
import {
  getExpenseDisplayMonthKey,
  monthFromDate,
  normalizeSplitMode,
  roundMoney,
} from "./expenses.js";
import { normalizeMarketName } from "./resources.js";

const MONTH_NUMBERS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

function sumValues(items) {
  return roundMoney(items.reduce((total, item) => total + Number(item.totalValue || 0), 0));
}

function addToMap(map, key, label, value) {
  const current = map.get(key) || { key, label, value: 0, count: 0 };
  current.value = roundMoney(current.value + Number(value || 0));
  current.count += 1;
  map.set(key, current);
}

function getResourceMonthKey(item, dateField) {
  return item.monthKey || monthFromDate(item[dateField]);
}

function sortReportRows(rows) {
  return [...rows].sort((first, second) => (
    second.value - first.value || first.label.localeCompare(second.label, "pt-BR")
  ));
}

export function createReportSnapshot(
  expenses,
  marketItems,
  otherPayments,
  monthKey,
) {
  const monthExpenses = (expenses || []).filter(
    (expense) => getExpenseDisplayMonthKey(expense) === monthKey,
  );
  const monthMarketItems = (marketItems || []).filter(
    (item) => getResourceMonthKey(item, "purchasedAt") === monthKey,
  );
  const monthOtherPayments = (otherPayments || []).filter(
    (item) => getResourceMonthKey(item, "paidAt") === monthKey,
  );

  const categoryMap = new Map(
    CATEGORIES.map((category) => [
      category.toLocaleLowerCase("pt-BR"),
      { key: category.toLocaleLowerCase("pt-BR"), label: category, value: 0, count: 0 },
    ]),
  );
  const peopleMap = new Map(
    PEOPLE.map((person) => [
      person.id,
      { key: person.id, label: person.name, value: 0, count: 0 },
    ]),
  );
  const establishmentMap = new Map();

  monthExpenses.forEach((expense) => {
    const category = String(expense.category || "Outros").trim() || "Outros";
    addToMap(categoryMap, category.toLocaleLowerCase("pt-BR"), category, expense.totalValue);

    (expense.participants || []).forEach((personId) => {
      const person = getPersonById(personId);
      const fallbackAmount = Number(expense.totalValue || 0) / Math.max(expense.participants?.length || 1, 1);
      const amount = Number(expense.shares?.[personId]?.amount ?? fallbackAmount);
      addToMap(peopleMap, personId, person?.name || personId, amount);
    });
  });

  monthMarketItems.forEach((item) => {
    const label = normalizeMarketName(item.market) || "Mercado não informado";
    addToMap(establishmentMap, `market:${label.toLocaleLowerCase("pt-BR")}`, label, item.totalValue);
  });
  monthOtherPayments.forEach((item) => {
    const label = String(item.place || "Local não informado").trim() || "Local não informado";
    addToMap(establishmentMap, `other:${label.toLocaleLowerCase("pt-BR")}`, label, item.totalValue);
  });

  const sharedTotal = sumValues(monthExpenses);
  const marketTotal = sumValues(monthMarketItems);
  const otherTotal = sumValues(monthOtherPayments);

  return {
    monthKey,
    totals: {
      shared: sharedTotal,
      market: marketTotal,
      other: otherTotal,
      consolidated: roundMoney(sharedTotal + marketTotal + otherTotal),
    },
    counts: {
      shared: monthExpenses.length,
      market: monthMarketItems.length,
      other: monthOtherPayments.length,
      consolidated: monthExpenses.length + monthMarketItems.length + monthOtherPayments.length,
    },
    categories: sortReportRows(categoryMap.values()),
    people: sortReportRows(peopleMap.values()),
    establishments: sortReportRows(establishmentMap.values()),
  };
}

export function calculateReportChange(currentValue, comparisonValue) {
  const current = Number(currentValue || 0);
  const comparison = Number(comparisonValue || 0);
  const difference = roundMoney(current - comparison);
  const percent = comparison
    ? difference / Math.abs(comparison) * 100
    : current
      ? null
      : 0;

  return { current, comparison, difference, percent };
}

export function createReportComparison(
  expenses,
  marketItems,
  otherPayments,
  currentMonth,
  comparisonMonth,
) {
  const current = createReportSnapshot(expenses, marketItems, otherPayments, currentMonth);
  const comparison = createReportSnapshot(expenses, marketItems, otherPayments, comparisonMonth);
  const changes = Object.fromEntries(
    Object.keys(current.totals).map((key) => [
      key,
      calculateReportChange(current.totals[key], comparison.totals[key]),
    ]),
  );

  return { current, comparison, changes };
}

function createDimensionRows(months, field) {
  const rows = new Map();

  months.forEach((month, monthIndex) => {
    month.snapshot[field].forEach((item) => {
      const current = rows.get(item.key) || {
        key: item.key,
        label: item.label,
        total: 0,
        months: months.map(({ monthKey }) => ({ monthKey, value: 0 })),
      };
      current.months[monthIndex].value = item.value;
      current.total = roundMoney(current.total + item.value);
      rows.set(item.key, current);
    });
  });

  return [...rows.values()]
    .filter((row) => row.total > 0)
    .sort((first, second) => second.total - first.total || first.label.localeCompare(second.label, "pt-BR"));
}

export function createAnnualReport(expenses, marketItems, otherPayments, year) {
  const months = MONTH_NUMBERS.map((month) => {
    const monthKey = `${year}-${month}`;
    const snapshot = createReportSnapshot(expenses, marketItems, otherPayments, monthKey);
    return {
      monthKey,
      total: snapshot.totals.consolidated,
      shared: snapshot.totals.shared,
      market: snapshot.totals.market,
      other: snapshot.totals.other,
      snapshot,
    };
  });

  return {
    year,
    total: roundMoney(months.reduce((sum, month) => sum + month.total, 0)),
    months,
    dimensions: {
      categories: createDimensionRows(months, "categories"),
      people: createDimensionRows(months, "people"),
      establishments: createDimensionRows(months, "establishments"),
    },
  };
}

function escapeCsv(value) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function formatCsvNumber(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function getSplitLabel(expense) {
  const labels = {
    equal: "Divisão igual",
    percentage: "Percentual",
    fixed: "Valor por pessoa",
  };
  return labels[normalizeSplitMode(expense.splitMode)] || labels.equal;
}

function getExpenseSplitDescription(expense) {
  return (expense.participants || [])
    .map((personId) => {
      const person = getPersonById(personId);
      const amount = expense.shares?.[personId]?.amount;
      return `${person?.name || personId}: ${formatCsvNumber(amount)}`;
    })
    .join(" | ");
}

export function createReportCsv(expenses, marketItems, otherPayments, monthKey) {
  const headers = [
    "Origem",
    "Data",
    "Descrição",
    "Detalhe",
    "Categoria ou pagamento",
    "Responsável ou local",
    "Tipo de rateio",
    "Rateio por pessoa",
    "Valor (€)",
  ];
  const rows = [];

  (expenses || [])
    .filter((expense) => getExpenseDisplayMonthKey(expense) === monthKey)
    .forEach((expense) => {
      rows.push([
        "Contas compartilhadas",
        expense.expenseDate || expense.dueDate || "",
        expense.title || "",
        expense.installment || "",
        expense.category || "",
        getPersonById(expense.payerId)?.name || expense.payerId || "",
        getSplitLabel(expense),
        getExpenseSplitDescription(expense),
        formatCsvNumber(expense.totalValue),
      ]);
    });

  (marketItems || [])
    .filter((item) => getResourceMonthKey(item, "purchasedAt") === monthKey)
    .forEach((item) => {
      rows.push([
        "Mercado",
        item.purchasedAt || "",
        item.product || "",
        item.description || "",
        "Mercado",
        normalizeMarketName(item.market) || "Mercado não informado",
        "",
        "",
        formatCsvNumber(item.totalValue),
      ]);
    });

  (otherPayments || [])
    .filter((item) => getResourceMonthKey(item, "paidAt") === monthKey)
    .forEach((item) => {
      rows.push([
        "Outros pagamentos",
        item.paidAt || "",
        item.product || "",
        "",
        item.paymentMethod || "",
        item.place || "Local não informado",
        "",
        "",
        formatCsvNumber(item.totalValue),
      ]);
    });

  return [
    headers.map(escapeCsv).join(";"),
    ...rows.map((row) => row.map(escapeCsv).join(";")),
  ].join("\r\n");
}
