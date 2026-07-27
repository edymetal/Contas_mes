import { getPersonById } from "../config/people.js";
import { monthFromDate } from "../domain/expenses.js";

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

export function formatSignedCurrency(value, sign) {
  const amount = Math.abs(Number(value || 0));
  if (!amount) return formatCurrency(0);

  return `${sign === "negative" ? "-" : "+"}${formatCurrency(amount)}`;
}

export function getPlaceSuggestions(payments) {
  const uniquePlaces = new Map();

  payments.forEach((payment) => {
    const place = String(payment.place || "").trim();
    if (!place) return;

    const normalizedPlace = place.toLocaleLowerCase("pt-BR");
    if (normalizedPlace === "local não informado") return;
    if (!uniquePlaces.has(normalizedPlace)) uniquePlaces.set(normalizedPlace, place);
  });

  return Array.from(uniquePlaces.values()).sort((first, second) => (
    first.localeCompare(second, "pt-BR", { sensitivity: "base" })
  ));
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthValue() {
  const today = new Date();
  const referenceDate = today.getDate() > 5
    ? new Date(today.getFullYear(), today.getMonth() + 1, 1)
    : today;
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function getSettlementPaymentMonthKey(payment) {
  return payment.monthKey || monthFromDate(payment.paidAt || "");
}

export function getPaidAtMonthKey(payment) {
  return monthFromDate(payment.paidAt || payment.monthKey || "");
}

function capitalizeFirst(value) {
  if (!value) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return "Sem mes";
  const [year] = monthKey.split("-").map(Number);
  return `${formatMonthName(monthKey)} ${year}`;
}

export function formatMonthName(monthKey) {
  if (!monthKey) return "Sem mês";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return capitalizeFirst(monthLabel);
}

export function getShare(expense, personId) {
  return expense.shares?.[personId];
}

export function personName(id) {
  return getPersonById(id)?.name || id;
}

export function formatEmail(email) {
  return email ? email.toLowerCase() : "";
}

export function getPersonInitials(person) {
  const name = person?.name || "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";

  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

export function getPersonPhotoUrl(person, firebaseUser, userProfiles = {}) {
  const savedPhotoUrl = userProfiles[person?.id]?.photoURL;
  if (savedPhotoUrl) return savedPhotoUrl;

  const personEmails = [person?.email, ...(person?.emails || [])]
    .filter(Boolean)
    .map((email) => email.toLowerCase());
  const userEmail = firebaseUser?.email?.toLowerCase();

  if (firebaseUser?.photoURL && userEmail && personEmails.includes(userEmail)) {
    return firebaseUser.photoURL;
  }

  return person?.photoUrl || "";
}

export function getViewTitle(activeView) {
  if (activeView === "dashboard") return "Dashboard geral";
  if (activeView === "new") return "Nova conta";
  if (activeView === "other-accounts") return "Outras Contas";
  if (activeView === "settlement") return "Acerto de contas";
  if (activeView === "manage") return "Gerenciar contas";
  if (activeView === "settings") return "Configurações";
  return `Minhas contas: ${personName(activeView)}`;
}

export function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function formatDateMonth(date) {
  if (!date) return "-";
  return formatMonthLabel(monthFromDate(date));
}

export function formatInstallmentPeriod(installment) {
  const start = formatDateMonth(installment.firstDueDate);
  const end = formatDateMonth(installment.finalDueDate);
  return start === end ? start : `${start} até ${end}`;
}

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
