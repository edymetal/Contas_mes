import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  AlertTriangle,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Home,
  KeyRound,
  LogOut,
  Menu,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  ShoppingCart,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, db, googleProvider, hasFirebaseConfig } from "./services/firebase";
import {
  analyzeMarketReceipt,
  getStoredGeminiApiKey,
  removeStoredGeminiApiKey,
  saveStoredGeminiApiKey,
  validateGeminiApiKey,
} from "./services/receiptAnalysis";
import { CATEGORIES, PAYMENT_TYPES, PEOPLE, getPersonById, getProfileByEmail } from "./config/people";
import {
  calculateSettlementRows,
  collectPendingSettlementShares,
  getSettlementAccountingMonth,
  hasLaterSettlementPayment,
  resolveLegacyAffectedShares,
} from "./domain/settlements";
import packageInfo from "../package.json";

const appVersion = import.meta.env.VITE_APP_VERSION || packageInfo.version;

const MONTHS_PT = [
  { value: "01", short: "Jan" },
  { value: "02", short: "Fev" },
  { value: "03", short: "Mar" },
  { value: "04", short: "Abr" },
  { value: "05", short: "Mai" },
  { value: "06", short: "Jun" },
  { value: "07", short: "Jul" },
  { value: "08", short: "Ago" },
  { value: "09", short: "Set" },
  { value: "10", short: "Out" },
  { value: "11", short: "Nov" },
  { value: "12", short: "Dez" },
];

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const emptyForm = {
  title: "",
  totalValue: "",
  expenseDate: "",
  expensePaymentMethod: "Dinheiro",
  customExpensePaymentMethod: "",
  dueDate: "",
  dueDay: new Date().getDate(),
  category: "Casa",
  payerId: "edney",
  participants: ["edney", "sonia", "rodney"],
  type: "normal", // normal, installment, recurring
  currentInstallment: 1,
  installmentsCount: 12,
  recurringMonths: 12,
};

const emptyMarketForm = {
  market: "",
  product: "",
  description: "",
  quantity: "1",
  unitValue: "",
  purchasedAt: todayInputValue(),
};

const emptyOtherPaymentForm = {
  place: "",
  paidAt: todayInputValue(),
  product: "",
  paymentMethod: "Cartão",
  quantity: "1",
  unitValue: "",
};

function addMonths(dateStr, months) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  const yearOut = d.getUTCFullYear();
  const monthOut = d.getUTCMonth();
  const maxDays = new Date(Date.UTC(yearOut, monthOut + 1, 0)).getUTCDate();
  const dayOut = Math.min(day, maxDays);
  const paddedMonth = String(monthOut + 1).padStart(2, "0");
  const paddedDay = String(dayOut).padStart(2, "0");
  return `${yearOut}-${paddedMonth}-${paddedDay}`;
}

function shiftMonth(monthStr, delta) {
  if (!monthStr) return "";
  const [year, month] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  const yearOut = d.getUTCFullYear();
  const monthOut = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yearOut}-${monthOut}`;
}

function getMonthDistance(fromMonth, toMonth) {
  if (!fromMonth || !toMonth) return 0;
  const [fromYear, fromMonthNumber] = fromMonth.split("-").map(Number);
  const [toYear, toMonthNumber] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

const navItems = [
  { id: "dashboard", label: "Painel", icon: BarChart3 },
  { id: "new", label: "Nova conta", icon: Plus },
  ...PEOPLE.map((person) => ({ id: person.id, label: person.name, icon: UserRound })),
  { id: "other-accounts", label: "Outras Contas", icon: WalletCards },
  { id: "settlement", label: "Acerto", icon: ArrowRightLeft },
  { id: "manage", label: "Gerenciar contas", icon: SlidersHorizontal },
  { id: "settings", label: "Configurações", icon: Settings },
];

function isAdminProfile(profile) {
  return profile?.role === "admin";
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatSignedCurrency(value, sign) {
  const amount = Math.abs(Number(value || 0));
  if (!amount) return formatCurrency(0);

  return `${sign === "negative" ? "-" : "+"}${formatCurrency(amount)}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getPlaceSuggestions(payments) {
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

function getFirebaseActionError(error, action) {
  if (error?.code === "permission-denied") {
    return `Sem permissão para ${action}. Publique as regras do Firestore atualizadas para liberar Mercado e Outros pagamentos.`;
  }
  return `Não foi possível ${action}: ${error?.message || error}`;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthValue() {
  const today = new Date();
  const referenceDate = today.getDate() > 5 ? new Date(today.getFullYear(), today.getMonth() + 1, 1) : today;
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function monthFromDate(date) {
  return date ? date.slice(0, 7) : "";
}

function getSettlementPaymentMonthKey(payment) {
  return payment.monthKey || monthFromDate(payment.paidAt || "");
}

function getPaidAtMonthKey(payment) {
  return monthFromDate(payment.paidAt || payment.monthKey || "");
}

function capitalizeFirst(value) {
  if (!value) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "Sem mes";
  const [year] = monthKey.split("-").map(Number);
  return `${formatMonthName(monthKey)} ${year}`;
}

function formatMonthName(monthKey) {
  if (!monthKey) return "Sem mês";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return capitalizeFirst(monthLabel);
}

function getExpenseMonthKey({ dueDate, expenseDate, type }) {
  if ((type || "normal") === "normal") {
    return monthFromDate(expenseDate || dueDate);
  }

  return monthFromDate(dueDate);
}

function getShare(expense, personId) {
  return expense.shares?.[personId];
}

function personName(id) {
  return getPersonById(id)?.name || id;
}

function formatEmail(email) {
  return email ? email.toLowerCase() : "";
}

function getPersonInitials(person) {
  const name = person?.name || "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";

  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

function getPersonPhotoUrl(person, firebaseUser, userProfiles = {}) {
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

function formatInstallmentLabel(label) {
  if (!label) return "";
  if (isFixedExpense({ installment: label })) return "Fixo";
  return label;
}

function isFixedExpense(expense) {
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

function getExpenseKind(expense) {
  if (isFixedExpense(expense)) return "fixed";
  if (getInstallmentInfo(expense)) return "installment";
  return "normal";
}

function isSettledStatus(status) {
  return status === "paid" || status === "settled" || status === "self";
}

function getInstallmentInfo(expense) {
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

function isValidInstallmentExpense(expense) {
  const installmentInfo = getInstallmentInfo(expense);
  if (!installmentInfo) return true;
  if (installmentInfo.current > installmentInfo.total) return false;
  return true;
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

function getInstallmentSeriesKey(expense, installmentInfo) {
  if (expense?.installmentSeriesId) return `series:${expense.installmentSeriesId}`;
  return `legacy:${getLegacyInstallmentSeriesKey(expense, installmentInfo)}`;
}

function isSameInstallmentSeries(referenceExpense, candidateExpense) {
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

function isSameFixedSeries(referenceExpense, candidateExpense) {
  if (!isFixedExpense(referenceExpense) || !isFixedExpense(candidateExpense)) return false;

  if (referenceExpense.fixedSeriesId && candidateExpense.fixedSeriesId) {
    return referenceExpense.fixedSeriesId === candidateExpense.fixedSeriesId;
  }

  return getLegacyFixedSeriesKey(referenceExpense) === getLegacyFixedSeriesKey(candidateExpense);
}

async function commitFirestoreMutations(mutations) {
  const batchSize = 450;

  for (let index = 0; index < mutations.length; index += batchSize) {
    const batch = writeBatch(db);
    mutations.slice(index, index + batchSize).forEach((mutation) => {
      if (mutation.operation === "delete") {
        batch.delete(mutation.reference);
      } else if (mutation.operation === "set") {
        batch.set(mutation.reference, mutation.data);
      } else {
        batch.update(mutation.reference, mutation.data);
      }
    });
    await batch.commit();
  }
}

function getExpenseSettlementDate(expense) {
  return Object.values(expense.shares || {})
    .map((share) => share?.payment?.paidAt)
    .filter(Boolean)
    .sort()
    .at(-1) || expense.dueDate || "";
}

function getInstallmentSeriesSummaries(expenses) {
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
    .sort((a, b) => (a.finalDueDate || "").localeCompare(b.finalDueDate || ""));
}

function getInstallmentSeriesMissingHistory(expenses) {
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

function getFixedExpenseMonthGroups(expenses) {
  const groups = new Map();

  expenses
    .filter(isFixedExpense)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
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

  return Array.from(groups.values()).sort((a, b) => (b.monthKey || "").localeCompare(a.monthKey || ""));
}

function getNormalizedExpenses(expenses) {
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

function getExpenseDisplayMonthKey(expense) {
  if (expense.displayMonthKey) return expense.displayMonthKey;

  return monthFromDate(expense.dueDate || expense.monthKey || "");
}

function getExpensesForMonth(expenses, monthKey) {
  return getNormalizedExpenses(expenses)
    .filter((expense) => getExpenseDisplayMonthKey(expense) === monthKey)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("contas_mes_theme") || "dark";
  });
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("contas_mes_theme", theme);
  }, [theme]);
  const [authError, setAuthError] = useState("");
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [monthlyExpenses, setMonthlyExpenses] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [settlementPayments, setSettlementPayments] = useState([]);
  const [marketItems, setMarketItems] = useState([]);
  const [otherPayments, setOtherPayments] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [dataLoading, setDataLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    paidAt: todayInputValue(),
    type: "PIX",
    description: "",
  });
  const [actionMessage, setActionMessage] = useState("");
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingResourceItem, setEditingResourceItem] = useState(null);
  const [marketForm, setMarketForm] = useState(emptyMarketForm);
  const [otherPaymentForm, setOtherPaymentForm] = useState(emptyOtherPaymentForm);
  const [marketFormError, setMarketFormError] = useState("");
  const [otherPaymentFormError, setOtherPaymentFormError] = useState("");
  const installmentHistoryRepairInProgress = useRef(false);
  const canManageData = isAdminProfile(profile);
  const otherPaymentPlaceSuggestions = useMemo(() => getPlaceSuggestions(otherPayments), [otherPayments]);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        setProfile(null);
        setActiveView("dashboard");
        setAuthLoading(false);
        return;
      }

      setAuthError("");
      const matchedProfile = getProfileByEmail(user.email);
      if (!matchedProfile) {
        setProfile(null);
        setAuthError(`A conta ${user.email} nao tem acesso ao sistema. Entre com uma conta autorizada ou solicite a liberacao.`);
        await signOut(auth);
        setAuthLoading(false);
        return;
      }

      if (db) {
        try {
          await setDoc(
            doc(db, "userProfiles", matchedProfile.id),
            {
              personId: matchedProfile.id,
              name: matchedProfile.name,
              email: formatEmail(user.email),
              photoURL: user.photoURL || "",
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } catch {
          setActionMessage("Não foi possível atualizar a foto do usuário.");
        }
      }

      setProfile(matchedProfile);
      setActiveView(matchedProfile.id);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!profile || !db) return undefined;

    return onSnapshot(
      collection(db, "userProfiles"),
      (snapshot) => {
        const nextProfiles = {};
        snapshot.forEach((item) => {
          nextProfiles[item.id] = item.data();
        });
        setUserProfiles(nextProfiles);
      },
      () => {
        setActionMessage("Não foi possível carregar as fotos dos usuários.");
      },
    );
  }, [profile]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    return onSnapshot(
      collection(db, "marketItems"),
      (snapshot) => {
        setMarketItems(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.purchasedAt || "").localeCompare(a.purchasedAt || "")),
        );
      },
      (error) => setActionMessage(getFirebaseActionError(error, "carregar os itens de mercado")),
    );
  }, [profile]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    return onSnapshot(
      collection(db, "otherPayments"),
      (snapshot) => {
        setOtherPayments(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || "")),
        );
      },
      (error) => setActionMessage(getFirebaseActionError(error, "carregar os outros pagamentos")),
    );
  }, [profile]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    setDataLoading(true);
    const expensesQuery = query(collection(db, "expenses"), where("monthKey", "==", selectedMonth));

    return onSnapshot(
      expensesQuery,
      (snapshot) => {
        const nextExpenses = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter(isValidInstallmentExpense)
          .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

        setMonthlyExpenses(nextExpenses);
        setDataLoading(false);
      },
      () => {
        setDataLoading(false);
        setActionMessage("Não foi possível carregar as contas do mês.");
      },
    );
  }, [profile, selectedMonth]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    const expensesQuery = query(collection(db, "expenses"));

    return onSnapshot(expensesQuery, (snapshot) => {
      const nextExpenses = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter(isValidInstallmentExpense)
        .sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));

      setAllExpenses(nextExpenses);
    });
  }, [profile]);

  useEffect(() => {
    if (
      !canManageData ||
      !profile?.id ||
      !db ||
      !allExpenses.length ||
      installmentHistoryRepairInProgress.current
    ) {
      return;
    }

    const incompleteSeries = getInstallmentSeriesMissingHistory(allExpenses);
    if (!incompleteSeries.length) return;

    installmentHistoryRepairInProgress.current = true;

    async function repairInstallmentHistory() {
      const mutations = [];
      let restoredCount = 0;

      incompleteSeries.forEach((group) => {
        const firstExpense = group.firstExpense;
        const firstInfo = getInstallmentInfo(firstExpense);
        if (!firstInfo) return;

        const seriesId = firstExpense.installmentSeriesId || doc(collection(db, "expenses")).id;
        const finalDueDate = firstInfo.finalDueDate || addMonths(firstExpense.dueDate, group.total - group.first);
        const participants = firstExpense.participants || [];
        const shareAmount = roundMoney(Number(firstExpense.totalValue || 0) / Math.max(participants.length, 1));

        group.expenses.forEach((expense) => {
          const info = getInstallmentInfo(expense);
          if (!info) return;

          if (
            expense.installmentSeriesId !== seriesId ||
            info.total !== group.total ||
            info.finalDueDate !== finalDueDate
          ) {
            mutations.push({
              operation: "update",
              reference: doc(db, "expenses", expense.id),
              data: {
                installmentMeta: {
                  current: info.current,
                  total: group.total,
                  finalDueDate,
                },
                installmentSeriesId: seriesId,
                updatedAt: serverTimestamp(),
              },
            });
          }
        });

        for (let current = 1; current < group.first; current += 1) {
          const dueDate = addMonths(firstExpense.dueDate, current - group.first);
          const shares = participants.reduce((acc, personId) => {
            const isPayer = personId === firstExpense.payerId;
            acc[personId] = {
              amount: shareAmount,
              status: isPayer ? "self" : "paid",
              payment: { type: "Pago", paidAt: dueDate },
            };
            return acc;
          }, {});

          mutations.push({
            operation: "set",
            reference: doc(collection(db, "expenses")),
            data: {
              title: firstExpense.title || "Conta parcelada",
              totalValue: Number(firstExpense.totalValue || 0),
              expenseDate: "",
              expensePaymentMethod: "",
              dueDate,
              monthKey: getExpenseMonthKey({ dueDate, expenseDate: "", type: "installment" }),
              category: firstExpense.category || "Outros",
              payerId: firstExpense.payerId,
              participants,
              installment: `Parcela ${current} de ${group.total}`,
              installmentMeta: {
                current,
                total: group.total,
                finalDueDate,
              },
              installmentSeriesId: seriesId,
              fixedSeriesId: null,
              shares,
              createdBy: firstExpense.createdBy || profile.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          });
          restoredCount += 1;
        }
      });

      try {
        await commitFirestoreMutations(mutations);
        setActionMessage(`${restoredCount} parcela(s) anterior(es) recuperada(s) com sucesso.`);
      } catch (error) {
        setActionMessage(getFirebaseActionError(error, "recuperar as parcelas anteriores"));
      } finally {
        installmentHistoryRepairInProgress.current = false;
      }
    }

    repairInstallmentHistory();
  }, [allExpenses, canManageData, profile]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    const settlementsQuery = query(collection(db, "settlements"));

    return onSnapshot(settlementsQuery, (snapshot) => {
      const nextPayments = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.kind === "payment")
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));

      setSettlementPayments(nextPayments);
    });
  }, [profile]);

  const expenses = useMemo(() => {
    const sourceExpenses = allExpenses.length ? allExpenses : monthlyExpenses;
    return getExpensesForMonth(sourceExpenses, selectedMonth);
  }, [allExpenses, monthlyExpenses, selectedMonth]);

  const metrics = useMemo(() => {
    return expenses.reduce(
      (acc, expense) => {
        acc.total += Number(expense.totalValue || 0);

        Object.entries(expense.shares || {}).forEach(([personId, share]) => {
          if (personId === expense.payerId) return;
          if (share.status === "pending") acc.pending += Number(share.amount || 0);
          if (share.status === "paid" || share.status === "settled") acc.paid += Number(share.amount || 0);
        });

        return acc;
      },
      { total: 0, pending: 0, paid: 0 },
    );
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const totals = CATEGORIES.map((category) => ({
      category,
      total: expenses
        .filter((expense) => expense.category === category)
        .reduce((sum, expense) => sum + Number(expense.totalValue || 0), 0),
    }));

    const max = Math.max(...totals.map((item) => item.total), 1);
    return totals.map((item) => ({ ...item, percent: (item.total / max) * 100 }));
  }, [expenses]);

  const dashboardBreakdown = useMemo(() => {
    const labels = {
      normal: "Normais",
      fixed: "Fixas",
      installment: "Parceladas",
    };
    const rows = [
      { id: "normal", label: labels.normal, total: 0, count: 0 },
      { id: "fixed", label: labels.fixed, total: 0, count: 0 },
      { id: "installment", label: labels.installment, total: 0, count: 0 },
    ];
    const byId = new Map(rows.map((row) => [row.id, row]));

    expenses.forEach((expense) => {
      const row = byId.get(getExpenseKind(expense));
      if (!row) return;
      row.count += 1;
      row.total = roundMoney(row.total + Number(expense.totalValue || 0));
    });

    const total = rows.reduce((sum, row) => roundMoney(sum + row.total), 0);
    const max = Math.max(...rows.map((row) => row.total), 1);

    return {
      total,
      rows: rows.map((row) => ({
        ...row,
        percent: total ? (row.total / total) * 100 : 0,
        barPercent: (row.total / max) * 100,
      })),
    };
  }, [expenses]);

  const dashboardYearSummary = useMemo(() => {
    const year = selectedMonth.slice(0, 4);
    const sourceExpenses = allExpenses.length ? allExpenses : monthlyExpenses;
    const normalizedExpenses = getNormalizedExpenses(sourceExpenses);
    const months = MONTHS_PT.map((month) => {
      const monthKey = `${year}-${month.value}`;
      const monthExpenses = normalizedExpenses.filter(
        (expense) => getExpenseDisplayMonthKey(expense) === monthKey,
      );

      return {
        monthKey,
        label: month.short,
        count: monthExpenses.length,
        total: roundMoney(monthExpenses.reduce((sum, expense) => sum + Number(expense.totalValue || 0), 0)),
      };
    });
    const total = roundMoney(months.reduce((sum, month) => sum + month.total, 0));
    const largestMonthTotal = Math.max(...months.map((month) => month.total), 1);

    return {
      year,
      total,
      months: months.map((month) => ({
        ...month,
        percent: (month.total / largestMonthTotal) * 100,
      })),
    };
  }, [allExpenses, monthlyExpenses, selectedMonth]);

  const selectedMonthSettlementPayments = useMemo(
    () => settlementPayments.filter((payment) => getSettlementPaymentMonthKey(payment) === selectedMonth),
    [selectedMonth, settlementPayments],
  );

  const settlementRows = useMemo(
    () => calculateSettlementRows(expenses, selectedMonthSettlementPayments),
    [expenses, selectedMonthSettlementPayments],
  );

  useEffect(() => {
    if (!profile || canManageData) return;
    const canViewActivePage = activeView === "dashboard" || PEOPLE.some((person) => person.id === activeView);
    if (!canViewActivePage) setActiveView(profile.id);
  }, [activeView, canManageData, profile]);

  async function handleLogin() {
    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(error.message || "Não foi possível entrar com o Google.");
    }
  }

  async function handleLogout() {
    setAuthError("");
    await signOut(auth);
  }

  function ensureCanManageData() {
    if (canManageData) return true;
    setActionMessage("Seu acesso e somente leitura. Esta conta nao pode alterar dados.");
    return false;
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateMarketItem(event) {
    event.preventDefault();
    setMarketFormError("");
    setActionMessage("");
    if (!ensureCanManageData()) return;

    const quantity = Number(String(marketForm.quantity).replace(",", "."));
    const unitValue = Number(String(marketForm.unitValue).replace(",", "."));
    if (!marketForm.market.trim() || !marketForm.product.trim() || !marketForm.purchasedAt) {
      setMarketFormError("Preencha mercado, produto e data da compra.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitValue) || unitValue <= 0) {
      setMarketFormError("Informe quantidade e valor válidos.");
      return;
    }

    try {
      await addDoc(collection(db, "marketItems"), {
        market: marketForm.market.trim(),
        product: marketForm.product.trim(),
        description: marketForm.description.trim(),
        quantity,
        unitValue: roundMoney(unitValue),
        totalValue: roundMoney(quantity * unitValue),
        purchasedAt: marketForm.purchasedAt,
        monthKey: monthFromDate(marketForm.purchasedAt),
        createdBy: profile.id,
        createdAt: serverTimestamp(),
      });
      setSelectedMonth(monthFromDate(marketForm.purchasedAt));
      setMarketForm({ ...emptyMarketForm, purchasedAt: marketForm.purchasedAt });
      setActionMessage("Item de mercado adicionado com sucesso.");
    } catch (error) {
      setMarketFormError(getFirebaseActionError(error, "salvar o item"));
    }
  }

  async function handleCreateMarketReceipt(receipt) {
    setMarketFormError("");
    setActionMessage("");
    if (!ensureCanManageData()) throw new Error("Sua conta não pode adicionar lançamentos.");

    const market = String(receipt.market || "").trim();
    const purchasedAt = String(receipt.purchasedAt || "");
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    if (!market || !purchasedAt || !items.length) {
      throw new Error("Confira o mercado, a data e pelo menos um produto.");
    }
    if (items.length > 400) {
      throw new Error("A nota possui itens demais para uma única inclusão.");
    }

    const normalizedItems = items.map((item, index) => {
      const product = String(item.product || "").trim();
      const quantity = Number(String(item.quantity).replace(",", "."));
      const totalValue = Number(String(item.totalValue).replace(",", "."));
      let unitValue = Number(String(item.unitValue).replace(",", "."));
      if (!Number.isFinite(unitValue) || unitValue <= 0) unitValue = totalValue / quantity;
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalValue) || totalValue < 0) {
        throw new Error(`Confira nome, quantidade e total do item ${index + 1}.`);
      }
      return {
        product,
        description: String(item.description || "").trim(),
        quantity,
        unit: String(item.unit || "un").trim() || "un",
        unitValue: roundMoney(unitValue),
        totalValue: roundMoney(totalValue),
        discount: Math.max(0, roundMoney(item.discount)),
        vatRate: Math.max(0, Number(item.vatRate) || 0),
        confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
      };
    });

    const batch = writeBatch(db);
    const receiptRef = doc(collection(db, "marketReceipts"));
    const receiptTotal = roundMoney(receipt.total || normalizedItems.reduce((sum, item) => sum + item.totalValue, 0));
    const receiptMetadata = {
      market,
      address: String(receipt.address || "").trim(),
      vatNumber: String(receipt.vatNumber || "").trim(),
      receiptNumber: String(receipt.receiptNumber || "").trim(),
      purchasedAt,
      purchasedTime: String(receipt.purchasedTime || "").trim(),
      paymentMethod: String(receipt.paymentMethod || "").trim(),
      currency: String(receipt.currency || "EUR").trim().toUpperCase() || "EUR",
      subtotal: Math.max(0, roundMoney(receipt.subtotal)),
      discountTotal: Math.max(0, roundMoney(receipt.discountTotal)),
      taxTotal: Math.max(0, roundMoney(receipt.taxTotal)),
      total: receiptTotal,
      confidence: Math.min(1, Math.max(0, Number(receipt.confidence) || 0)),
      notes: String(receipt.notes || "").trim(),
      itemCount: normalizedItems.length,
      monthKey: monthFromDate(purchasedAt),
      source: "gemini-receipt-import",
      model: String(receipt.model || "gemini-3.5-flash"),
      createdBy: profile.id,
      createdAt: serverTimestamp(),
    };
    batch.set(receiptRef, receiptMetadata);

    normalizedItems.forEach((item, itemIndex) => {
      const itemRef = doc(collection(db, "marketItems"));
      batch.set(itemRef, {
        ...item,
        market,
        purchasedAt,
        monthKey: monthFromDate(purchasedAt),
        receiptId: receiptRef.id,
        receiptItemIndex: itemIndex,
        receiptNumber: receiptMetadata.receiptNumber,
        createdBy: profile.id,
        createdAt: serverTimestamp(),
      });
    });

    try {
      await batch.commit();
      setSelectedMonth(monthFromDate(purchasedAt));
      setActionMessage(`Nota conferida e ${normalizedItems.length} ${normalizedItems.length === 1 ? "item adicionado" : "itens adicionados"} com sucesso.`);
    } catch (error) {
      throw new Error(getFirebaseActionError(error, "salvar os itens da nota"));
    }
  }

  async function handleCreateOtherPayment(event) {
    event.preventDefault();
    setOtherPaymentFormError("");
    setActionMessage("");
    if (!ensureCanManageData()) return;

    const quantity = Number(String(otherPaymentForm.quantity).replace(",", "."));
    const unitValue = Number(String(otherPaymentForm.unitValue).replace(",", "."));
    if (!otherPaymentForm.place.trim() || !otherPaymentForm.product.trim() || !otherPaymentForm.paidAt) {
      setOtherPaymentFormError("Preencha local, produto e data do pagamento.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitValue) || unitValue <= 0) {
      setOtherPaymentFormError("Informe quantidade e valor válidos.");
      return;
    }

    try {
      await addDoc(collection(db, "otherPayments"), {
        place: otherPaymentForm.place.trim(),
        product: otherPaymentForm.product.trim(),
        paymentMethod: otherPaymentForm.paymentMethod,
        quantity,
        unitValue: roundMoney(unitValue),
        totalValue: roundMoney(quantity * unitValue),
        paidAt: otherPaymentForm.paidAt,
        monthKey: monthFromDate(otherPaymentForm.paidAt),
        createdBy: profile.id,
        createdAt: serverTimestamp(),
      });
      setSelectedMonth(monthFromDate(otherPaymentForm.paidAt));
      setOtherPaymentForm({ ...emptyOtherPaymentForm, paidAt: otherPaymentForm.paidAt });
      setActionMessage("Pagamento adicionado com sucesso.");
    } catch (error) {
      setOtherPaymentFormError(getFirebaseActionError(error, "salvar o pagamento"));
    }
  }

  async function handleDeleteResourceItem(collectionName, itemId, label) {
    if (!ensureCanManageData()) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${label}?`)) return;
    try {
      await deleteDoc(doc(db, collectionName, itemId));
      setActionMessage(`${label.charAt(0).toUpperCase()}${label.slice(1)} excluído com sucesso.`);
    } catch (error) {
      setActionMessage(getFirebaseActionError(error, "excluir o lançamento"));
    }
  }

  async function handleDeleteResourceMonth(collectionName, items, listLabel) {
    if (!ensureCanManageData()) return false;
    if (!items.length) return false;

    const monthLabel = formatMonthLabel(selectedMonth);
    const itemLabel = items.length === 1 ? "lançamento" : "lançamentos";
    const confirmed = window.confirm(
      `Apagar permanentemente ${items.length} ${itemLabel} de ${listLabel} em ${monthLabel}?\n\nEsta ação não pode ser desfeita.`,
    );
    if (!confirmed) return false;

    try {
      const deletionTargets = items.map((item) => doc(db, collectionName, item.id));
      if (collectionName === "marketItems") {
        const receiptIds = new Set(items.map((item) => item.receiptId).filter(Boolean));
        receiptIds.forEach((receiptId) => deletionTargets.push(doc(db, "marketReceipts", receiptId)));
      }

      for (let index = 0; index < deletionTargets.length; index += 450) {
        const batch = writeBatch(db);
        deletionTargets.slice(index, index + 450).forEach((target) => batch.delete(target));
        await batch.commit();
      }
      setActionMessage(`${items.length} ${itemLabel} de ${monthLabel} excluído${items.length === 1 ? "" : "s"} com sucesso.`);
      return true;
    } catch (error) {
      setActionMessage(getFirebaseActionError(error, "apagar a lista do mês"));
      return false;
    }
  }

  async function handleUpdateResourceItem(item, updatedData) {
    if (!ensureCanManageData()) return;

    const quantity = Number(String(updatedData.quantity).replace(",", "."));
    const unitValue = Number(String(updatedData.unitValue).replace(",", "."));
    const isMarket = item.kind === "market";
    const date = isMarket ? updatedData.purchasedAt : updatedData.paidAt;
    const location = isMarket ? updatedData.market : updatedData.place;

    if (!location.trim() || !updatedData.product.trim() || !date) {
      throw new Error("Preencha local, produto e data.");
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitValue) || unitValue <= 0) {
      throw new Error("Informe quantidade e valor válidos.");
    }

    const collectionName = isMarket ? "marketItems" : "otherPayments";
    const fields = {
      product: updatedData.product.trim(),
      quantity,
      unitValue: roundMoney(unitValue),
      totalValue: roundMoney(quantity * unitValue),
      monthKey: monthFromDate(date),
      updatedBy: profile.id,
      updatedAt: serverTimestamp(),
    };
    if (isMarket) {
      fields.market = updatedData.market.trim();
      fields.description = updatedData.description.trim();
      fields.purchasedAt = date;
    } else {
      fields.place = updatedData.place.trim();
      fields.paymentMethod = updatedData.paymentMethod;
      fields.paidAt = date;
    }

    await updateDoc(doc(db, collectionName, item.id), fields);
    setSelectedMonth(monthFromDate(date));
    setEditingResourceItem(null);
    setActionMessage("Lançamento atualizado com sucesso.");
  }

  function toggleParticipant(personId) {
    setForm((current) => {
      const hasPerson = current.participants.includes(personId);
      const participants = hasPerson
        ? current.participants.filter((item) => item !== personId)
        : [...current.participants, personId];

      return { ...current, participants };
    });
  }

  async function handleCreateExpense(event) {
    event.preventDefault();
    setFormError("");
    setActionMessage("");
    if (!ensureCanManageData()) return;

    const rawValue = Number(String(form.totalValue).replace(",", "."));
    if (isNaN(rawValue) || rawValue <= 0) {
      setFormError("Informe um valor válido.");
      return;
    }

    if (!form.title.trim()) {
      setFormError("Informe o nome da despesa.");
      return;
    }

    if (!form.participants.length) {
      setFormError("Selecione pelo menos uma pessoa no rateio.");
      return;
    }

    const type = form.type || "normal";
    let computedDueDate = form.dueDate;

    if (type === "installment") {
      if (!computedDueDate) {
        setFormError("Informe a data do próximo vencimento.");
        return;
      }
    } else if (type === "recurring") {
      const dueDay = Number(form.dueDay) || 1;
      if (dueDay < 1 || dueDay > 31) {
        setFormError("Informe um dia de vencimento válido (1 a 31).");
        return;
      }
      const [selYear, selMonth] = selectedMonth.split("-");
      const maxDays = new Date(Number(selYear), Number(selMonth), 0).getDate();
      const finalDay = Math.min(dueDay, maxDays);
      const paddedDay = String(finalDay).padStart(2, "0");
      computedDueDate = `${selYear}-${selMonth}-${paddedDay}`;
    } else {
      if (!computedDueDate) {
        setFormError("Informe a data de vencimento.");
        return;
      }
    }

    let runs = 1;
    let valuePerMonth = rawValue;
    let installmentStartDueDate = computedDueDate;

    const currentInstallment = Number(form.currentInstallment) || 1;
    const totalInstallments = Number(form.installmentsCount) || 12;

    if (type === "installment") {
      if (totalInstallments < 1 || !Number.isInteger(totalInstallments)) {
        setFormError("O total de parcelas deve ser um número inteiro maior ou igual a 1.");
        return;
      }
      if (currentInstallment < 1 || !Number.isInteger(currentInstallment)) {
        setFormError("A parcela atual deve ser um número inteiro maior ou igual a 1.");
        return;
      }
      if (currentInstallment > totalInstallments) {
        setFormError("A parcela atual não pode ser maior que o total de parcelas.");
        return;
      }
      runs = totalInstallments;
      installmentStartDueDate = addMonths(computedDueDate, 1 - currentInstallment);
      valuePerMonth = rawValue;
    } else if (type === "recurring") {
      runs = 12;
      valuePerMonth = rawValue;
    }

    const batch = writeBatch(db);
    const firstGeneratedDueDate = type === "installment" ? installmentStartDueDate : computedDueDate;
    const finalInstallmentDueDate = type === "installment" ? addMonths(firstGeneratedDueDate, runs - 1) : "";
    const installmentSeriesId = type === "installment" ? doc(collection(db, "expenses")).id : null;
    const fixedSeriesId = type === "recurring" ? doc(collection(db, "expenses")).id : null;

    for (let index = 0; index < runs; index += 1) {
      const currentDueDate = addMonths(firstGeneratedDueDate, index);
      const installmentNumber = index + 1;
      const currentExpenseDate = type === "normal" ? form.expenseDate || "" : "";
      const currentMonthKey = getExpenseMonthKey({
        dueDate: currentDueDate,
        expenseDate: currentExpenseDate,
        type,
      });
      
      const shareAmount = roundMoney(valuePerMonth / form.participants.length);
      const shares = form.participants.reduce((acc, personId) => {
        const isHistoricalInstallment = type === "installment" && installmentNumber < currentInstallment;
        const isPayer = personId === form.payerId;
        acc[personId] = {
          amount: shareAmount,
          status: isPayer ? "self" : isHistoricalInstallment ? "paid" : "pending",
          payment: isPayer || isHistoricalInstallment ? { type: "Pago", paidAt: currentDueDate } : null,
        };
        return acc;
      }, {});

      let label = "";
      if (type === "installment") {
        label = `Parcela ${installmentNumber} de ${totalInstallments}`;
      } else if (type === "recurring") {
        label = "Fixo";
      }
      const installmentMeta =
        type === "installment"
          ? {
              current: installmentNumber,
              total: totalInstallments,
              finalDueDate: finalInstallmentDueDate,
            }
          : null;

      const docRef = doc(collection(db, "expenses"));
      const expenseData = {
        title: form.title.trim(),
        totalValue: valuePerMonth,
        expenseDate: currentExpenseDate,
        expensePaymentMethod:
          type === "normal"
            ? form.expensePaymentMethod === "Personalizado"
              ? form.customExpensePaymentMethod.trim()
              : form.expensePaymentMethod || ""
            : "",
        dueDate: currentDueDate,
        monthKey: currentMonthKey,
        category: form.category,
        payerId: form.payerId,
        participants: form.participants,
        installment: label,
        installmentMeta,
        installmentSeriesId,
        fixedSeriesId,
        shares,
        createdBy: profile.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(docRef, expenseData);
    }

    await batch.commit();

    setSelectedMonth(
      getExpenseMonthKey({
        dueDate: computedDueDate,
        expenseDate: type === "normal" ? form.expenseDate || "" : "",
        type,
      }),
    );
    setForm({
      ...emptyForm,
      expenseDate: "",
      expensePaymentMethod: "Dinheiro",
      customExpensePaymentMethod: "",
      dueDate: "",
    });
    setActionMessage(
      type === "normal"
        ? "Conta cadastrada com sucesso."
        : `Lançadas ${runs} parcelas/meses com sucesso.`
    );
    setActiveView("dashboard");
  }

  function openPayment(expense, personId) {
    if (!ensureCanManageData()) return;
    setPaymentTarget({ expense, personId });
    setPaymentForm({ paidAt: todayInputValue(), type: "PIX", description: "" });
  }

  async function confirmPayment(event) {
    event.preventDefault();
    if (!paymentTarget) return;
    if (!ensureCanManageData()) return;

    const { expense, personId } = paymentTarget;
    if (personId !== profile.id) return;

    await updateDoc(doc(db, "expenses", expense.id), {
      [`shares.${personId}.status`]: "paid",
      [`shares.${personId}.payment`]: {
        paidAt: paymentForm.paidAt,
        type: paymentForm.type,
        description: paymentForm.description.trim(),
        registeredBy: profile.id,
        registeredAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    });

    setPaymentTarget(null);
    setActionMessage("Pagamento registrado.");
  }

  function queueAffectedShareUpdates(
    batch,
    sourceExpenses,
    affectedShares,
    settlement,
    { isSettled, paidAt, paymentType, now },
  ) {
    const expensesById = new Map(sourceExpenses.map((expense) => [expense.id, expense]));
    const updatesByExpenseId = new Map();

    affectedShares.forEach((affectedShare) => {
      const expense = expensesById.get(affectedShare.expenseId);
      const share = expense?.shares?.[affectedShare.personId];
      if (!expense || !share) {
        throw new Error("Um dos rateios vinculados ao acerto não foi encontrado.");
      }

      if (share.payment?.settlementId && share.payment.settlementId !== settlement.id) {
        throw new Error("Um rateio deste acerto já foi alterado por outro pagamento.");
      }
      if (isSettled && !["pending", "settled"].includes(share.status)) {
        throw new Error("Um rateio deste acerto possui um status que não pode ser liquidado automaticamente.");
      }

      const existingSettlementPayment = share.status === "settled" ? share.payment : null;
      const updates = updatesByExpenseId.get(expense.id) || {};
      updates[`shares.${affectedShare.personId}.status`] = isSettled
        ? "settled"
        : affectedShare.previousStatus || "pending";
      updates[`shares.${affectedShare.personId}.payment`] = isSettled
        ? {
            settlementId: settlement.id,
            paidAt,
            type: affectedShare.direction === "reverse" ? "Compensação" : paymentType,
            description:
              affectedShare.direction === "reverse"
                ? `Compensado no acerto mensal de ${settlement.monthKey}`
                : `Liquidado no acerto mensal de ${settlement.monthKey}`,
            registeredBy: existingSettlementPayment?.registeredBy || profile.id,
            registeredAt: existingSettlementPayment?.registeredAt || now,
          }
        : affectedShare.previousPayment ?? null;
      updatesByExpenseId.set(expense.id, updates);
    });

    updatesByExpenseId.forEach((updates, expenseId) => {
      batch.update(doc(db, "expenses", expenseId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async function loadSettlementContext(payment) {
    const accountingMonth = getSettlementAccountingMonth(payment);
    if (!accountingMonth) throw new Error("O acerto não possui um mês contábil válido.");

    const [expensesSnapshot, settlementsSnapshot] = await Promise.all([
      getDocs(collection(db, "expenses")),
      getDocs(query(collection(db, "settlements"), where("monthKey", "==", accountingMonth))),
    ]);
    const persistedExpenses = expensesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const persistedPayments = settlementsSnapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => item.kind === "payment");
    const persistedPayment = persistedPayments.find((item) => item.id === payment.id);
    if (!persistedPayment) throw new Error("O pagamento selecionado não foi encontrado.");

    return {
      accountingMonth,
      monthExpenses: getExpensesForMonth(persistedExpenses, accountingMonth),
      persistedPayment: { ...persistedPayment, monthKey: accountingMonth },
      persistedPayments,
    };
  }

  function getAffectedSharesForExistingPayment(payment, monthExpenses) {
    if (Array.isArray(payment.affectedShares) && payment.affectedShares.length) {
      return payment.affectedShares;
    }

    const legacyResolution = resolveLegacyAffectedShares(monthExpenses, payment);
    if (legacyResolution.ambiguous) {
      throw new Error(
        "Este acerto antigo não pode ser relacionado com segurança aos rateios originais. Nenhum dado foi alterado.",
      );
    }
    if (!legacyResolution.affectedShares.length) {
      throw new Error("Nenhum rateio vinculado a este acerto antigo foi encontrado. Nenhum dado foi alterado.");
    }
    return legacyResolution.affectedShares;
  }

  async function registerSettlementPayment(row, paymentData) {
    if (!ensureCanManageData()) return false;

    const rawAmount = Number(String(paymentData.amount).replace(",", "."));
    if (isNaN(rawAmount) || rawAmount <= 0) {
      setActionMessage("Informe um valor de pagamento válido.");
      return false;
    }

    const paymentAmount = roundMoney(rawAmount);
    const remainingAmount = roundMoney(row.amount);
    if (paymentAmount > remainingAmount) {
      setActionMessage(`O valor não pode passar do saldo restante de ${formatCurrency(remainingAmount)}.`);
      return false;
    }

    const isFullPayment = paymentAmount >= remainingAmount;
    const paidAt = paymentData.paidAt || todayInputValue();
    const paymentType = paymentData.type || "PIX";
    const description = paymentData.description?.trim() || "";
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const settlementRef = doc(collection(db, "settlements"));
      const settlement = {
        id: settlementRef.id,
        monthKey: selectedMonth,
        fromId: row.fromId,
        toId: row.toId,
      };
      const affectedShares = isFullPayment ? collectPendingSettlementShares(expenses, row) : [];

      if (isFullPayment) {
        if (!affectedShares.length) {
          setActionMessage("Nenhum rateio pendente foi encontrado para quitar.");
          return false;
        }
        queueAffectedShareUpdates(batch, expenses, affectedShares, settlement, {
          isSettled: true,
          paidAt,
          paymentType,
          now,
        });
      }

      batch.set(settlementRef, {
        schemaVersion: 2,
        kind: "payment",
        monthKey: selectedMonth,
        fromId: row.fromId,
        toId: row.toId,
        amount: paymentAmount,
        paidAt,
        type: paymentType,
        description,
        status: isFullPayment ? "settled" : "partial",
        balanceBeforePayment: remainingAmount,
        balanceAfterPayment: roundMoney(remainingAmount - paymentAmount),
        affectedShares,
        createdBy: profile.id,
        createdAtClient: now,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setActionMessage(isFullPayment ? "Dívida quitada com sucesso." : "Pagamento parcial registrado.");
      return true;
    } catch (error) {
      setActionMessage(getFirebaseActionError(error, "registrar o pagamento de acerto"));
      return false;
    }
  }

  async function updateSettlementPayment(payment, paymentData) {
    if (!ensureCanManageData()) return false;

    const rawAmount = Number(String(paymentData.amount).replace(",", "."));
    if (isNaN(rawAmount) || rawAmount <= 0) {
      setActionMessage("Informe um valor de pagamento valido.");
      return false;
    }

    try {
      const context = await loadSettlementContext(payment);
      const currentPayment = context.persistedPayment;
      const paymentAmount = roundMoney(rawAmount);
      const currentAmount = roundMoney(currentPayment.amount);
      const amountChanged = paymentAmount !== currentAmount;
      const balanceBeforePayment = Number(currentPayment.balanceBeforePayment || currentPayment.amount || 0);
      if (balanceBeforePayment > 0 && paymentAmount > balanceBeforePayment) {
        setActionMessage(`O valor não pode passar de ${formatCurrency(balanceBeforePayment)}.`);
        return false;
      }
      if (amountChanged && hasLaterSettlementPayment(currentPayment, context.persistedPayments)) {
        setActionMessage("Ajuste primeiro os pagamentos mais recentes deste acerto antes de alterar o valor.");
        return false;
      }

      const paidAt = paymentData.paidAt || todayInputValue();
      const paymentType = paymentData.type || "PIX";
      const description = paymentData.description?.trim() || "";
      const isSettled = balanceBeforePayment > 0 && paymentAmount >= balanceBeforePayment;
      const wasSettled = currentPayment.status === "settled";
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      let affectedShares = [];

      if (wasSettled) {
        affectedShares = getAffectedSharesForExistingPayment(currentPayment, context.monthExpenses);
        queueAffectedShareUpdates(batch, context.monthExpenses, affectedShares, currentPayment, {
          isSettled,
          paidAt,
          paymentType,
          now,
        });
      } else if (isSettled) {
        affectedShares = collectPendingSettlementShares(context.monthExpenses, currentPayment);
        if (!affectedShares.length) {
          setActionMessage("Nenhum rateio pendente foi encontrado para quitar neste mês.");
          return false;
        }
        queueAffectedShareUpdates(batch, context.monthExpenses, affectedShares, currentPayment, {
          isSettled: true,
          paidAt,
          paymentType,
          now,
        });
      }

      batch.update(doc(db, "settlements", currentPayment.id), {
        schemaVersion: 2,
        amount: paymentAmount,
        paidAt,
        type: paymentType,
        description,
        status: isSettled ? "settled" : "partial",
        balanceAfterPayment: balanceBeforePayment > 0 ? roundMoney(balanceBeforePayment - paymentAmount) : 0,
        affectedShares: isSettled ? affectedShares : [],
        updatedAt: serverTimestamp(),
        updatedBy: profile.id,
      });

      await batch.commit();
      setActionMessage("Pagamento de acerto atualizado.");
      return true;
    } catch (error) {
      setActionMessage(getFirebaseActionError(error, "atualizar o pagamento de acerto"));
      return false;
    }
  }

  async function deleteSettlementPayment(payment) {
    if (!ensureCanManageData()) return;
    const accountingMonth = getSettlementAccountingMonth(payment);
    if (!window.confirm(
      `Apagar o pagamento de ${formatCurrency(payment.amount)} referente a ${formatMonthLabel(accountingMonth)}?`,
    )) return;

    try {
      const context = await loadSettlementContext(payment);
      const currentPayment = context.persistedPayment;
      if (hasLaterSettlementPayment(currentPayment, context.persistedPayments)) {
        setActionMessage("Apague primeiro os pagamentos mais recentes deste acerto.");
        return;
      }

      const batch = writeBatch(db);
      if (currentPayment.status === "settled") {
        const affectedShares = getAffectedSharesForExistingPayment(currentPayment, context.monthExpenses);
        queueAffectedShareUpdates(batch, context.monthExpenses, affectedShares, currentPayment, {
          isSettled: false,
          paidAt: currentPayment.paidAt || todayInputValue(),
          paymentType: currentPayment.type || "PIX",
          now: new Date().toISOString(),
        });
      }

      batch.delete(doc(db, "settlements", currentPayment.id));
      await batch.commit();
      setActionMessage("Pagamento de acerto apagado.");
    } catch (error) {
      setActionMessage(getFirebaseActionError(error, "apagar o pagamento de acerto"));
    }
  }

  async function handleDeleteExpense(expense) {
    if (!ensureCanManageData()) return;
    const expenseId = typeof expense === "string" ? expense : expense?.id;
    const selectedExpense =
      (typeof expense === "object" ? expense : null) ||
      allExpenses.find((item) => item.id === expenseId) ||
      expenses.find((item) => item.id === expenseId);
    const installmentInfo = getInstallmentInfo(selectedExpense);
    const fixedExpense = isFixedExpense(selectedExpense);
    const confirmationMessage = installmentInfo
      ? `Tem certeza que deseja excluir a parcela ${installmentInfo.current} e todas as parcelas seguintes desta conta?`
      : fixedExpense
        ? "Tem certeza que deseja excluir esta conta fixa deste mês e de todos os meses seguintes?"
        : "Tem certeza que deseja excluir esta conta?";

    if (!expenseId || !window.confirm(confirmationMessage)) return;

    try {
      if (!installmentInfo && !fixedExpense) {
        await deleteDoc(doc(db, "expenses", expenseId));
        setActionMessage("Conta excluída com sucesso.");
        return;
      }

      const snapshot = await getDocs(collection(db, "expenses"));
      const persistedExpenses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const referenceExpense = persistedExpenses.find((item) => item.id === expenseId);

      if (fixedExpense) {
        if (!referenceExpense || !isFixedExpense(referenceExpense)) {
          throw new Error("A conta fixa selecionada não foi encontrada.");
        }

        const referenceMonth = getExpenseDisplayMonthKey(referenceExpense);
        const deletionTargets = persistedExpenses.filter((item) => (
          isSameFixedSeries(referenceExpense, item) &&
          getExpenseDisplayMonthKey(item) >= referenceMonth
        ));

        await commitFirestoreMutations(
          deletionTargets.map((item) => ({
            operation: "delete",
            reference: doc(db, "expenses", item.id),
          })),
        );
        setActionMessage(
          `${deletionTargets.length} ${deletionTargets.length === 1 ? "mês excluído" : "meses excluídos"} da conta fixa com sucesso.`,
        );
        return;
      }

      const referenceInfo = getInstallmentInfo(referenceExpense);
      if (!referenceExpense || !referenceInfo) throw new Error("A conta selecionada não foi encontrada.");

      const deletionTargets = persistedExpenses
        .filter((item) => {
          const itemInfo = getInstallmentInfo(item);
          return (
            itemInfo &&
            itemInfo.current >= referenceInfo.current &&
            isSameInstallmentSeries(referenceExpense, item)
          );
        });

      await commitFirestoreMutations(
        deletionTargets.map((item) => ({
          operation: "delete",
          reference: doc(db, "expenses", item.id),
        })),
      );
      setActionMessage(
        `${deletionTargets.length} ${deletionTargets.length === 1 ? "parcela excluída" : "parcelas excluídas"} com sucesso.`,
      );
    } catch (error) {
      console.error("Erro ao excluir conta:", error);
      setActionMessage(`Erro ao excluir a conta: ${error.message || error}`);
    }
  }

  async function handleUpdateExpense(expenseId, updatedData) {
    if (!canManageData) {
      throw new Error("Seu acesso e somente leitura. Esta conta nao pode alterar dados.");
    }

    const rawValue = Number(String(updatedData.totalValue).replace(",", "."));
    if (isNaN(rawValue) || rawValue <= 0) {
      throw new Error("Informe um valor válido.");
    }
    if (!updatedData.title.trim()) {
      throw new Error("Informe o nome da despesa.");
    }
    if (!updatedData.participants.length) {
      throw new Error("Selecione pelo menos uma pessoa no rateio.");
    }

    const snapshot = await getDocs(collection(db, "expenses"));
    const persistedExpenses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const oldExpense = persistedExpenses.find((expense) => expense.id === expenseId);
    if (!oldExpense) throw new Error("A conta selecionada não foi encontrada.");

    const shareAmount = roundMoney(rawValue / updatedData.participants.length);
    const buildShares = (oldShares, dueDate) => updatedData.participants.reduce((acc, personId) => {
      const oldShare = oldShares?.[personId];
      const wasPayer = personId === updatedData.payerId;

      if (wasPayer) {
        acc[personId] = {
          amount: shareAmount,
          status: "self",
          payment: { type: "Pago", paidAt: dueDate },
        };
      } else {
        const currentStatus = (oldShare?.status === "self" || !oldShare?.status) ? "pending" : oldShare.status;
        const currentPayment = (oldShare?.status === "self" || !oldShare?.status) ? null : oldShare.payment;
        acc[personId] = {
          amount: shareAmount,
          status: currentStatus,
          payment: currentPayment,
        };
      }
      return acc;
    }, {});

    const oldInstallmentInfo = getInstallmentInfo(oldExpense);
    const updatedInstallmentInfo = getInstallmentInfo({ installment: updatedData.installment });

    if (isFixedExpense(oldExpense)) {
      const seriesExpenses = persistedExpenses.filter((item) => isSameFixedSeries(oldExpense, item));
      const seriesId = oldExpense.fixedSeriesId || doc(collection(db, "expenses")).id;
      const referenceMonth = getExpenseDisplayMonthKey(oldExpense);
      const mutations = [];

      seriesExpenses.forEach((item) => {
        const itemMonth = getExpenseDisplayMonthKey(item);
        if (!itemMonth) return;

        if (itemMonth < referenceMonth) {
          if (item.fixedSeriesId !== seriesId) {
            mutations.push({
              operation: "update",
              reference: doc(db, "expenses", item.id),
              data: { fixedSeriesId: seriesId, updatedAt: serverTimestamp() },
            });
          }
          return;
        }

        const monthOffset = getMonthDistance(referenceMonth, itemMonth);
        const dueDate = addMonths(updatedData.dueDate, monthOffset);
        mutations.push({
          operation: "update",
          reference: doc(db, "expenses", item.id),
          data: {
            title: updatedData.title.trim(),
            totalValue: rawValue,
            dueDate,
            monthKey: getExpenseMonthKey({ dueDate, expenseDate: "", type: "recurring" }),
            category: updatedData.category,
            payerId: updatedData.payerId,
            participants: updatedData.participants,
            shares: buildShares(item.shares, dueDate),
            installment: "Fixo",
            installmentMeta: null,
            fixedSeriesId: seriesId,
            updatedAt: serverTimestamp(),
          },
        });
      });

      await commitFirestoreMutations(mutations);
      setActionMessage("Conta fixa e meses seguintes atualizados com sucesso.");
      setEditingExpense(null);
      return;
    }

    if (oldInstallmentInfo && updatedInstallmentInfo) {
      const seriesExpenses = persistedExpenses.filter((item) => isSameInstallmentSeries(oldExpense, item));
      const seriesId = oldExpense.installmentSeriesId || doc(collection(db, "expenses")).id;
      const finalDueDate = addMonths(
        updatedData.dueDate,
        updatedInstallmentInfo.total - updatedInstallmentInfo.current,
      );
      const mutations = [];
      const futureByCurrent = new Map();

      seriesExpenses.forEach((item) => {
        const itemInfo = getInstallmentInfo(item);
        if (!itemInfo) return;

        if (itemInfo.current < oldInstallmentInfo.current) {
          if (item.installmentSeriesId !== seriesId) {
            mutations.push({
              operation: "update",
              reference: doc(db, "expenses", item.id),
              data: { installmentSeriesId: seriesId, updatedAt: serverTimestamp() },
            });
          }
          return;
        }

        const existingItem = futureByCurrent.get(itemInfo.current);
        if (!existingItem || item.id === expenseId) {
          if (existingItem) {
            mutations.push({ operation: "delete", reference: doc(db, "expenses", existingItem.id) });
          }
          futureByCurrent.set(itemInfo.current, item);
        } else {
          mutations.push({ operation: "delete", reference: doc(db, "expenses", item.id) });
        }
      });

      const remainingInstallments = updatedInstallmentInfo.total - updatedInstallmentInfo.current + 1;
      for (let offset = 0; offset < remainingInstallments; offset += 1) {
        const oldCurrent = oldInstallmentInfo.current + offset;
        const current = updatedInstallmentInfo.current + offset;
        const dueDate = addMonths(updatedData.dueDate, offset);
        const existingExpense = futureByCurrent.get(oldCurrent);
        const expenseData = {
          title: updatedData.title.trim(),
          totalValue: rawValue,
          dueDate,
          monthKey: getExpenseMonthKey({ dueDate, expenseDate: "", type: "installment" }),
          category: updatedData.category,
          payerId: updatedData.payerId,
          participants: updatedData.participants,
          shares: buildShares(existingExpense?.shares, dueDate),
          installment: `Parcela ${current} de ${updatedInstallmentInfo.total}`,
          installmentMeta: {
            current,
            total: updatedInstallmentInfo.total,
            finalDueDate,
          },
          installmentSeriesId: seriesId,
          updatedAt: serverTimestamp(),
        };

        if (existingExpense) {
          mutations.push({
            operation: "update",
            reference: doc(db, "expenses", existingExpense.id),
            data: expenseData,
          });
          futureByCurrent.delete(oldCurrent);
        } else {
          mutations.push({
            operation: "set",
            reference: doc(collection(db, "expenses")),
            data: {
              ...expenseData,
              expenseDate: "",
              expensePaymentMethod: "",
              createdBy: profile.id,
              createdAt: serverTimestamp(),
            },
          });
        }
      }

      futureByCurrent.forEach((item) => {
        mutations.push({ operation: "delete", reference: doc(db, "expenses", item.id) });
      });

      await commitFirestoreMutations(mutations);
      setActionMessage("Parcela e meses seguintes atualizados com sucesso.");
      setEditingExpense(null);
      return;
    }

    const shares = buildShares(oldExpense.shares, updatedData.dueDate);

    const updateFields = {
      title: updatedData.title.trim(),
      totalValue: rawValue,
      dueDate: updatedData.dueDate,
      monthKey: getExpenseMonthKey({
        dueDate: updatedData.dueDate,
        expenseDate: oldExpense?.expenseDate || "",
        type: oldExpense?.installment ? "installment" : "normal",
      }),
      category: updatedData.category,
      payerId: updatedData.payerId,
      participants: updatedData.participants,
      shares,
      installmentMeta: null,
      updatedAt: serverTimestamp(),
    };

    if (updatedData.installment !== undefined) {
      updateFields.installment = updatedData.installment;
      const installmentInfo = getInstallmentInfo({ installment: updatedData.installment });
      updateFields.installmentMeta = installmentInfo
        ? {
            current: installmentInfo.current,
            total: installmentInfo.total,
            finalDueDate: addMonths(updatedData.dueDate, installmentInfo.total - installmentInfo.current),
          }
        : null;
    }

    await updateDoc(doc(db, "expenses", expenseId), updateFields);

    setActionMessage("Conta atualizada com sucesso.");
    setEditingExpense(null);
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <LoginScreen error={authError} onLogin={handleLogin} missingConfig={!hasFirebaseConfig} />;
  }

  const visibleNavItems = canManageData
    ? navItems
    : navItems.filter((item) => item.id === "dashboard" || PEOPLE.some((person) => person.id === item.id));
  const visiblePeople = PEOPLE;

  return (
    <main className="app-shell">
      {isDrawerOpen && (
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)} />
      )}

      <aside className={`sidebar ${isDrawerOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">
              <Home size={24} />
            </div>
            <div className="brand-copy">
              <div className="brand-title-row">
                <strong>Contas</strong>
                <span className="app-version" aria-label={`Versão do sistema ${appVersion}`}>
                  v{appVersion}
                </span>
              </div>
              <span>Compartilhadas</span>
            </div>
          </div>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeView === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setIsDrawerOpen(false);
                }}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt={profile.name}
                  className="user-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="user-avatar-placeholder">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <span>Logado como</span>
                <strong>{profile.name}</strong>
                <small>{formatEmail(firebaseUser?.email)}</small>
              </div>
            </div>
            <button className="icon-button" onClick={handleLogout} title="Sair" type="button">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="content-wrapper">
        <header className="mobile-header">
          <button className="icon-button menu-toggle" onClick={() => setIsDrawerOpen(true)} type="button">
            <Menu size={22} />
          </button>
          <div className="mobile-user-tabs">
            {visiblePeople.map((person) => (
              <button
                key={person.id}
                className={`mobile-user-tab ${activeView === person.id ? "active" : ""}`}
                onClick={() => setActiveView(person.id)}
                type="button"
              >
                {person.name}
              </button>
            ))}
          </div>
        </header>

        <section className="content">
          <header className="topbar">
            <div>
              <span className="eyebrow">{selectedMonth}</span>
              <h1>{getViewTitle(activeView)}</h1>
            </div>
            {activeView === "manage" && (
              <ResourceMonthSwitcher selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
            )}
          </header>

        {actionMessage && <div className="notice">{actionMessage}</div>}

        {activeView === "dashboard" && (
          <Dashboard
            breakdown={dashboardBreakdown}
            categoryTotals={categoryTotals}
            dataLoading={dataLoading}
            expenses={expenses}
            metrics={metrics}
            selectedMonth={selectedMonth}
            yearSummary={dashboardYearSummary}
          />
        )}

        {canManageData && activeView === "new" && (
          <NewExpenseForm
            form={form}
            formError={formError}
            onChange={updateForm}
            onSubmit={handleCreateExpense}
            onToggleParticipant={toggleParticipant}
          />
        )}

        {canManageData && activeView === "other-accounts" && (
          <OtherAccountsView
            marketForm={marketForm}
            marketFormError={marketFormError}
            marketItems={marketItems}
            otherPaymentForm={otherPaymentForm}
            otherPaymentFormError={otherPaymentFormError}
            otherPaymentPlaceSuggestions={otherPaymentPlaceSuggestions}
            otherPayments={otherPayments}
            selectedMonth={selectedMonth}
            onMarketChange={(field, value) => setMarketForm((current) => ({ ...current, [field]: value }))}
            onOtherPaymentChange={(field, value) => setOtherPaymentForm((current) => ({ ...current, [field]: value }))}
            onEditMarketItem={(item) => setEditingResourceItem({ ...item, kind: "market" })}
            onEditOtherPayment={(item) => setEditingResourceItem({ ...item, kind: "other-payments" })}
            onDeleteMarketItem={(itemId) => handleDeleteResourceItem("marketItems", itemId, "este item")}
            onDeleteOtherPayment={(itemId) => handleDeleteResourceItem("otherPayments", itemId, "este pagamento")}
            onDeleteMarketMonth={(items) => handleDeleteResourceMonth("marketItems", items, "Mercado")}
            onDeleteOtherPaymentMonth={(items) => handleDeleteResourceMonth("otherPayments", items, "Outros pagamentos")}
            onMonthChange={setSelectedMonth}
            onMarketSubmit={handleCreateMarketItem}
            onMarketReceiptSubmit={handleCreateMarketReceipt}
            onOtherPaymentSubmit={handleCreateOtherPayment}
          />
        )}

        {PEOPLE.some((person) => person.id === activeView) && (
          <PersonExpenses
            expenses={expenses}
            firebaseUser={firebaseUser}
            personId={activeView}
            settlementRows={settlementRows}
            selectedMonth={selectedMonth}
            userProfiles={userProfiles}
            onMonthChange={setSelectedMonth}
          />
        )}

        {canManageData && activeView === "settlement" && (
          <SettlementPanel
            rows={settlementRows}
            settlementPayments={settlementPayments}
            onDeletePayment={deleteSettlementPayment}
            onRegisterPayment={registerSettlementPayment}
            onUpdatePayment={updateSettlementPayment}
          />
        )}

        {canManageData && activeView === "settings" && (
          <SettingsPanel theme={theme} setTheme={setTheme} />
        )}

        {canManageData && activeView === "manage" && (
          <ManagePanel
            allExpenses={allExpenses}
            expenses={expenses}
            selectedMonth={selectedMonth}
            onEdit={setEditingExpense}
            onDelete={handleDeleteExpense}
            dataLoading={dataLoading}
          />
        )}
      </section>
    </div>

      {canManageData && paymentTarget && (
        <PaymentModal
          form={paymentForm}
          onChange={setPaymentForm}
          onClose={() => setPaymentTarget(null)}
          onSubmit={confirmPayment}
          target={paymentTarget}
        />
      )}

      {canManageData && editingExpense && (
        <EditExpenseModal
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSave={handleUpdateExpense}
        />
      )}

      {canManageData && editingResourceItem && (
        <EditResourceItemModal
          item={editingResourceItem}
          placeSuggestions={otherPaymentPlaceSuggestions}
          onClose={() => setEditingResourceItem(null)}
          onSave={handleUpdateResourceItem}
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="login-screen">
      <div className="loader" />
    </main>
  );
}

function LoginScreen({ error, missingConfig, onLogin }) {
  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand large">
          <div className="brand-mark">
            <Home size={28} />
          </div>
          <div>
            <strong>Contas</strong>
            <span>Compartilhadas</span>
          </div>
        </div>

        <h1>Controle familiar de despesas</h1>
        <p>Entre com uma conta Google autorizada para acessar as despesas compartilhadas.</p>

        {missingConfig ? (
          <div className="error-box">Preencha o arquivo .env com as credenciais do Firebase.</div>
        ) : (
          <button className="google-button" onClick={onLogin} type="button">
            <CircleDollarSign size={20} />
            Entrar com o Google
          </button>
        )}

        {error && <div className="error-box">{error}</div>}
      </section>
    </main>
  );
}

function Dashboard({ breakdown, categoryTotals, dataLoading, expenses, metrics, selectedMonth, yearSummary }) {
  const totalCount = expenses.length;
  const averageExpense = totalCount ? breakdown.total / totalCount : 0;
  const rateioTotal = roundMoney(metrics.pending + metrics.paid);
  const paidPercent = rateioTotal ? (metrics.paid / rateioTotal) * 100 : 0;
  const categoryRows = categoryTotals
    .map((item) => ({
      ...item,
      monthPercent: breakdown.total ? (item.total / breakdown.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
  const topCategory = categoryRows.find((item) => item.total > 0);
  const largestExpense = expenses.reduce((largest, expense) => {
    if (!largest) return expense;
    return Number(expense.totalValue || 0) > Number(largest.totalValue || 0) ? expense : largest;
  }, null);
  const nextExpenses = [...expenses]
    .filter((expense) => expense.dueDate)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .slice(0, 4);
  const totalCountLabel = totalCount === 1 ? "1 conta cadastrada neste mês." : `${totalCount} contas cadastradas neste mês.`;
  const nextExpensesLabel = nextExpenses.length === 1 ? "1 item" : `${nextExpenses.length} itens`;
  const overviewCards = [
    {
      icon: ReceiptText,
      label: "Contas no mês",
      value: String(totalCount),
      detail: totalCount === 1 ? "1 registro" : `${totalCount} registros`,
    },
    {
      icon: CircleDollarSign,
      label: "Média por conta",
      value: formatCurrency(averageExpense),
      detail: topCategory ? `Maior categoria: ${topCategory.category}` : "Sem categoria dominante",
    },
    {
      icon: ArrowRightLeft,
      label: "Rateio pendente",
      value: formatCurrency(metrics.pending),
      detail: `${paidPercent.toFixed(0).replace(".", ",")}% pago/liquidado`,
    },
  ];

  return (
    <div className="dashboard-shell">
      <section className="panel dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-eyebrow">Visão geral</span>
          <h2>{formatCurrency(breakdown.total)}</h2>
          <p>{totalCount ? totalCountLabel : "Nenhuma conta cadastrada neste mês."}</p>
        </div>

        <div className="dashboard-hero-stack">
          <div>
            <span>Pago/liquidado</span>
            <strong>{formatCurrency(metrics.paid)}</strong>
          </div>
          <div>
            <span>Pendente</span>
            <strong>{formatCurrency(metrics.pending)}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-overview-grid" aria-label="Indicadores do dashboard">
        {overviewCards.map(({ detail, icon: Icon, label, value }) => (
          <article className="dashboard-overview-card" key={label}>
            <div className="dashboard-overview-icon">
              <Icon size={20} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="panel dashboard-panel dashboard-year-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Período de 1 ano</span>
            <h2>Valores mensais de {yearSummary.year}</h2>
          </div>
          <strong>{formatCurrency(yearSummary.total)}</strong>
        </div>

        <div className="dashboard-year-grid">
          {yearSummary.months.map((month) => (
            <article
              className={`dashboard-year-month ${month.monthKey === selectedMonth ? "selected" : ""}`}
              key={month.monthKey}
            >
              <div>
                <span>{month.label}</span>
                <small>{month.count} {month.count === 1 ? "conta" : "contas"}</small>
              </div>
              <strong>{formatCurrency(month.total)}</strong>
              <div className="dashboard-year-track" aria-hidden="true">
                <span style={{ width: `${month.percent}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="section-heading">
            <h2>Distribuição por tipo</h2>
            <span>{formatCurrency(breakdown.total)}</span>
          </div>

          {dataLoading ? (
            <div className="empty-state">Carregando...</div>
          ) : (
            <div className="dashboard-type-list">
              {breakdown.rows.map((item) => (
                <article className={`dashboard-type-item ${item.id}`} key={item.id}>
                  <div className="dashboard-type-head">
                    <div>
                      <span>{item.label}</span>
                      <small>{item.count} conta(s)</small>
                    </div>
                    <strong>{formatCurrency(item.total)}</strong>
                  </div>
                  <div className="dashboard-track">
                    <div className="dashboard-fill" style={{ width: `${item.percent}%` }} />
                  </div>
                  <small>{item.percent.toFixed(1).replace(".", ",")}% do mês</small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel dashboard-panel">
          <div className="section-heading">
            <h2>Categorias</h2>
            <span>{topCategory ? topCategory.category : "Sem gastos"}</span>
          </div>

          <div className="dashboard-category-list">
            {categoryRows.map((item) => (
              <article className="dashboard-category-row" key={item.category}>
                <div>
                  <span>{item.category}</span>
                  <strong>{formatCurrency(item.total)}</strong>
                </div>
                <div className="dashboard-track">
                  <div className="dashboard-fill" style={{ width: `${item.monthPercent}%` }} />
                </div>
                <small>{item.monthPercent.toFixed(1).replace(".", ",")}% do mês</small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-layout dashboard-layout-compact">
        <section className="panel dashboard-panel">
          <div className="section-heading">
            <h2>Próximos vencimentos</h2>
            <span>{nextExpensesLabel}</span>
          </div>

          {nextExpenses.length ? (
            <div className="dashboard-due-list">
              {nextExpenses.map((expense) => (
                <article className="dashboard-due-row" key={expense.id}>
                  <div>
                    <strong>{expense.title}</strong>
                    <small>{expense.category} • {personName(expense.payerId)}</small>
                  </div>
                  <div>
                    <span>{formatDate(expense.dueDate)}</span>
                    <strong>{formatCurrency(expense.totalValue)}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Nenhum vencimento para listar.</div>
          )}
        </section>

        <section className="panel dashboard-panel dashboard-rateio-panel">
          <div className="section-heading">
            <h2>Rateio</h2>
            <span>{formatCurrency(rateioTotal)}</span>
          </div>

          <div className="dashboard-rateio-meter">
            <div className="dashboard-track">
              <div className="dashboard-fill" style={{ width: `${paidPercent}%` }} />
            </div>
            <div>
              <span>Pago/liquidado</span>
              <strong>{formatCurrency(metrics.paid)}</strong>
            </div>
            <div>
              <span>Pendente</span>
              <strong>{formatCurrency(metrics.pending)}</strong>
            </div>
          </div>

          {largestExpense && (
            <div className="dashboard-highlight">
              <span>Maior conta</span>
              <strong>{largestExpense.title}</strong>
              <small>{formatCurrency(largestExpense.totalValue)}</small>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ExpensesTable({ expenses }) {
  if (!expenses.length) {
    return <div className="empty-state">Nenhuma conta cadastrada neste mês.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Despesa</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Categoria</th>
            <th>Quem pagou</th>
            <th>Rateio</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <strong>{expense.title}</strong>
                  {expense.installment && (
                    <small style={{ display: "block", marginTop: "4px" }}>
                      {formatInstallmentLabel(expense.installment)}
                    </small>
                  )}
                </div>
              </td>
              <td>{formatCurrency(expense.totalValue)}</td>
              <td>{formatDate(expense.dueDate)}</td>
              <td>
                <span className="tag">{expense.category}</span>
              </td>
              <td>{personName(expense.payerId)}</td>
              <td>{expense.participants?.map(personName).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewExpenseForm({ form, formError, onChange, onSubmit, onToggleParticipant }) {
  const splitPreview = useMemo(() => {
    const totalValue = roundMoney(Number(String(form.totalValue).replace(",", ".")));
    if (!totalValue || !form.participants.length) return 0;
    
    return roundMoney(totalValue / form.participants.length);
  }, [form.totalValue, form.participants.length]);

  const monthlyValuePreview = useMemo(() => {
    return roundMoney(Number(String(form.totalValue).replace(",", ".")));
  }, [form.totalValue]);

  return (
    <section className="panel form-panel">
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <label>
            <span>Nome da despesa</span>
            <input
              placeholder="Aluguel, Internet, Seguro Carro"
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
            />
          </label>

          <label>
            <span>Tipo de Lançamento</span>
            <select value={form.type || "normal"} onChange={(event) => onChange("type", event.target.value)}>
              <option value="normal">Conta Única</option>
              <option value="installment">Parcelada (Cartão, etc.)</option>
              <option value="recurring">Fixa / Contínua (Mensal)</option>
            </select>
          </label>

          <label>
            <span>
              {form.type === "installment" ? "Valor da Parcela" : "Valor Mensal em euros"}
            </span>
            <input
              inputMode="decimal"
              placeholder="400,00"
              type="number"
              min="0"
              step="0.01"
              value={form.totalValue}
              onChange={(event) => onChange("totalValue", event.target.value)}
            />
          </label>

          {form.type === "installment" && (
            <>
              <label>
                <span>Vencimento da parcela atual</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => onChange("dueDate", event.target.value)}
                />
              </label>

              <label>
                <span>Parcela atual</span>
                <input
                  type="number"
                  min="1"
                  max={form.installmentsCount}
                  value={form.currentInstallment}
                  onChange={(event) => onChange("currentInstallment", Number(event.target.value))}
                />
              </label>

              <label>
                <span>Total de parcelas</span>
                <input
                  type="number"
                  min="1"
                  value={form.installmentsCount}
                  onChange={(event) => onChange("installmentsCount", event.target.value === "" ? "" : Number(event.target.value))}
                />
              </label>
            </>
          )}



          {form.type === "normal" && (
            <>
              <label>
                <span>Data da despesa</span>
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) => onChange("expenseDate", event.target.value)}
                />
              </label>

              <label>
                <span>Forma de pagamento</span>
                <select
                  value={form.expensePaymentMethod || "Dinheiro"}
                  onChange={(event) => onChange("expensePaymentMethod", event.target.value)}
                >
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Personalizado">Personalizado</option>
                </select>
              </label>

              {form.expensePaymentMethod === "Personalizado" && (
                <label>
                  <span>Forma personalizada</span>
                  <input
                    placeholder="Ex: MB Way, cheque, vale"
                    value={form.customExpensePaymentMethod}
                    onChange={(event) => onChange("customExpensePaymentMethod", event.target.value)}
                  />
                </label>
              )}

              <label>
                <span>Data de vencimento</span>
                <input type="date" value={form.dueDate} onChange={(event) => onChange("dueDate", event.target.value)} />
              </label>
            </>
          )}

          {form.type === "recurring" && (
            <label>
              <span>Dia do vencimento</span>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(event) => onChange("dueDay", Number(event.target.value))}
              />
            </label>
          )}

          <label>
            <span>Categoria</span>
            <select value={form.category} onChange={(event) => onChange("category", event.target.value)}>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Quem pagou originalmente?</span>
            <select value={form.payerId} onChange={(event) => onChange("payerId", event.target.value)}>
              {PEOPLE.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {form.type !== "normal" && (
          <div style={{
            background: "var(--panel-muted)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            padding: "16px",
            fontSize: "0.9rem",
            color: "var(--muted)"
          }}>
            {form.type === "installment" && (
              <p style={{ margin: 0 }}>
                💡 <strong>Conta Parcelada:</strong> Cada parcela tem o valor de <strong>{formatCurrency(form.totalValue)}</strong> (totalizando <strong>{formatCurrency(Number(form.totalValue) * form.installmentsCount)}</strong> para a compra inteira de <strong>{form.installmentsCount} parcelas</strong>). Serão cadastradas todas as <strong>{form.installmentsCount} parcelas</strong>. Quando a parcela atual for maior que 1, as anteriores serão incluídas nos meses correspondentes como já pagas.
              </p>
            )}
            {form.type === "recurring" && (
              <p style={{ margin: 0 }}>
                💡 <strong>Conta Fixa:</strong> Esta despesa de <strong>{formatCurrency(form.totalValue)}</strong> será replicada mensalmente pelos próximos <strong>12 meses</strong>.
              </p>
            )}
          </div>
        )}

        <fieldset className="people-fieldset">
          <legend>Quem deve participar do rateio?</legend>
          <div className="checkbox-grid">
            {PEOPLE.map((person) => (
              <label className="checkbox-card" key={person.id}>
                <input
                  checked={form.participants.includes(person.id)}
                  onChange={() => onToggleParticipant(person.id)}
                  type="checkbox"
                />
                <span>{person.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="split-preview">
          <span>Valor por pessoa (por mês)</span>
          <strong>{formatCurrency(splitPreview)}</strong>
        </div>

        {formError && <div className="error-box">{formError}</div>}

        <button className="primary-button" type="submit">
          <Check size={18} />
          Salvar conta
        </button>
      </form>
    </section>
  );
}

function PersonExpenses({ expenses, firebaseUser, personId, selectedMonth, onMonthChange, settlementRows = [], userProfiles = {} }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(2026);
  const containerRef = useRef(null);

  useEffect(() => {
    if (selectedMonth) {
      const year = Number(selectedMonth.split("-")[0]);
      if (!isNaN(year)) {
        setPickerYear(year);
      }
    }
  }, [selectedMonth]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsPickerOpen(false);
      }
    }
    if (isPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsPickerOpen(false);
      }
    }
    if (isPickerOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPickerOpen]);

  const personExpenses = expenses.filter((expense) => expense.participants?.includes(personId));
  const expensesByPayer = useMemo(() => {
    const groups = [];
    const groupByPayerId = new Map();

    personExpenses.forEach((expense) => {
      let group = groupByPayerId.get(expense.payerId);

      if (!group) {
        group = {
          payerId: expense.payerId,
          expenses: [],
        };
        groupByPayerId.set(expense.payerId, group);
        groups.push(group);
      }

      group.expenses.push(expense);
    });

    return groups;
  }, [personExpenses]);
  const selectedPerson = getPersonById(personId);
  const selectedPersonPhotoUrl = getPersonPhotoUrl(selectedPerson, firebaseUser, userProfiles);
  const paymentSummary = useMemo(() => {
    let listPaidAmount = 0;
    let listDebtAmount = 0;
    const totalsByPayer = PEOPLE
      .filter((person) => person.id !== personId)
      .map((person) => ({
        person,
        originalAmount: 0,
        paidAmount: 0,
        abatedAmount: 0,
        amount: 0,
        receivableAmount: 0,
      }));

    personExpenses.forEach((expense) => {
      const share = getShare(expense, personId);
      if (!share) return;

      listDebtAmount = roundMoney(listDebtAmount + Number(share.amount || 0));

      const displayStatus = expense.payerId === personId ? "self" : share.status;

      if (displayStatus === "paid" || displayStatus === "self") {
        listPaidAmount = roundMoney(listPaidAmount + Number(share.amount || 0));
      }

      if (expense.payerId === personId) return;

      const payerRow = totalsByPayer.find((item) => item.person.id === expense.payerId);
      if (payerRow) {
        payerRow.originalAmount = roundMoney(payerRow.originalAmount + Number(share.amount || 0));
        if (isSettledStatus(share.status)) {
          payerRow.paidAmount = roundMoney(payerRow.paidAmount + Number(share.amount || 0));
        }
      }
    });

    settlementRows.forEach((row) => {
      if (row.fromId === personId) {
        const payerRow = totalsByPayer.find((item) => item.person.id === row.toId);
        if (payerRow) {
          payerRow.amount = roundMoney(payerRow.amount + Number(row.amount || 0));
        }
      }

      if (row.toId === personId) {
        const payerRow = totalsByPayer.find((item) => item.person.id === row.fromId);
        if (payerRow) {
          payerRow.receivableAmount = roundMoney(payerRow.receivableAmount + Number(row.amount || 0));
        }
      }
    });

    totalsByPayer.forEach((row) => {
      const paidAmount = Math.min(row.paidAmount, row.originalAmount);
      row.paidAmount = roundMoney(paidAmount);
      row.abatedAmount = roundMoney(Math.max(row.originalAmount - row.amount - paidAmount, 0));
    });

    const totals = totalsByPayer.reduce(
      (acc, row) => ({
        originalAmount: roundMoney(acc.originalAmount + row.originalAmount),
        paidAmount: roundMoney(acc.paidAmount + row.paidAmount),
        abatedAmount: roundMoney(acc.abatedAmount + row.abatedAmount),
        amount: roundMoney(acc.amount + row.amount),
        receivableAmount: roundMoney(acc.receivableAmount + row.receivableAmount),
      }),
      { originalAmount: 0, paidAmount: 0, abatedAmount: 0, amount: 0, receivableAmount: 0 },
    );
    totals.originalAmount = roundMoney(listDebtAmount);
    totals.paidAmount = roundMoney(listPaidAmount);

    return { totalsByPayer, totals };
  }, [personExpenses, settlementRows, personId]);

  const formattedMonthName = useMemo(() => {
    if (!selectedMonth) return "";
    return formatMonthName(selectedMonth);
  }, [selectedMonth]);

  function handlePrevMonth() {
    onMonthChange(shiftMonth(selectedMonth, -1));
  }

  function handleNextMonth() {
    onMonthChange(shiftMonth(selectedMonth, 1));
  }

  return (
    <section className="panel">
      <div className="section-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2>Contas de {selectedPerson.name}</h2>
          <span>{personExpenses.length} registro(s)</span>
        </div>

        <div className="person-month-switcher" ref={containerRef}>
          <button
            type="button"
            className="icon-button"
            onClick={handlePrevMonth}
            title="Mês Anterior"
          >
            <ChevronLeft size={18} />
          </button>
          
          <button
            type="button"
            className={`person-month-picker-btn ${isPickerOpen ? "active" : ""}`}
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            title="Escolher mês"
          >
            <Calendar size={16} className="picker-icon" />
            <span>{formattedMonthName}</span>
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={handleNextMonth}
            title="Próximo Mês"
          >
            <ChevronRight size={18} />
          </button>

          {isPickerOpen && (
            <div className="custom-month-dropdown">
              <div className="picker-year-header">
                <button
                  type="button"
                  className="year-nav-btn"
                  onClick={() => setPickerYear((prev) => prev - 1)}
                  title="Ano Anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="picker-year-display">{pickerYear}</span>
                <button
                  type="button"
                  className="year-nav-btn"
                  onClick={() => setPickerYear((prev) => prev + 1)}
                  title="Próximo Ano"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="picker-months-grid">
                {MONTHS_PT.map((m) => {
                  const monthValue = `${pickerYear}-${m.value}`;
                  const isSelected = selectedMonth === monthValue;
                  
                  return (
                    <button
                      key={m.value}
                      type="button"
                      className={`picker-month-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        onMonthChange(monthValue);
                        setIsPickerOpen(false);
                      }}
                    >
                      {m.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="person-payment-summary">
        <div className="person-debt-grid">
          {paymentSummary.totalsByPayer.map(({
            person,
            originalAmount,
            paidAmount,
            amount,
            receivableAmount,
          }) => {
            const photoUrl = getPersonPhotoUrl(person, firebaseUser, userProfiles);
            const hasReceivableAmount = receivableAmount > 0;
            const mainAmount = hasReceivableAmount ? receivableAmount : amount;
            const mainAmountClassName = hasReceivableAmount ? "money-positive" : "money-negative";
            const mainAmountSign = hasReceivableAmount ? "positive" : "negative";

            return (
              <div className="person-debt-card" key={person.id}>
                <div className="person-debt-person">
                  <PersonAvatar person={person} photoUrl={photoUrl} />
                  <div>
                    <strong>{person.name}</strong>
                    <small>{formatEmail(person.email)}</small>
                  </div>
                </div>
                <strong className={`person-debt-amount ${mainAmountClassName}`}>
                  {formatSignedCurrency(mainAmount, mainAmountSign)}
                </strong>
                <div className="person-debt-breakdown">
                  <small className="debt-total">Dívida: {formatSignedCurrency(originalAmount, "negative")}</small>
                  <small className="debt-paid">Pago: {formatCurrency(paidAmount)}</small>
                  <small className="debt-receivable">Receber {person.name}: {formatSignedCurrency(receivableAmount, "positive")}</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="person-total-card">
          <div className="person-summary-person">
            <PersonAvatar person={selectedPerson} photoUrl={selectedPersonPhotoUrl} size="large" />
            <div>
              <strong>{selectedPerson.name}</strong>
              <small>{formatEmail(selectedPerson.email)}</small>
            </div>
          </div>
          <div className="person-total-main">
            <span>Total Mês</span>
            <strong className="money-negative">{formatSignedCurrency(paymentSummary.totals.amount, "negative")}</strong>
          </div>
          <div className="person-debt-breakdown">
            <small className="debt-total">Dívida: {formatSignedCurrency(paymentSummary.totals.originalAmount, "negative")}</small>
            <small className="debt-paid">Pago: {formatCurrency(paymentSummary.totals.paidAmount)}</small>
            <small className="debt-abated">
              <span>Abatido</span>
              {paymentSummary.totalsByPayer.map(({ person, abatedAmount }) => (
                <span key={`abated-${person.id}`}>
                  {person.name}: {formatCurrency(abatedAmount)}
                </span>
              ))}
            </small>
          </div>
        </div>
      </div>

      {!personExpenses.length ? (
        <div className="empty-state">Nenhuma conta para este mês.</div>
      ) : (
        <div className="expense-list">
          {expensesByPayer.map(({ payerId, expenses: payerExpenses }) => {
            const payer = getPersonById(payerId);
            const payerPhotoUrl = getPersonPhotoUrl(payer, firebaseUser, userProfiles);

            return (
              <section className="expense-payer-group" key={payerId} aria-label={`Contas pagas por ${personName(payerId)}`}>
                <div className="expense-payer-divider">
                  <div className="expense-payer-label">
                    <PersonAvatar person={payer} photoUrl={payerPhotoUrl} />
                    <strong>{personName(payerId)}</strong>
                  </div>
                  <small>
                    {payerExpenses.length} {payerExpenses.length === 1 ? "conta" : "contas"}
                  </small>
                </div>

                <div className="expense-payer-items">
                  {payerExpenses.map((expense) => {
                    const share = getShare(expense, personId);
                    const isPayer = expense.payerId === personId;
                    const displayStatus = isPayer ? "self" : share?.status;
                    const isPaidOrSettled = isSettledStatus(displayStatus);
                    const amountClassName = isPaidOrSettled ? "money-positive" : "money-negative";
                    const amountLabel = isPaidOrSettled
                      ? formatCurrency(share?.amount)
                      : formatSignedCurrency(share?.amount, "negative");

                    return (
                      <article className="expense-card" key={expense.id}>
                        <div className="expense-main">
                          <h3>{expense.title}</h3>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span className="tag">{expense.category}</span>
                            {expense.installment && (
                              <span className="tag" style={{ background: "var(--panel-muted)", color: "var(--muted)", borderColor: "var(--line)" }}>
                                {formatInstallmentLabel(expense.installment)}
                              </span>
                            )}
                          </div>
                          <p>Vencimento: {formatDate(expense.dueDate)}</p>
                        </div>

                        <div className="expense-side">
                          <strong className={amountClassName}>{amountLabel}</strong>
                          <StatusBadge status={displayStatus} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PersonAvatar({ person, photoUrl, size = "default" }) {
  const className = `person-avatar ${size === "large" ? "large" : ""}`.trim();

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={person.name}
        className={className}
        referrerPolicy="no-referrer"
      />
    );
  }

  return <div className={`${className} placeholder`}>{getPersonInitials(person)}</div>;
}

function StatusBadge({ status }) {
  const labels = {
    pending: "Pendente",
    paid: "Pago",
    settled: "Liquidado",
    self: "Pago",
  };

  return <span className={`status-badge ${status}`}>{labels[status] || "Pendente"}</span>;
}

function PaymentModal({ form, onChange, onClose, onSubmit, target }) {
  const { expense, personId } = target;
  const share = getShare(expense, personId);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <div className="section-heading">
          <div>
            <h2 id="payment-title">Registrar pagamento</h2>
            <span>
              {expense.title} • {formatCurrency(share?.amount)}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <label>
            <span>Data do pagamento</span>
            <input
              type="date"
              value={form.paidAt}
              onChange={(event) => onChange((current) => ({ ...current, paidAt: event.target.value }))}
            />
          </label>

          <label>
            <span>Tipo de pagamento</span>
            <select value={form.type} onChange={(event) => onChange((current) => ({ ...current, type: event.target.value }))}>
              {PAYMENT_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Descrição opcional</span>
            <textarea
              rows="3"
              value={form.description}
              onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button" type="submit">
              Confirmar pagamento
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SettlementPanel({ onDeletePayment, onRegisterPayment, onUpdatePayment, rows, settlementPayments = [] }) {
  const [paymentForms, setPaymentForms] = useState({});
  const [activeSettlementKey, setActiveSettlementKey] = useState(null);
  const [historyMonth, setHistoryMonth] = useState(() => monthFromDate(todayInputValue()));
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editingPaymentForm, setEditingPaymentForm] = useState({
    amount: "",
    paidAt: todayInputValue(),
    type: "PIX",
    description: "",
  });
  const filteredSettlementPayments = useMemo(
    () => settlementPayments.filter((payment) => getPaidAtMonthKey(payment) === historyMonth),
    [historyMonth, settlementPayments],
  );
  const paymentsByMonth = useMemo(() => {
    const grouped = filteredSettlementPayments.reduce((acc, payment) => {
      const monthKey = getPaidAtMonthKey(payment);
      const currentGroup = acc.get(monthKey) || {
        monthKey,
        total: 0,
        payments: [],
      };

      currentGroup.total = roundMoney(currentGroup.total + Number(payment.amount || 0));
      currentGroup.payments.push(payment);
      acc.set(monthKey, currentGroup);
      return acc;
    }, new Map());

    return Array.from(grouped.values()).sort((a, b) => (b.monthKey || "").localeCompare(a.monthKey || ""));
  }, [filteredSettlementPayments]);

  function getRowKey(row) {
    return `${row.fromId}->${row.toId}`;
  }

  function getPaymentForm(row) {
    return paymentForms[getRowKey(row)] || {
      amount: "",
      paidAt: todayInputValue(),
      type: "PIX",
      description: "",
    };
  }

  useEffect(() => {
    if (activeSettlementKey && !rows.some((row) => getRowKey(row) === activeSettlementKey)) {
      setActiveSettlementKey(null);
    }
  }, [activeSettlementKey, rows]);

  useEffect(() => {
    if (editingPaymentId && !filteredSettlementPayments.some((payment) => payment.id === editingPaymentId)) {
      setEditingPaymentId(null);
    }
  }, [editingPaymentId, filteredSettlementPayments]);

  function updatePaymentForm(row, field, value) {
    const key = getRowKey(row);
    setPaymentForms((current) => ({
      ...current,
      [key]: {
        ...getPaymentForm(row),
        ...current[key],
        [field]: value,
      },
    }));
  }

  async function submitPayment(event, row, amountOverride) {
    event?.preventDefault();
    const key = getRowKey(row);
    const form = getPaymentForm(row);
    const saved = await onRegisterPayment(row, {
      ...form,
      amount: amountOverride ?? form.amount,
    });

    if (!saved) return;

    setPaymentForms((current) => ({
      ...current,
      [key]: {
        ...form,
        amount: "",
        description: "",
      },
    }));
  }

  function startEditingPayment(payment) {
    setEditingPaymentId(payment.id);
    setEditingPaymentForm({
      amount: String(payment.amount || ""),
      paidAt: payment.paidAt || todayInputValue(),
      type: payment.type || "PIX",
      description: payment.description || "",
    });
  }

  async function submitPaymentEdit(event, payment) {
    event.preventDefault();
    const saved = await onUpdatePayment(payment, editingPaymentForm);
    if (!saved) return;

    setEditingPaymentId(null);
    setEditingPaymentForm({
      amount: "",
      paidAt: todayInputValue(),
      type: "PIX",
      description: "",
    });
  }

  const selectedRow = rows.find((row) => getRowKey(row) === activeSettlementKey);

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Saldos cruzados</h2>
        <span>{rows.length} saldo(s)</span>
      </div>

      {!rows.length ? (
        <div className="empty-state">Nenhum saldo pendente neste mês.</div>
      ) : (
        <>
          <div className="settlement-selector" aria-label="Escolha o saldo para visualizar">
            {rows.map((row) => {
              const key = getRowKey(row);
              const isActive = key === activeSettlementKey;

              return (
                <button
                  className={`settlement-person-tab${isActive ? " active" : ""}`}
                  key={key}
                  onClick={() => setActiveSettlementKey((current) => (current === key ? null : key))}
                  type="button"
                  aria-expanded={isActive}
                >
                  <span>{personName(row.fromId)}</span>
                  <small>{formatCurrency(row.amount)}</small>
                </button>
              );
            })}
          </div>

          {selectedRow ? (
            <div className="settlement-grid">
              {[selectedRow].map((row) => {
            const form = getPaymentForm(row);

            return (
              <article className="settlement-card settlement-payment-card" key={getRowKey(row)}>
                <div className="settlement-card-heading">
                  <div className="settlement-people">
                    <div>
                      <span>Quem paga</span>
                      <strong>{personName(row.fromId)}</strong>
                    </div>
                    <ArrowRightLeft size={20} />
                    <div>
                      <span>Quem recebe</span>
                      <strong>{personName(row.toId)}</strong>
                    </div>
                  </div>
                </div>

                <div className="settlement-balance-summary" aria-label="Resumo do saldo">
                  <div>
                    <span>Total da dívida</span>
                    <strong>{formatCurrency(row.originalAmount)}</strong>
                  </div>
                  <div>
                    <span>Abatido</span>
                    <strong>{formatCurrency(row.crossPaidAmount)}</strong>
                  </div>
                  <div>
                    <span>Pago</span>
                    <strong>{formatCurrency(row.paidAmount)}</strong>
                  </div>
                  <div className="settlement-remaining-box">
                    <span>Restante</span>
                    <strong>{formatCurrency(row.amount)}</strong>
                  </div>
                </div>

                <form className="settlement-payment-form" onSubmit={(event) => submitPayment(event, row)}>
                  <div className="settlement-form-title">
                    <strong>Registrar pagamento</strong>
                    <span>Informe um valor parcial ou quite o restante da dívida.</span>
                  </div>

                  <label>
                    <span>Valor do pagamento</span>
                    <input
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={form.amount}
                      onChange={(event) => updatePaymentForm(row, "amount", event.target.value)}
                      placeholder={String(row.amount).replace(".", ",")}
                      required
                    />
                  </label>

                  <label>
                    <span>Data</span>
                    <input
                      type="date"
                      value={form.paidAt}
                      onChange={(event) => updatePaymentForm(row, "paidAt", event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Tipo</span>
                    <select value={form.type} onChange={(event) => updatePaymentForm(row, "type", event.target.value)}>
                      {PAYMENT_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>

                  <label className="settlement-description-field">
                    <span>Descrição opcional</span>
                    <input
                      value={form.description}
                      onChange={(event) => updatePaymentForm(row, "description", event.target.value)}
                      placeholder="Ex: transferência recebida"
                    />
                  </label>

                  <div className="settlement-payment-actions">
                    <button className="primary-button" type="submit">
                      Pagamento
                    </button>
                    <button
                      className="secondary-button"
                      onClick={(event) => submitPayment(event, row, row.amount)}
                      type="button"
                    >
                      Pagar Tudo
                    </button>
                  </div>
                </form>
              </article>
            );
              })}
            </div>
          ) : null}
        </>
      )}

      <div className="settlement-history">
        <div className="section-heading settlement-history-heading">
          <div>
            <h2>Histórico de pagamentos</h2>
            <span>{filteredSettlementPayments.length} pagamento(s) em {formatMonthLabel(historyMonth)}</span>
          </div>
          <ResourceMonthSwitcher selectedMonth={historyMonth} onMonthChange={setHistoryMonth} />
        </div>

        {!filteredSettlementPayments.length ? (
          <div className="empty-state settlement-history-empty">
            Nenhum pagamento registrado em {formatMonthLabel(historyMonth)}.
          </div>
        ) : (
          <div className="settlement-history-list">
            {paymentsByMonth.map((group) => (
              <section className="settlement-history-month" key={group.monthKey}>
                <div className="settlement-history-month-heading">
                  <h3>{formatMonthLabel(group.monthKey)}</h3>
                  <span>{formatCurrency(group.total)}</span>
                </div>

                <div className="settlement-history-month-list">
                  {group.payments.map((payment) => {
                    const isEditing = editingPaymentId === payment.id;
                    const hasLaterPayment = hasLaterSettlementPayment(payment, settlementPayments);

                    return (
                      <article className="settlement-history-item" key={payment.id}>
                  {isEditing ? (
                    <form className="settlement-history-edit" onSubmit={(event) => submitPaymentEdit(event, payment)}>
                      <label>
                        <span>Valor</span>
                        <input
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={editingPaymentForm.amount}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, amount: event.target.value }))
                          }
                          readOnly={hasLaterPayment}
                          title={hasLaterPayment ? "Ajuste primeiro os pagamentos mais recentes deste acerto." : ""}
                          required
                        />
                      </label>

                      <label>
                        <span>Data</span>
                        <input
                          type="date"
                          value={editingPaymentForm.paidAt}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, paidAt: event.target.value }))
                          }
                        />
                      </label>

                      <label>
                        <span>Tipo</span>
                        <select
                          value={editingPaymentForm.type}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, type: event.target.value }))
                          }
                        >
                          {PAYMENT_TYPES.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>

                      <label className="settlement-history-description">
                        <span>Descrição</span>
                        <input
                          value={editingPaymentForm.description}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Ex: transferencia recebida"
                        />
                      </label>

                      {hasLaterPayment && (
                        <small className="settlement-history-description">
                          O valor está protegido porque há pagamentos posteriores. Data, tipo e descrição ainda podem ser editados.
                        </small>
                      )}

                      <div className="settlement-history-actions">
                        <button className="primary-button" type="submit">
                          Salvar
                        </button>
                        <button className="secondary-button" onClick={() => setEditingPaymentId(null)} type="button">
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="settlement-history-main">
                        <strong>{formatCurrency(payment.amount)}</strong>
                        <span>
                          {personName(payment.fromId)} pagou {personName(payment.toId)}
                        </span>
                        <small>
                          {formatDate(payment.paidAt)} - {payment.type || "PIX"}
                          {payment.description ? ` - ${payment.description}` : ""}
                        </small>
                        <small>Referente a {formatMonthLabel(payment.monthKey)}</small>
                      </div>

                      <div className="settlement-history-actions">
                        <button
                          className="icon-button"
                          onClick={() => startEditingPayment(payment)}
                          title="Editar pagamento"
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => onDeletePayment(payment)}
                          title={hasLaterPayment ? "Apague primeiro os pagamentos mais recentes deste acerto" : "Apagar pagamento"}
                          type="button"
                          disabled={hasLaterPayment}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsPanel({ theme, setTheme }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState(null);

  async function handleExport() {
    setIsExporting(true);
    setBackupMessage(null);
    try {
      const expensesSnap = await getDocs(collection(db, "expenses"));
      const settlementsSnap = await getDocs(collection(db, "settlements"));

      const expenses = expensesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      const settlements = settlementsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      const exportObj = {
        version: 1,
        exportedAt: new Date().toISOString(),
        expenses,
        settlements
      };

      const jsonString = JSON.stringify(exportObj, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contas_compartilhadas_backup_${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setBackupMessage({ type: "success", text: "Backup exportado com sucesso!" });
    } catch (error) {
      console.error("Erro ao exportar backup:", error);
      setBackupMessage({ type: "error", text: `Erro ao exportar backup: ${error.message || error}` });
    } finally {
      setIsExporting(false);
    }
  }

  function restoreTimestamps(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;

    if (
      typeof obj.seconds === "number" &&
      typeof obj.nanoseconds === "number" &&
      Object.keys(obj).length === 2
    ) {
      return new Timestamp(obj.seconds, obj.nanoseconds);
    }

    if (Array.isArray(obj)) {
      return obj.map(restoreTimestamps);
    }

    const restored = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        restored[key] = restoreTimestamps(obj[key]);
      }
    }
    return restored;
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm("A importação irá adicionar ou atualizar as contas com base no backup. Deseja continuar?")) {
      event.target.value = "";
      return;
    }

    setIsImporting(true);
    setBackupMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (!data || (!data.expenses && !data.settlements)) {
          throw new Error("Formato de backup inválido. O arquivo JSON deve conter as coleções de contas.");
        }

        let importedExpensesCount = 0;
        let importedSettlementsCount = 0;

        // Import expenses
        if (data.expenses && data.expenses.length > 0) {
          let batch = writeBatch(db);
          let count = 0;
          for (const item of data.expenses) {
            const { id, ...docData } = item;
            const restoredData = restoreTimestamps(docData);

            const docRef = doc(db, "expenses", id);
            batch.set(docRef, restoredData, { merge: true });
            count++;
            importedExpensesCount++;

            if (count === 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) {
            await batch.commit();
          }
        }

        // Import settlements
        if (data.settlements && data.settlements.length > 0) {
          let batch = writeBatch(db);
          let count = 0;
          for (const item of data.settlements) {
            const { id, ...docData } = item;
            const restoredData = restoreTimestamps(docData);

            const docRef = doc(db, "settlements", id);
            batch.set(docRef, restoredData, { merge: true });
            count++;
            importedSettlementsCount++;

            if (count === 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) {
            await batch.commit();
          }
        }

        setBackupMessage({
          type: "success",
          text: `Backup importado com sucesso! ${importedExpensesCount} contas e ${importedSettlementsCount} acertos processados.`
        });
      } catch (error) {
        console.error("Erro ao importar backup:", error);
        setBackupMessage({ type: "error", text: `Erro ao importar backup: ${error.message || error}` });
      } finally {
        setIsImporting(false);
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      setBackupMessage({ type: "error", text: "Erro ao ler o arquivo selecionado." });
      setIsImporting(false);
      event.target.value = "";
    };

    reader.readAsText(file);
  }

  return (
    <section className="panel settings-panel">
      <div className="section-heading">
        <h2>Aparência e Personalização</h2>
        <span>Configurações visuais do site</span>
      </div>

      <div style={{ display: "grid", gap: "24px", marginTop: "16px" }}>
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Tema do Sistema</h3>
          <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.9rem" }}>
            Escolha como prefere visualizar o painel de despesas.
          </p>

          <button
            aria-checked={theme === "dark"}
            aria-label="Alternar entre tema claro e tema escuro"
            className="theme-switch-control"
            data-theme-mode={theme}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            role="switch"
            title={theme === "dark" ? "Tema escuro ativo. Clique para usar o tema claro." : "Tema claro ativo. Clique para usar o tema escuro."}
            type="button"
          >
            <span className={theme === "light" ? "theme-switch-label active" : "theme-switch-label"}>
              ☀️ Tema Claro
            </span>
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-thumb">{theme === "dark" ? "🌙" : "☀️"}</span>
            </span>
            <span className={theme === "dark" ? "theme-switch-label active" : "theme-switch-label"}>
              🌙 Tema Escuro
            </span>
          </button>
        </div>

        <hr style={{ border: "0", borderTop: "1px solid var(--line)", margin: "8px 0" }} />

        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Backup de Dados</h3>
          <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.9rem" }}>
            Exporte suas contas e acertos para um arquivo JSON ou importe um backup existente.
          </p>

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="primary-button"
              onClick={handleExport}
              disabled={isExporting || isImporting}
              style={{ minWidth: "150px" }}
            >
              {isExporting ? "Exportando..." : "📥 Exportar JSON"}
            </button>

            <label
              className="secondary-button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isImporting || isExporting ? "not-allowed" : "pointer",
                minWidth: "150px",
                margin: 0,
                textAlign: "center"
              }}
            >
              {isImporting ? "Importando..." : "📤 Importar JSON"}
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={isImporting || isExporting}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {backupMessage && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: backupMessage.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: backupMessage.type === "success" ? "#10b981" : "#ef4444",
                border: backupMessage.type === "success" ? "1px solid #10b981" : "1px solid #ef4444",
                fontSize: "0.9rem"
              }}
            >
              {backupMessage.text}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function getViewTitle(activeView) {
  if (activeView === "dashboard") return "Dashboard geral";
  if (activeView === "new") return "Nova conta";
  if (activeView === "other-accounts") return "Outras Contas";
  if (activeView === "settlement") return "Acerto de contas";
  if (activeView === "manage") return "Gerenciar contas";
  if (activeView === "settings") return "Configurações";
  return `Minhas contas: ${personName(activeView)}`;
}

function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function formatDateMonth(date) {
  if (!date) return "-";
  return formatMonthLabel(monthFromDate(date));
}

function formatInstallmentPeriod(installment) {
  const start = formatDateMonth(installment.firstDueDate);
  const end = formatDateMonth(installment.finalDueDate);
  return start === end ? start : `${start} até ${end}`;
}

function ResourceMonthSwitcher({ selectedMonth, onMonthChange }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(selectedMonth?.split("-")[0]) || new Date().getFullYear());
  const containerRef = useRef(null);

  useEffect(() => {
    const year = Number(selectedMonth?.split("-")[0]);
    if (Number.isFinite(year)) setPickerYear(year);
  }, [selectedMonth]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsPickerOpen(false);
    }
    if (isPickerOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPickerOpen]);

  function changeMonth(month) {
    onMonthChange(`${pickerYear}-${month}`);
    setIsPickerOpen(false);
  }

  return (
    <div className="resource-month-controls resource-month-picker" ref={containerRef}>
      <button className="icon-button" onClick={() => onMonthChange(shiftMonth(selectedMonth, -1))} title="Mês anterior" type="button">
        <ChevronLeft size={18} />
      </button>
      <button
        className={isPickerOpen ? "month-filter resource-month-picker-button active" : "month-filter resource-month-picker-button"}
        type="button"
        aria-expanded={isPickerOpen}
        aria-haspopup="dialog"
        onClick={() => setIsPickerOpen((current) => !current)}
      >
        <Calendar size={18} />
        <span>{formatMonthName(selectedMonth)}</span>
      </button>
      <button className="icon-button" onClick={() => onMonthChange(shiftMonth(selectedMonth, 1))} title="Próximo mês" type="button">
        <ChevronRight size={18} />
      </button>

      {isPickerOpen && (
        <div className="custom-month-dropdown resource-month-dropdown" role="dialog" aria-label="Escolher mês e ano">
          <div className="picker-year-header">
            <button className="year-nav-btn" type="button" onClick={() => setPickerYear((year) => year - 1)} title="Ano anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="picker-year-display">{pickerYear}</span>
            <button className="year-nav-btn" type="button" onClick={() => setPickerYear((year) => year + 1)} title="Próximo ano">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="picker-months-grid">
            {MONTHS_PT.map((month) => {
              const monthValue = `${pickerYear}-${month.value}`;
              return (
                <button
                  className={selectedMonth === monthValue ? "picker-month-btn selected" : "picker-month-btn"}
                  key={month.value}
                  type="button"
                  onClick={() => changeMonth(month.value)}
                >
                  {month.short}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function OtherAccountsView({
  marketForm,
  marketFormError,
  marketItems,
  otherPaymentForm,
  otherPaymentFormError,
  otherPaymentPlaceSuggestions,
  otherPayments,
  selectedMonth,
  onMarketChange,
  onOtherPaymentChange,
  onEditMarketItem,
  onEditOtherPayment,
  onDeleteMarketItem,
  onDeleteOtherPayment,
  onDeleteMarketMonth,
  onDeleteOtherPaymentMonth,
  onMonthChange,
  onMarketSubmit,
  onMarketReceiptSubmit,
  onOtherPaymentSubmit,
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const isDashboard = activeTab === "dashboard";
  const isMarket = activeTab === "market";

  return (
    <div className="other-accounts-page">
      <div className="resource-tabs" role="tablist" aria-label="Tipo de lançamento">
        <button
          className={isDashboard ? "resource-tab active" : "resource-tab"}
          onClick={() => setActiveTab("dashboard")}
          role="tab"
          type="button"
          aria-selected={isDashboard}
        >
          <BarChart3 size={18} /> Painel
        </button>
        <button
          className={isMarket ? "resource-tab active" : "resource-tab"}
          onClick={() => setActiveTab("market")}
          role="tab"
          type="button"
          aria-selected={isMarket}
        >
          <ShoppingCart size={18} /> Mercado
        </button>
        <button
          className={activeTab === "other-payments" ? "resource-tab active" : "resource-tab"}
          onClick={() => setActiveTab("other-payments")}
          role="tab"
          type="button"
          aria-selected={!isMarket}
        >
          <WalletCards size={18} /> Outros pagamentos
        </button>
      </div>

      {isDashboard ? (
        <OtherAccountsDashboard
          marketItems={marketItems}
          otherPayments={otherPayments}
          selectedMonth={selectedMonth}
        />
      ) : (
        <ResourceListView
          form={isMarket ? marketForm : otherPaymentForm}
          formError={isMarket ? marketFormError : otherPaymentFormError}
          items={isMarket ? marketItems : otherPayments}
          kind={activeTab}
          placeSuggestions={otherPaymentPlaceSuggestions}
          selectedMonth={selectedMonth}
          onChange={isMarket ? onMarketChange : onOtherPaymentChange}
          onEdit={isMarket ? onEditMarketItem : onEditOtherPayment}
          onDelete={isMarket ? onDeleteMarketItem : onDeleteOtherPayment}
          onDeleteMonth={isMarket ? onDeleteMarketMonth : onDeleteOtherPaymentMonth}
          onMonthChange={onMonthChange}
          onSubmit={isMarket ? onMarketSubmit : onOtherPaymentSubmit}
          onMarketReceiptSubmit={onMarketReceiptSubmit}
        />
      )}
    </div>
  );
}

function OtherAccountsDashboard({ marketItems, otherPayments, selectedMonth }) {
  const selectedYear = selectedMonth.slice(0, 4);
  const dashboard = useMemo(() => {
    const marketYearItems = marketItems.filter((item) => (
      item.monthKey || monthFromDate(item.purchasedAt)
    ).startsWith(selectedYear));
    const otherYearItems = otherPayments.filter((item) => (
      item.monthKey || monthFromDate(item.paidAt)
    ).startsWith(selectedYear));
    const marketTotal = roundMoney(marketYearItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0));
    const otherTotal = roundMoney(otherYearItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0));
    const total = roundMoney(marketTotal + otherTotal);
    const count = marketYearItems.length + otherYearItems.length;
    const locations = new Map();
    const monthlyTotals = new Map(MONTHS_PT.map(({ value }) => [
      `${selectedYear}-${value}`,
      { market: 0, other: 0 },
    ]));

    marketYearItems.forEach((item) => {
      const monthKey = item.monthKey || monthFromDate(item.purchasedAt);
      const month = monthlyTotals.get(monthKey);
      if (month) month.market = roundMoney(month.market + Number(item.totalValue || 0));
      const label = String(item.market || "Mercado não informado").trim();
      const key = `market:${label.toLowerCase()}`;
      const current = locations.get(key) || { label, kind: "Mercado", total: 0, count: 0 };
      current.total = roundMoney(current.total + Number(item.totalValue || 0));
      current.count += 1;
      locations.set(key, current);
    });
    otherYearItems.forEach((item) => {
      const monthKey = item.monthKey || monthFromDate(item.paidAt);
      const month = monthlyTotals.get(monthKey);
      if (month) month.other = roundMoney(month.other + Number(item.totalValue || 0));
      const label = String(item.place || "Local não informado").trim();
      const key = `other:${label.toLowerCase()}`;
      const current = locations.get(key) || { label, kind: "Outros", total: 0, count: 0 };
      current.total = roundMoney(current.total + Number(item.totalValue || 0));
      current.count += 1;
      locations.set(key, current);
    });

    return {
      total,
      count,
      average: count ? roundMoney(total / count) : 0,
      market: {
        total: marketTotal,
        count: marketYearItems.length,
        percent: total ? (marketTotal / total) * 100 : 0,
        locations: new Set(marketYearItems.map((item) => item.market).filter(Boolean)).size,
      },
      other: {
        total: otherTotal,
        count: otherYearItems.length,
        percent: total ? (otherTotal / total) * 100 : 0,
        locations: new Set(otherYearItems.map((item) => item.place).filter(Boolean)).size,
      },
      months: [...monthlyTotals.entries()].map(([monthKey, values]) => ({
        monthKey,
        market: values.market,
        other: values.other,
        total: roundMoney(values.market + values.other),
      })),
      topLocations: [...locations.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    };
  }, [marketItems, otherPayments, selectedYear]);

  const largestLocationTotal = dashboard.topLocations[0]?.total || 0;

  return (
    <div className="other-dashboard">
      <section className="panel other-dashboard-hero">
        <div className="other-dashboard-toolbar">
          <div>
            <span className="eyebrow">Visão consolidada</span>
            <h2>Resumo anual de {selectedYear}</h2>
            <p>Totais do ano para Mercado e Outros pagamentos.</p>
          </div>
        </div>
        <div className="other-dashboard-total">
          <span>Total combinado em {selectedYear}</span>
          <strong>{formatCurrency(dashboard.total)}</strong>
          <small>{dashboard.count} {dashboard.count === 1 ? "lançamento" : "lançamentos"} • média de {formatCurrency(dashboard.average)}</small>
        </div>
      </section>

      <div className="other-dashboard-summary-grid">
        <article className="panel other-dashboard-type-card market">
          <div className="other-dashboard-card-heading">
            <span className="other-dashboard-type-icon"><ShoppingCart size={21} /></span>
            <div><span>Mercado em {selectedYear}</span><small>{dashboard.market.percent.toFixed(0)}% do total</small></div>
          </div>
          <strong>{formatCurrency(dashboard.market.total)}</strong>
          <div className="other-dashboard-card-meta">
            <span>{dashboard.market.count} itens</span>
            <span>{dashboard.market.locations} mercados</span>
          </div>
        </article>

        <article className="panel other-dashboard-type-card other">
          <div className="other-dashboard-card-heading">
            <span className="other-dashboard-type-icon"><WalletCards size={21} /></span>
            <div><span>Outros pagamentos em {selectedYear}</span><small>{dashboard.other.percent.toFixed(0)}% do total</small></div>
          </div>
          <strong>{formatCurrency(dashboard.other.total)}</strong>
          <div className="other-dashboard-card-meta">
            <span>{dashboard.other.count} lançamentos</span>
            <span>{dashboard.other.locations} locais</span>
          </div>
        </article>
      </div>

      <section className="panel other-dashboard-months">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Evolução anual</span>
            <h3>Valores por mês em {selectedYear}</h3>
          </div>
        </div>
        <div className="other-dashboard-month-table-wrap">
          <table className="other-dashboard-month-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Mercado</th>
                <th>Outros pagamentos</th>
                <th>Total combinado</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.months.map((month) => (
                <tr className={month.total ? "" : "is-empty"} key={month.monthKey}>
                  <th scope="row">{formatMonthName(month.monthKey)}</th>
                  <td>{formatCurrency(month.market)}</td>
                  <td>{formatCurrency(month.other)}</td>
                  <td><strong>{formatCurrency(month.total)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total de {selectedYear}</th>
                <td>{formatCurrency(dashboard.market.total)}</td>
                <td>{formatCurrency(dashboard.other.total)}</td>
                <td><strong>{formatCurrency(dashboard.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="other-dashboard-detail-grid">
        <section className="panel other-dashboard-distribution">
          <div className="section-heading">
            <div><span className="eyebrow">Distribuição</span><h3>Participação no ano</h3></div>
          </div>
          {[
            { label: "Mercado", value: dashboard.market.total, percent: dashboard.market.percent, className: "market" },
            { label: "Outros pagamentos", value: dashboard.other.total, percent: dashboard.other.percent, className: "other" },
          ].map((row) => (
            <div className="other-dashboard-distribution-row" key={row.label}>
              <div><span>{row.label}</span><strong>{formatCurrency(row.value)}</strong></div>
              <div className="other-dashboard-progress" aria-label={`${row.label}: ${row.percent.toFixed(0)}%`}>
                <span className={row.className} style={{ width: `${row.percent}%` }} />
              </div>
            </div>
          ))}
          {!dashboard.count && <div className="empty-state compact">Nenhum lançamento neste ano.</div>}
        </section>

        <section className="panel other-dashboard-locations">
          <div className="section-heading">
            <div><span className="eyebrow">Maiores gastos</span><h3>Principais locais</h3></div>
          </div>
          {dashboard.topLocations.length ? (
            <div className="other-dashboard-location-list">
              {dashboard.topLocations.map((location) => (
                <div className="other-dashboard-location" key={`${location.kind}-${location.label}`}>
                  <div className="other-dashboard-location-copy">
                    <strong>{location.label}</strong>
                    <span>{location.kind} • {location.count} {location.count === 1 ? "lançamento" : "lançamentos"}</span>
                  </div>
                  <strong>{formatCurrency(location.total)}</strong>
                  <div className="other-dashboard-location-bar"><span style={{ width: `${largestLocationTotal ? (location.total / largestLocationTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">Nenhum local para exibir.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function MarketReceiptImporter({ onConfirm }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [apiKey, setApiKey] = useState(() => getStoredGeminiApiKey());
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState({ name: "", type: "", url: "" });

  useEffect(() => () => {
    if (preview.url) URL.revokeObjectURL(preview.url);
  }, [preview.url]);

  function clearImport() {
    setDraft(null);
    setError("");
    setPreview({ name: "", type: "", url: "" });
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openFilePicker(inputRef) {
    if (!apiKey) {
      setError("Configure sua chave gratuita do Gemini para analisar a nota.");
      setIsKeyModalOpen(true);
      return;
    }
    inputRef.current?.click();
  }

  async function handleSelectedFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setDraft(null);
    setPreview({ name: file.name, type: file.type, url: URL.createObjectURL(file) });
    setIsAnalyzing(true);
    try {
      const result = await analyzeMarketReceipt(file, apiKey);
      setDraft({
        ...result,
        purchasedAt: result.purchasedAt || todayInputValue(),
        currency: result.currency || "EUR",
      });
    } catch (analysisError) {
      setError(analysisError?.message || "Não foi possível analisar a nota fiscal.");
    } finally {
      setIsAnalyzing(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <section className="panel receipt-import-panel">
        <div className="receipt-import-copy">
          <span className="receipt-import-icon"><Sparkles size={22} /></span>
          <div>
            <span className="eyebrow">Preenchimento automático</span>
            <h2>Importar nota fiscal italiana</h2>
            <p>Fotografe ou envie a nota. O Gemini identifica mercado, data, totais e todos os produtos para você conferir antes de adicionar.</p>
          </div>
        </div>
        <div className="receipt-import-actions">
          <input
            ref={cameraInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleSelectedFile}
          />
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleSelectedFile}
          />
          <button className="primary-button" type="button" disabled={isAnalyzing} onClick={() => openFilePicker(cameraInputRef)}>
            <Camera size={18} /> Tirar foto
          </button>
          <button className="secondary-button" type="button" disabled={isAnalyzing} onClick={() => openFilePicker(fileInputRef)}>
            <Upload size={18} /> Enviar arquivo
          </button>
        </div>
        <div className={apiKey ? "receipt-key-status configured" : "receipt-key-status"}>
          <span>
            {apiKey ? <span className="receipt-key-active-icon"><Check size={12} strokeWidth={3} /></span> : <KeyRound size={15} />}
            {apiKey ? "Gemini ativa" : "Chave Gemini necessária"}
          </span>
          <button type="button" onClick={() => setIsKeyModalOpen(true)}>
            {apiKey ? "Gerenciar" : "Configurar"}
          </button>
        </div>
        {isAnalyzing && (
          <div className="receipt-analysis-status" role="status">
            <LoaderCircle className="spin-icon" size={20} />
            <div><strong>Lendo a nota em italiano…</strong><span>Identificando dados fiscais, valores e produtos.</span></div>
          </div>
        )}
        {error && <p className="form-error receipt-import-error">{error}</p>}
      </section>

      {draft && (
        <ReceiptReviewModal
          draft={draft}
          preview={preview}
          onChange={setDraft}
          onClose={clearImport}
          onConfirm={async (receipt) => {
            await onConfirm(receipt);
            clearImport();
          }}
        />
      )}

      {isKeyModalOpen && (
        <GeminiApiKeyModal
          hasStoredKey={Boolean(apiKey)}
          onClose={() => setIsKeyModalOpen(false)}
          onSaved={(newKey) => {
            const storedKey = saveStoredGeminiApiKey(newKey);
            setApiKey(storedKey);
            setError("");
            setIsKeyModalOpen(false);
          }}
          onRemove={() => {
            removeStoredGeminiApiKey();
            setApiKey("");
            setError("Chave removida deste aparelho.");
            setIsKeyModalOpen(false);
          }}
        />
      )}
    </>
  );
}

function GeminiApiKeyModal({ hasStoredKey, onClose, onSaved, onRemove }) {
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationError("");
    setIsValidating(true);
    try {
      const validKey = await validateGeminiApiKey(apiKey);
      onSaved(validKey);
    } catch (keyError) {
      setValidationError(keyError?.message || "Não foi possível validar a chave.");
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal gemini-key-modal" role="dialog" aria-modal="true" aria-labelledby="gemini-key-title">
        <div className="section-heading gemini-key-heading">
          <div>
            <span className="eyebrow">Configuração gratuita</span>
            <h2 id="gemini-key-title">Chave da API do Gemini</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}><X size={20} /></button>
        </div>
        <span className="receipt-import-icon"><KeyRound size={22} /></span>
        <p>
          A chave fica salva somente neste navegador e é enviada diretamente ao Google quando uma nota é analisada.
          Ela não entra no código nem na publicação do GitHub Pages.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Chave da API</span>
            <input
              autoComplete="new-password"
              autoFocus
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasStoredKey ? "Cole uma nova chave para substituir" : "Cole aqui sua chave da API"}
              disabled={isValidating}
            />
          </label>
          <p className="gemini-key-help">
            Use uma chave exclusiva e restrita à Gemini API. Você pode criá-la no <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
          </p>
          {validationError && <p className="form-error">{validationError}</p>}
          <div className="modal-actions gemini-key-actions">
            {hasStoredKey && (
              <button className="danger-link-button" type="button" disabled={isValidating} onClick={onRemove}>
                <Trash2 size={17} /> Remover deste aparelho
              </button>
            )}
            <button className="secondary-button" type="button" disabled={isValidating} onClick={onClose}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={isValidating || !apiKey.trim()}>
              {isValidating ? <><LoaderCircle className="spin-icon" size={18} /> Validando…</> : <><Check size={18} /> Validar e salvar</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReceiptReviewModal({ draft, preview, onChange, onClose, onConfirm }) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const itemsTotal = useMemo(
    () => roundMoney(draft.items.reduce((sum, item) => sum + Number(String(item.totalValue || 0).replace(",", ".")), 0)),
    [draft.items],
  );
  const receiptTotal = Number(String(draft.total || 0).replace(",", "."));
  const difference = roundMoney(itemsTotal - receiptTotal);

  function updateField(field, value) {
    onChange((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    onChange((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  }

  function removeItem(index) {
    onChange((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");
    setIsSaving(true);
    try {
      await onConfirm(draft);
    } catch (error) {
      setSaveError(error?.message || "Não foi possível adicionar os itens.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop receipt-review-backdrop" role="presentation">
      <section className="modal receipt-review-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-review-title">
        <div className="section-heading receipt-review-heading">
          <div>
            <span className="eyebrow">Conferência obrigatória</span>
            <h2 id="receipt-review-title">Confira os dados da nota</h2>
            <span>Edite qualquer informação que não corresponda ao documento.</span>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Fechar"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="receipt-review-layout">
            <aside className="receipt-preview-pane">
              {preview.type === "application/pdf" ? (
                <object data={preview.url} type="application/pdf" aria-label="Prévia da nota fiscal">
                  <p>Prévia do PDF indisponível.</p>
                </object>
              ) : (
                <img src={preview.url} alt="Nota fiscal selecionada para conferência" />
              )}
              <small title={preview.name}>{preview.name}</small>
            </aside>

            <div className="receipt-data-pane">
              <div className="form-grid receipt-metadata-grid">
                <label>Mercado<input value={draft.market} onChange={(event) => updateField("market", event.target.value)} required /></label>
                <label>Data<input type="date" value={draft.purchasedAt} onChange={(event) => updateField("purchasedAt", event.target.value)} required /></label>
                <label>Horário<input type="time" value={draft.purchasedTime} onChange={(event) => updateField("purchasedTime", event.target.value)} /></label>
                <label>Nº da nota<input value={draft.receiptNumber} onChange={(event) => updateField("receiptNumber", event.target.value)} /></label>
                <label className="receipt-wide-field">Endereço<input value={draft.address} onChange={(event) => updateField("address", event.target.value)} /></label>
                <label>Partita IVA<input value={draft.vatNumber} onChange={(event) => updateField("vatNumber", event.target.value)} /></label>
                <label>Pagamento<input value={draft.paymentMethod} onChange={(event) => updateField("paymentMethod", event.target.value)} /></label>
              </div>

              <div className="receipt-totals-grid">
                <label>Subtotal (€)<input type="number" min="0" step="0.01" value={draft.subtotal} onChange={(event) => updateField("subtotal", event.target.value)} /></label>
                <label>Descontos (€)<input type="number" min="0" step="0.01" value={draft.discountTotal} onChange={(event) => updateField("discountTotal", event.target.value)} /></label>
                <label>IVA (€)<input type="number" min="0" step="0.01" value={draft.taxTotal} onChange={(event) => updateField("taxTotal", event.target.value)} /></label>
                <label className="receipt-grand-total">Total da nota (€)<input type="number" min="0" step="0.01" value={draft.total} onChange={(event) => updateField("total", event.target.value)} required /></label>
              </div>
            </div>
          </div>

          <div className="receipt-items-heading">
            <div><h3>Produtos identificados</h3><span>{draft.items.length} {draft.items.length === 1 ? "item" : "itens"}</span></div>
            <strong>{formatCurrency(itemsTotal)}</strong>
          </div>

          {Math.abs(difference) > 0.02 && (
            <div className="receipt-warning"><AlertTriangle size={18} /><span>A soma dos itens difere do total da nota em {formatCurrency(Math.abs(difference))}. Confira descontos e valores.</span></div>
          )}
          <div className="receipt-ai-note"><strong>Modelo utilizado:</strong> {draft.model}</div>
          {draft.notes && <div className="receipt-ai-note"><strong>Observação da leitura:</strong> {draft.notes}</div>}

          <div className="receipt-review-table-wrap">
            <table className="receipt-review-table">
              <thead><tr><th>Produto (italiano)</th><th>Descrição</th><th>Qtd.</th><th>Un.</th><th>Unitário</th><th>Desconto</th><th>Total</th><th /></tr></thead>
              <tbody>
                {draft.items.map((item, index) => (
                  <tr key={index}>
                    <td><input aria-label={`Produto ${index + 1}`} value={item.product} onChange={(event) => updateItem(index, "product", event.target.value)} required /></td>
                    <td><input aria-label={`Descrição ${index + 1}`} value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} /></td>
                    <td><input aria-label={`Quantidade ${index + 1}`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} required /></td>
                    <td><input aria-label={`Unidade ${index + 1}`} value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} /></td>
                    <td><input aria-label={`Valor unitário ${index + 1}`} type="number" min="0" step="0.01" value={item.unitValue} onChange={(event) => updateItem(index, "unitValue", event.target.value)} required /></td>
                    <td><input aria-label={`Desconto ${index + 1}`} type="number" min="0" step="0.01" value={item.discount} onChange={(event) => updateItem(index, "discount", event.target.value)} /></td>
                    <td><input aria-label={`Total ${index + 1}`} type="number" min="0" step="0.01" value={item.totalValue} onChange={(event) => updateItem(index, "totalValue", event.target.value)} required /></td>
                    <td><button className="icon-button danger-button" type="button" title="Remover item" onClick={() => removeItem(index)}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!draft.items.length && <div className="empty-state">Todos os itens foram removidos. Analise a nota novamente.</div>}
          </div>

          {saveError && <p className="form-error">{saveError}</p>}
          <div className="modal-actions receipt-review-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={isSaving || !draft.items.length}>
              {isSaving ? <LoaderCircle className="spin-icon" size={18} /> : <Check size={18} />}
              {isSaving ? "Adicionando…" : `Conferi e adicionar ${draft.items.length} itens`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ResourceListView({
  form,
  formError,
  items,
  kind,
  placeSuggestions,
  selectedMonth,
  onChange,
  onEdit,
  onDelete,
  onDeleteMonth,
  onMonthChange,
  onMarketReceiptSubmit,
  onSubmit,
}) {
  const isMarket = kind === "market";
  const [isDeletingMonth, setIsDeletingMonth] = useState(false);
  const monthlyItems = useMemo(
    () => items.filter((item) => {
      const itemDate = isMarket ? item.purchasedAt : item.paidAt;
      return (item.monthKey || monthFromDate(itemDate)) === selectedMonth;
    }),
    [isMarket, items, selectedMonth],
  );
  const monthlyTotal = useMemo(
    () => monthlyItems.reduce((total, item) => roundMoney(total + Number(item.totalValue || 0)), 0),
    [monthlyItems],
  );
  const totalPreview = roundMoney(
    Number(String(form.quantity || 0).replace(",", ".")) * Number(String(form.unitValue || 0).replace(",", ".")),
  );
  const dateField = isMarket ? "purchasedAt" : "paidAt";

  async function handleDeleteMonth() {
    setIsDeletingMonth(true);
    try {
      await onDeleteMonth(monthlyItems);
    } finally {
      setIsDeletingMonth(false);
    }
  }

  return (
    <div className="resource-page">
      {isMarket && <MarketReceiptImporter onConfirm={onMarketReceiptSubmit} />}

      <section className="panel resource-form-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Novo lançamento</span>
            <h2>{isMarket ? "Adicionar item de mercado" : "Adicionar outro pagamento"}</h2>
          </div>
          <strong className="resource-preview-total">{formatCurrency(totalPreview)}</strong>
        </div>

        <form className="form-grid resource-form" onSubmit={onSubmit}>
          <label>
            {isMarket ? "Mercado" : "Local"}
            {isMarket ? (
              <input
                value={form.market}
                onChange={(event) => onChange("market", event.target.value)}
                placeholder="Ex.: ARD"
              />
            ) : (
              <PlaceAutocomplete
                id="new-other-payment-place"
                value={form.place}
                suggestions={placeSuggestions}
                onChange={(value) => onChange("place", value)}
                placeholder="Ex.: Amazon"
              />
            )}
          </label>
          <label>
            Data
            <input type="date" value={form[dateField]} onChange={(event) => onChange(dateField, event.target.value)} />
          </label>
          <label>
            Produto
            <input value={form.product} onChange={(event) => onChange("product", event.target.value)} placeholder="Nome do produto" />
          </label>
          {isMarket ? (
            <label>
              Descrição
              <input value={form.description} onChange={(event) => onChange("description", event.target.value)} placeholder="Ex.: Alimentos" />
            </label>
          ) : (
            <label>
              Pagamento
              <select value={form.paymentMethod} onChange={(event) => onChange("paymentMethod", event.target.value)}>
                {PAYMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
          )}
          <label>
            Qtd
            <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => onChange("quantity", event.target.value)} />
          </label>
          <label>
            Valor unitário (€)
            <input type="number" min="0.01" step="0.01" value={form.unitValue} onChange={(event) => onChange("unitValue", event.target.value)} />
          </label>
          {formError && <p className="form-error resource-form-error">{formError}</p>}
          <div className="resource-form-action">
            <button className="primary-button" type="submit"><Plus size={18} /> Adicionar à lista</button>
          </div>
        </form>
      </section>

      <section className="panel resource-list-panel">
        <div className="section-heading resource-list-heading">
          <div>
            <span className="eyebrow">Controle mensal</span>
            <h2>{formatMonthLabel(selectedMonth)}</h2>
          </div>
          <div className="resource-list-actions">
            <button
              className="resource-delete-month-button"
              type="button"
              disabled={!monthlyItems.length || isDeletingMonth}
              onClick={handleDeleteMonth}
            >
              {isDeletingMonth ? <LoaderCircle className="spin-icon" size={17} /> : <Trash2 size={17} />}
              {isDeletingMonth ? "Apagando…" : "Apagar lista do mês"}
            </button>
            <ResourceMonthSwitcher selectedMonth={selectedMonth} onMonthChange={onMonthChange} />
          </div>
        </div>

        <div className="resource-total-card">
          <span>Total do mês</span>
          <strong>{formatCurrency(monthlyTotal)}</strong>
          <small>{monthlyItems.length} {monthlyItems.length === 1 ? "lançamento" : "lançamentos"}</small>
        </div>

        <div className="resource-table-wrap">
          <table className="resource-table">
            <thead>
              <tr>
                <th>{isMarket ? "Mercado" : "Local"}</th>
                <th>Data</th>
                <th>Produto</th>
                <th>{isMarket ? "Descrição" : "Pagamento"}</th>
                <th>Qtd</th>
                <th>Valor</th>
                <th>Total</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {monthlyItems.map((item) => (
                <tr key={item.id}>
                  <td>{isMarket ? item.market : item.place}</td>
                  <td>{formatDate(isMarket ? item.purchasedAt : item.paidAt)}</td>
                  <td>{item.product}</td>
                  <td>{isMarket ? item.description || "-" : item.paymentMethod}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unitValue)}</td>
                  <td><strong>{formatCurrency(item.totalValue)}</strong></td>
                  <td>
                    <div className="resource-row-actions">
                      <button className="icon-button" title="Editar lançamento" type="button" onClick={() => onEdit(item)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-button danger-button" title="Excluir lançamento" type="button" onClick={() => onDelete(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!monthlyItems.length && <div className="empty-state">Nenhum lançamento neste mês.</div>}
        </div>
      </section>
    </div>
  );
}

function PlaceAutocomplete({ id, value, suggestions, onChange, placeholder, required = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchValue = normalizeSearchText(value.trim());
  const filteredSuggestions = useMemo(() => {
    if (!searchValue) return [];

    return suggestions
      .filter((suggestion) => {
        const normalizedSuggestion = normalizeSearchText(suggestion);
        return normalizedSuggestion.includes(searchValue) && normalizedSuggestion !== searchValue;
      })
      .slice(0, 8);
  }, [searchValue, suggestions]);
  const showSuggestions = isOpen && filteredSuggestions.length > 0;

  function selectSuggestion(suggestion) {
    onChange(suggestion);
    setIsOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!filteredSuggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, filteredSuggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && showSuggestions) {
      event.preventDefault();
      selectSuggestion(filteredSuggestions[activeIndex]);
    }
  }

  return (
    <div
      className="place-autocomplete"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <input
        aria-autocomplete="list"
        aria-controls={`${id}-options`}
        aria-expanded={showSuggestions}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          setIsOpen(Boolean(event.target.value.trim()));
        }}
        onFocus={() => setIsOpen(Boolean(value.trim()))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        required={required}
      />
      {showSuggestions && (
        <div className="place-autocomplete-options" id={`${id}-options`} role="listbox">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              key={suggestion}
              onClick={() => selectSuggestion(suggestion)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              tabIndex={-1}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function sumInstallmentExpenses(expenses) {
  return expenses
    .filter((expense) => getInstallmentInfo(expense))
    .reduce((sum, expense) => roundMoney(sum + Number(expense.totalValue || 0)), 0);
}

function ManagePanel({ allExpenses = [], expenses, selectedMonth, onEdit, onDelete, dataLoading }) {
  const [manageView, setManageView] = useState("month");
  const expenseSource = allExpenses.length ? allExpenses : expenses;
  const monthlyInstallmentKeys = useMemo(() => {
    return new Set(
      expenses
        .map((expense) => {
          const installmentInfo = getInstallmentInfo(expense);
          return installmentInfo ? getInstallmentSeriesKey(expense, installmentInfo) : "";
        })
        .filter(Boolean),
    );
  }, [expenses]);
  const installmentSummaries = useMemo(
    () => getInstallmentSeriesSummaries(expenseSource)
      .filter((item) => monthlyInstallmentKeys.has(item.key)),
    [expenseSource, monthlyInstallmentKeys],
  );
  const activeInstallments = installmentSummaries.filter((item) => !item.completed);
  const finishedInstallments = installmentSummaries
    .filter((item) => item.completed)
    .sort((a, b) => (b.finalizedDate || b.finalDueDate || "").localeCompare(a.finalizedDate || a.finalDueDate || ""));
  const installmentSummaryTotals = useMemo(() => {
    const nextMonth = shiftMonth(selectedMonth, 1);

    return {
      currentMonth: sumInstallmentExpenses(getExpensesForMonth(expenseSource, selectedMonth)),
      nextMonth: sumInstallmentExpenses(getExpensesForMonth(expenseSource, nextMonth)),
      nextMonthKey: nextMonth,
      remaining: installmentSummaries.reduce(
        (sum, installment) => roundMoney(sum + Number(installment.remainingValue || 0)),
        0,
      ),
    };
  }, [expenseSource, installmentSummaries, selectedMonth]);
  const fixedExpenseGroups = useMemo(
    () => getFixedExpenseMonthGroups(expenses),
    [expenses],
  );
  const fixedExpensesCount = fixedExpenseGroups.reduce((sum, group) => sum + group.expenses.length, 0);
  const singleExpenses = useMemo(
    () => expenses.filter((expense) => getExpenseKind(expense) === "normal"),
    [expenses],
  );
  const listedExpenses = manageView === "single" ? singleExpenses : expenses;

  const viewTitle = {
    month: "Contas do Mês",
    single: "Contas Únicas",
    installments: "Contas Parceladas",
    fixed: "Contas Fixas",
  }[manageView];
  const viewCount = {
    month: `${expenses.length} registro(s)`,
    single: `${singleExpenses.length} conta(s) única(s)`,
    installments: `${installmentSummaries.length} parcelamento(s)`,
    fixed: `${fixedExpensesCount} conta(s) fixa(s)`,
  }[manageView];

  return (
    <section className="panel">
      <div className="section-heading manage-heading">
        <div>
          <h2>{viewTitle}</h2>
          <span>{viewCount}</span>
        </div>
        <div className="manage-actions">
          <button
            aria-pressed={manageView === "month"}
            className={manageView === "month" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("month")}
            type="button"
          >
            Contas ({expenses.length})
          </button>
          <button
            aria-pressed={manageView === "single"}
            className={manageView === "single" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("single")}
            type="button"
          >
            Contas Únicas ({singleExpenses.length})
          </button>
          <button
            aria-pressed={manageView === "installments"}
            className={manageView === "installments" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("installments")}
            type="button"
          >
            Contas Parceladas ({installmentSummaries.length})
          </button>
          <button
            aria-pressed={manageView === "fixed"}
            className={manageView === "fixed" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("fixed")}
            type="button"
          >
            Contas Fixas ({fixedExpensesCount})
          </button>
        </div>
      </div>

      {dataLoading ? (
        <div className="empty-state">Carregando...</div>
      ) : manageView === "installments" ? (
        <InstallmentSeriesView
          activeInstallments={activeInstallments}
          finishedInstallments={finishedInstallments}
          selectedMonth={selectedMonth}
          summaryTotals={installmentSummaryTotals}
        />
      ) : manageView === "fixed" ? (
        <FixedExpensesView groups={fixedExpenseGroups} selectedMonth={selectedMonth} />
      ) : !listedExpenses.length ? (
        <div className="empty-state">
          {manageView === "single" ? "Nenhuma conta única cadastrada neste mês." : "Nenhuma conta cadastrada neste mês."}
        </div>
      ) : (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Despesa</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Categoria</th>
              <th>Quem pagou</th>
              <th>Rateio</th>
              <th style={{ textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {listedExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong>{expense.title}</strong>
                    {expense.installment && (
                      <small style={{ display: "block", marginTop: "4px" }}>
                        {formatInstallmentLabel(expense.installment)}
                      </small>
                    )}
                  </div>
                </td>
                <td>{formatCurrency(expense.totalValue)}</td>
                <td>{formatDate(expense.dueDate)}</td>
                <td>
                  <span className="tag">{expense.category}</span>
                </td>
                <td>{personName(expense.payerId)}</td>
                <td>{expense.participants?.map(personName).join(", ")}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      className="icon-button"
                      onClick={() => onEdit(expense)}
                      title="Editar despesa"
                      type="button"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      style={{ color: "var(--danger)" }}
                      onClick={() => onDelete(expense)}
                      title={
                        getInstallmentInfo(expense)
                          ? "Excluir esta parcela e as seguintes"
                          : isFixedExpense(expense)
                            ? "Excluir esta conta fixa e os meses seguintes"
                            : "Excluir despesa"
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

function InstallmentSeriesView({ activeInstallments, finishedInstallments, selectedMonth, summaryTotals }) {
  const installments = [...activeInstallments, ...finishedInstallments];

  if (!activeInstallments.length && !finishedInstallments.length) {
    return <div className="empty-state">Nenhuma conta parcelada cadastrada.</div>;
  }

  return (
    <div className="installment-series-view">
      <div className="installment-summary-grid">
        <article className="installment-summary-card monthly">
          <span>Total parcelado no mês</span>
          <strong>{formatCurrency(summaryTotals.currentMonth)}</strong>
          <small>{formatMonthLabel(selectedMonth)}</small>
        </article>
        <article className="installment-summary-card next-month">
          <span>Total parcelado próximo mês</span>
          <strong>{formatCurrency(summaryTotals.nextMonth)}</strong>
          <small>{formatMonthLabel(summaryTotals.nextMonthKey)}</small>
        </article>
        <article className="installment-summary-card remaining">
          <span>Total falta pagar</span>
          <strong>{formatCurrency(summaryTotals.remaining)}</strong>
          <small>A partir de {formatMonthLabel(selectedMonth)}</small>
        </article>
      </div>

      <InstallmentSeriesGroup
        installments={activeInstallments}
        title="Parceladas ativas"
        emptyText="Nenhuma conta parcelada ativa."
      />
      <InstallmentSeriesGroup
        installments={finishedInstallments}
        title="Parceladas finalizadas"
        emptyText="Nenhuma conta parcelada finalizada."
      />
    </div>
  );
}

function InstallmentSeriesGroup({ emptyText, installments, title }) {
  return (
    <section className="installment-series-group">
      <div className="installment-series-heading">
        <h3>{title}</h3>
        <span>{installments.length} parcelamento(s)</span>
      </div>

      {!installments.length ? (
        <div className="empty-state compact">{emptyText}</div>
      ) : (
        <div className="installment-series-grid">
          {installments.map((installment) => (
            <article className="installment-series-card" key={installment.key}>
              <div className="installment-series-card-header">
                <div>
                  <strong>{installment.title}</strong>
                  <small>
                    {installment.category} • {personName(installment.payerId)}
                  </small>
                </div>
                <span className={installment.completed ? "tag success-tag" : "tag warning-tag"}>
                  {installment.completed ? "Finalizada" : "Ativa"}
                </span>
              </div>

              <div className="installment-series-money">
                <div className="installment-value installment-value-partial">
                  <span>Valor da parcela</span>
                  <strong>{formatCurrency(installment.installmentValue)}</strong>
                </div>
                <div className="installment-value installment-value-total">
                  <span>Total parcelado</span>
                  <strong>{formatCurrency(installment.totalValue)}</strong>
                </div>
                <div className="installment-value installment-value-paid">
                  <span>Já pago</span>
                  <strong>{formatCurrency(installment.paidValue)}</strong>
                </div>
                <div className="installment-value installment-value-remaining">
                  <span>Falta pagar</span>
                  <strong>{formatCurrency(installment.remainingValue)}</strong>
                </div>
              </div>

              <div className="installment-series-details">
                <span>
                  Parcelas: {installment.paidInstallments}/{installment.total}
                </span>
                <span>Faltam: {installment.remainingInstallments} parcela(s)</span>
                <span>Período: {formatInstallmentPeriod(installment)}</span>
                <span>Última parcela: {formatDateMonth(installment.finalDueDate)}</span>
                {installment.completed && (
                  <span>Finalizada em: {formatDateMonth(installment.finalizedDate)}</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FixedExpensesView({ groups, selectedMonth }) {
  if (!groups.length) {
    return <div className="empty-state">Nenhuma conta fixa em {formatMonthLabel(selectedMonth)}.</div>;
  }

  return (
    <div className="fixed-expenses-view">
      {groups.map((group) => (
        <section className="fixed-expense-month" key={group.monthKey}>
          <div className="fixed-expense-month-header">
            <div>
              <h3>{formatMonthLabel(group.monthKey)}</h3>
              <span>{group.expenses.length} conta(s) fixa(s)</span>
            </div>
            <strong>{formatCurrency(group.total)}</strong>
          </div>

          <div className="fixed-expense-list">
            {group.expenses.map((expense) => (
              <article className="fixed-expense-row" key={expense.id}>
                <div>
                  <strong>{expense.title}</strong>
                  <small>
                    {expense.category} • {personName(expense.payerId)} • Vencimento {formatDate(expense.dueDate)}
                  </small>
                </div>
                <span>{formatCurrency(expense.totalValue)}</span>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EditResourceItemModal({ item, placeSuggestions, onClose, onSave }) {
  const isMarket = item.kind === "market";
  const [form, setForm] = useState({
    market: item.market || "",
    place: item.place || "",
    product: item.product || "",
    description: item.description || "",
    paymentMethod: item.paymentMethod || "Cartão",
    quantity: item.quantity || "1",
    unitValue: item.unitValue || "",
    purchasedAt: item.purchasedAt || "",
    paidAt: item.paidAt || "",
  });
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await onSave(item, form);
    } catch (saveError) {
      setError(saveError.message || "Não foi possível atualizar o lançamento.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="resource-edit-title">
        <div className="section-heading">
          <div>
            <h2 id="resource-edit-title">Editar {isMarket ? "item de mercado" : "pagamento"}</h2>
            <span>Altere os dados do lançamento</span>
          </div>
          <button className="icon-button" onClick={onClose} type="button" title="Fechar">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              <span>{isMarket ? "Mercado" : "Local"}</span>
              {isMarket ? (
                <input value={form.market} onChange={(event) => updateField("market", event.target.value)} required />
              ) : (
                <PlaceAutocomplete
                  id="edit-other-payment-place"
                  value={form.place}
                  suggestions={placeSuggestions}
                  onChange={(value) => updateField("place", value)}
                  required
                />
              )}
            </label>
            <label>
              <span>Data</span>
              <input
                type="date"
                value={isMarket ? form.purchasedAt : form.paidAt}
                onChange={(event) => updateField(isMarket ? "purchasedAt" : "paidAt", event.target.value)}
                required
              />
            </label>
            <label>
              <span>Produto</span>
              <input value={form.product} onChange={(event) => updateField("product", event.target.value)} required />
            </label>
            {isMarket ? (
              <label>
                <span>Descrição</span>
                <input value={form.description} onChange={(event) => updateField("description", event.target.value)} />
              </label>
            ) : (
              <label>
                <span>Pagamento</span>
                <select value={form.paymentMethod} onChange={(event) => updateField("paymentMethod", event.target.value)}>
                  {PAYMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>Quantidade</span>
              <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => updateField("quantity", event.target.value)} required />
            </label>
            <label>
              <span>Valor unitário (€)</span>
              <input type="number" min="0.01" step="0.01" value={form.unitValue} onChange={(event) => updateField("unitValue", event.target.value)} required />
            </label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
            <button className="primary-button" type="submit"><Check size={18} /> Salvar alterações</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function EditExpenseModal({ expense, onClose, onSave }) {
  const [title, setTitle] = useState(expense.title);
  const [totalValue, setTotalValue] = useState(expense.totalValue);
  const [dueDate, setDueDate] = useState(expense.dueDate || "");
  const [category, setCategory] = useState(expense.category);
  const [payerId, setPayerId] = useState(expense.payerId);
  const [participants, setParticipants] = useState(expense.participants || []);
  const [error, setError] = useState("");

  const match = expense.installment ? expense.installment.match(/Parcela (\d+) de (\d+)/) : null;
  const isInstallment = !!match;
  const isFixed = isFixedExpense(expense);
  const [currentInstallment, setCurrentInstallment] = useState(match ? Number(match[1]) : 1);
  const [totalInstallments, setTotalInstallments] = useState(match ? Number(match[2]) : 1);

  const splitPreview = useMemo(() => {
    const val = roundMoney(Number(String(totalValue).replace(",", ".")));
    if (!val || !participants.length) return 0;
    return roundMoney(val / participants.length);
  }, [totalValue, participants]);

  function toggleParticipant(personId) {
    setParticipants((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (isInstallment) {
      if (totalInstallments < 1 || !Number.isInteger(totalInstallments)) {
        setError("O total de parcelas deve ser um número inteiro maior ou igual a 1.");
        return;
      }
      if (currentInstallment < 1 || !Number.isInteger(currentInstallment)) {
        setError("A parcela atual deve ser um número inteiro maior ou igual a 1.");
        return;
      }
      if (currentInstallment > totalInstallments) {
        setError("A parcela atual não pode ser maior que o total de parcelas.");
        return;
      }
    }

    try {
      await onSave(expense.id, {
        title,
        totalValue,
        dueDate,
        category,
        payerId,
        participants,
        installment: isInstallment ? `Parcela ${currentInstallment} de ${totalInstallments}` : null,
      });
    } catch (err) {
      setError(err.message || "Erro ao salvar despesa.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" style={{ maxWidth: "600px" }} role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="section-heading">
          <div>
            <h2 id="edit-title">Editar despesa</h2>
            <span>
              {isInstallment
                ? "As alterações serão aplicadas a esta parcela e às seguintes"
                : isFixed
                  ? "As alterações serão aplicadas a este mês e aos seguintes"
                  : "Ajuste os detalhes e o rateio"}
            </span>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label>
              <span>Nome da despesa</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
          </div>

          {isInstallment && (
            <div className="form-grid">
              <label>
                <span>Parcela atual</span>
                <input
                  type="number"
                  min="1"
                  max={totalInstallments}
                  value={currentInstallment}
                  onChange={(e) => setCurrentInstallment(Number(e.target.value))}
                  required
                />
              </label>

              <label>
                <span>Total de parcelas</span>
                <input
                  type="number"
                  min="1"
                  value={totalInstallments}
                  onChange={(e) => setTotalInstallments(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                />
              </label>
            </div>
          )}

          <div className="form-grid">
            <label>
              <span>Valor em euros</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Data de vencimento</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Categoria</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((cat) => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Quem pagou originalmente?</span>
              <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                {PEOPLE.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="people-fieldset">
            <legend>Quem participa do rateio?</legend>
            <div className="checkbox-grid">
              {PEOPLE.map((person) => (
                <label className="checkbox-card" key={person.id}>
                  <input
                    checked={participants.includes(person.id)}
                    onChange={() => toggleParticipant(person.id)}
                    type="checkbox"
                  />
                  <span>{person.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="split-preview">
            <span>Novo valor por pessoa</span>
            <strong>{formatCurrency(splitPreview)}</strong>
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button" type="submit">
              <Check size={18} />
              Salvar Alterações
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default App;

