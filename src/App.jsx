import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Home,
  LogOut,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  SlidersHorizontal,
  Trash2,
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
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, db, googleProvider, hasFirebaseConfig } from "./services/firebase";
import { CATEGORIES, PAYMENT_TYPES, PEOPLE, getPersonById, getProfileByEmail } from "./config/people";

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

const navItems = [
  { id: "dashboard", label: "Painel", icon: BarChart3 },
  { id: "new", label: "Nova conta", icon: Plus },
  ...PEOPLE.map((person) => ({ id: person.id, label: person.name, icon: UserRound })),
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

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function monthFromDate(date) {
  return date.slice(0, 7);
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
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return `${capitalizeFirst(monthLabel)} ${year}`;
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

function getPersonInitials(person) {
  const name = person?.name || "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";

  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

function getPersonPhotoUrl(person, firebaseUser) {
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

function getInstallmentSeriesKey(expense, installmentInfo) {
  return [
    (expense.title || "").trim().toLowerCase(),
    expense.payerId || "",
    String(installmentInfo.total),
    String(expense.totalValue || ""),
    (expense.participants || []).slice().sort().join(","),
  ].join("|");
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
  const canManageData = isAdminProfile(profile);

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

      setProfile(matchedProfile);
      setActiveView(matchedProfile.id);
      setAuthLoading(false);
    });
  }, []);

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
    if (activeView !== profile.id) setActiveView(profile.id);
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
      runs = totalInstallments - currentInstallment + 1;
      valuePerMonth = rawValue;
    } else if (type === "recurring") {
      runs = 12;
      valuePerMonth = rawValue;
    }

    const batch = writeBatch(db);
    const finalInstallmentDueDate = type === "installment" ? addMonths(computedDueDate, runs - 1) : "";

    for (let index = 0; index < runs; index += 1) {
      const currentDueDate = addMonths(computedDueDate, index);
      const currentExpenseDate = type === "normal" ? form.expenseDate || "" : "";
      const currentMonthKey = getExpenseMonthKey({
        dueDate: currentDueDate,
        expenseDate: currentExpenseDate,
        type,
      });
      
      const shareAmount = roundMoney(valuePerMonth / form.participants.length);
      const shares = form.participants.reduce((acc, personId) => {
        acc[personId] = {
          amount: shareAmount,
          status: personId === form.payerId ? "self" : "pending",
          payment: personId === form.payerId ? { type: "Pago", paidAt: currentDueDate } : null,
        };
        return acc;
      }, {});

      let label = "";
      if (type === "installment") {
        label = `Parcela ${currentInstallment + index} de ${totalInstallments}`;
      } else if (type === "recurring") {
        label = "Fixo";
      }
      const installmentMeta =
        type === "installment"
          ? {
              current: currentInstallment + index,
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

  function queueSettlementShareUpdates(batch, row, { isSettled, paidAt, paymentType, now }) {
    expenses.forEach((expense) => {
      const updates = {};
      const directShare = getShare(expense, row.fromId);
      const reverseShare = getShare(expense, row.toId);

      if (expense.payerId === row.toId && ["pending", "settled"].includes(directShare?.status)) {
        updates[`shares.${row.fromId}.status`] = isSettled ? "settled" : "pending";
        updates[`shares.${row.fromId}.payment`] = isSettled
          ? {
              paidAt,
              type: paymentType,
              description: `Liquidado no acerto mensal de ${selectedMonth}`,
              registeredBy: profile.id,
              registeredAt: now,
            }
          : null;
      }

      if (expense.payerId === row.fromId && ["pending", "settled"].includes(reverseShare?.status)) {
        updates[`shares.${row.toId}.status`] = isSettled ? "settled" : "pending";
        updates[`shares.${row.toId}.payment`] = isSettled
          ? {
              paidAt,
              type: "Compensacao",
              description: `Compensado no acerto mensal de ${selectedMonth}`,
              registeredBy: profile.id,
              registeredAt: now,
            }
          : null;
      }

      if (Object.keys(updates).length) {
        batch.update(doc(db, "expenses", expense.id), {
          ...updates,
          updatedAt: serverTimestamp(),
        });
      }
    });
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
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const settlementRef = doc(collection(db, "settlements"));

    if (isFullPayment) {
      expenses.forEach((expense) => {
        const updates = {};
        const directShare = getShare(expense, row.fromId);
        const reverseShare = getShare(expense, row.toId);

        if (expense.payerId === row.toId && directShare?.status === "pending") {
          updates[`shares.${row.fromId}.status`] = "settled";
          updates[`shares.${row.fromId}.payment`] = {
            paidAt,
            type: paymentType,
            description: `Liquidado no acerto mensal de ${selectedMonth}`,
            registeredBy: profile.id,
            registeredAt: now,
          };
        }

        if (expense.payerId === row.fromId && reverseShare?.status === "pending") {
          updates[`shares.${row.toId}.status`] = "settled";
          updates[`shares.${row.toId}.payment`] = {
            paidAt,
            type: "Compensação",
            description: `Compensado no acerto mensal de ${selectedMonth}`,
            registeredBy: profile.id,
            registeredAt: now,
          };
        }

        if (Object.keys(updates).length) {
          batch.update(doc(db, "expenses", expense.id), {
            ...updates,
            updatedAt: serverTimestamp(),
          });
        }
      });
    }

    batch.set(settlementRef, {
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
      createdBy: profile.id,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    setActionMessage(isFullPayment ? "Dívida quitada com sucesso." : "Pagamento parcial registrado.");
    return true;
  }

  async function updateSettlementPayment(payment, paymentData) {
    if (!ensureCanManageData()) return false;

    const rawAmount = Number(String(paymentData.amount).replace(",", "."));
    if (isNaN(rawAmount) || rawAmount <= 0) {
      setActionMessage("Informe um valor de pagamento valido.");
      return false;
    }

    const paymentAmount = roundMoney(rawAmount);
    const balanceBeforePayment = Number(payment.balanceBeforePayment || payment.amount || 0);
    if (balanceBeforePayment > 0 && paymentAmount > balanceBeforePayment) {
      setActionMessage(`O valor nao pode passar de ${formatCurrency(balanceBeforePayment)}.`);
      return false;
    }

    const paidAt = paymentData.paidAt || todayInputValue();
    const paymentType = paymentData.type || "PIX";
    const description = paymentData.description?.trim() || "";

    const isSettled = balanceBeforePayment > 0 && paymentAmount >= balanceBeforePayment;
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    if (payment.status === "settled" || isSettled) {
      queueSettlementShareUpdates(batch, payment, {
        isSettled,
        paidAt,
        paymentType,
        now,
      });
    }

    batch.update(doc(db, "settlements", payment.id), {
      amount: paymentAmount,
      paidAt,
      type: paymentType,
      description,
      status: isSettled ? "settled" : "partial",
      balanceAfterPayment: balanceBeforePayment > 0 ? roundMoney(balanceBeforePayment - paymentAmount) : 0,
      updatedAt: serverTimestamp(),
      updatedBy: profile.id,
    });

    await batch.commit();

    setActionMessage("Pagamento de acerto atualizado.");
    return true;
  }

  async function deleteSettlementPayment(payment) {
    if (!ensureCanManageData()) return;
    if (!window.confirm("Tem certeza que deseja apagar este pagamento do historico?")) return;

    const batch = writeBatch(db);
    if (payment.status === "settled") {
      queueSettlementShareUpdates(batch, payment, {
        isSettled: false,
        paidAt: payment.paidAt || todayInputValue(),
        paymentType: payment.type || "PIX",
        now: new Date().toISOString(),
      });
    }

    batch.delete(doc(db, "settlements", payment.id));
    await batch.commit();
    setActionMessage("Pagamento de acerto apagado.");
  }

  async function handleDeleteExpense(expenseId) {
    if (!ensureCanManageData()) return;
    if (!window.confirm("Tem certeza que deseja excluir esta conta?")) return;
    try {
      await deleteDoc(doc(db, "expenses", expenseId));
      setActionMessage("Conta excluída com sucesso.");
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

    const shareAmount = roundMoney(rawValue / updatedData.participants.length);
    const oldExpense = expenses.find((e) => e.id === expenseId);
    const oldShares = oldExpense?.shares || {};

    const shares = updatedData.participants.reduce((acc, personId) => {
      const oldShare = oldShares[personId];
      const wasPayer = personId === updatedData.payerId;

      if (wasPayer) {
        acc[personId] = {
          amount: shareAmount,
          status: "self",
          payment: { type: "Pago", paidAt: updatedData.dueDate },
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
    : navItems.filter((item) => item.id === profile.id);
  const visiblePeople = canManageData
    ? PEOPLE
    : PEOPLE.filter((person) => person.id === profile.id);

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
            <div>
              <strong>Contas</strong>
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
              <small>{firebaseUser?.email}</small>
            </div>
          </div>
          <button className="icon-button" onClick={handleLogout} title="Sair" type="button">
            <LogOut size={18} />
          </button>
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
          </header>

        {actionMessage && <div className="notice">{actionMessage}</div>}

        {activeView === "dashboard" && (
          <Dashboard
            breakdown={dashboardBreakdown}
            categoryTotals={categoryTotals}
            dataLoading={dataLoading}
            expenses={expenses}
            metrics={metrics}
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

        {PEOPLE.some((person) => person.id === activeView) && (
          <PersonExpenses
            expenses={expenses}
            firebaseUser={firebaseUser}
            personId={activeView}
            settlementRows={settlementRows}
            selectedMonth={selectedMonth}
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

function Dashboard({ breakdown, categoryTotals, dataLoading, expenses, metrics }) {
  const normal = breakdown.rows.find((item) => item.id === "normal") || { total: 0, count: 0 };
  const fixed = breakdown.rows.find((item) => item.id === "fixed") || { total: 0, count: 0 };
  const installment = breakdown.rows.find((item) => item.id === "installment") || { total: 0, count: 0 };

  return (
    <div className="view-grid">
      <section className="metrics-grid dashboard-metrics">
        <MetricCard icon={ReceiptText} label="Gastos do mês" value={formatCurrency(breakdown.total)} />
        <MetricCard icon={CircleDollarSign} label="Contas normais" value={formatCurrency(normal.total)} detail={`${normal.count} registro(s)`} />
        <MetricCard icon={Home} label="Contas fixas" value={formatCurrency(fixed.total)} detail={`${fixed.count} registro(s)`} tone="success" />
        <MetricCard icon={WalletCards} label="Contas parceladas" value={formatCurrency(installment.total)} detail={`${installment.count} registro(s)`} tone="warning" />
      </section>

      <div className="dashboard-main-content">
        <section className="panel chart-panel">
          <div className="section-heading">
            <h2>Distribuição por tipo</h2>
            <span>{expenses.length} registro(s)</span>
          </div>

          {dataLoading ? (
            <div className="empty-state">Carregando...</div>
          ) : (
            <div className="type-chart">
              <div className="type-chart-total">
                <span>Total do mês</span>
                <strong>{formatCurrency(breakdown.total)}</strong>
              </div>

              <div className="type-chart-bars">
                {breakdown.rows.map((item) => (
                  <div className={`type-chart-row ${item.id}`} key={item.id}>
                    <div>
                      <span>{item.label}</span>
                      <small>{item.count} conta(s)</small>
                    </div>
                    <div className="type-chart-track">
                      <div className="type-chart-fill" style={{ width: `${item.barPercent}%` }} />
                    </div>
                    <strong>{formatCurrency(item.total)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel chart-panel">
          <div className="section-heading">
            <h2>Gastos por categoria</h2>
          </div>

          <div className="bar-chart">
            {categoryTotals.map((item) => (
              <div className="bar-row" key={item.category}>
                <span>{item.category}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${item.percent}%` }} />
                </div>
                <strong>{formatCurrency(item.total)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel dashboard-summary-panel">
          <div className="section-heading">
            <h2>Resumo das contas</h2>
            <span>{formatCurrency(breakdown.total)}</span>
          </div>

          <div className="dashboard-summary-grid">
            {breakdown.rows.map((item) => (
              <article className={`dashboard-summary-card ${item.id}`} key={item.id}>
                <span>{item.label}</span>
                <strong>{formatCurrency(item.total)}</strong>
                <small>{item.count} conta(s) • {item.percent.toFixed(1).replace(".", ",")}% do mês</small>
              </article>
            ))}
          </div>

          <div className="dashboard-rateio-grid">
            <div>
              <span>Rateio pendente</span>
              <strong>{formatCurrency(metrics.pending)}</strong>
            </div>
            <div>
              <span>Rateio pago/liquidado</span>
              <strong>{formatCurrency(metrics.paid)}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ detail, icon: Icon, label, tone = "default", value }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">
        <Icon size={22} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
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
                <span>Próximo vencimento</span>
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
                💡 <strong>Conta Parcelada:</strong> Cada parcela tem o valor de <strong>{formatCurrency(form.totalValue)}</strong> (totalizando <strong>{formatCurrency(Number(form.totalValue) * form.installmentsCount)}</strong> para a compra inteira de <strong>{form.installmentsCount} parcelas</strong>). Serão cadastradas <strong>{Number(form.installmentsCount) - (Number(form.currentInstallment) || 1) + 1} parcelas</strong> (da {form.currentInstallment}ª até a {form.installmentsCount}ª) a partir do mês selecionado.
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

function PersonExpenses({ expenses, firebaseUser, personId, selectedMonth, onMonthChange, settlementRows = [] }) {
  const monthPickerRef = useRef(null);
  const personExpenses = expenses.filter((expense) => expense.participants?.includes(personId));
  const selectedPerson = getPersonById(personId);
  const selectedPersonPhotoUrl = getPersonPhotoUrl(selectedPerson, firebaseUser);
  const paymentSummary = useMemo(() => {
    let listPaidAmount = 0;
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

      if (isSettledStatus(share.status)) {
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
    totals.paidAmount = roundMoney(listPaidAmount);

    return { totalsByPayer, totals };
  }, [personExpenses, settlementRows, personId]);

  const formattedMonthName = useMemo(() => {
    if (!selectedMonth) return "";
    return formatMonthLabel(selectedMonth);
  }, [selectedMonth]);

  function handlePrevMonth() {
    onMonthChange(shiftMonth(selectedMonth, -1));
  }

  function handleNextMonth() {
    onMonthChange(shiftMonth(selectedMonth, 1));
  }

  function handleOpenMonthPicker(event) {
    event?.preventDefault();
    const picker = monthPickerRef.current;
    if (!picker) return;

    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        picker.focus();
        return;
      }
    }

    picker.focus();
  }

  return (
    <section className="panel">
      <div className="section-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2>Contas de {selectedPerson.name}</h2>
          <span>{personExpenses.length} registro(s)</span>
        </div>

        <div className="person-month-switcher">
          <button
            type="button"
            className="icon-button"
            onClick={handlePrevMonth}
            title="Mês Anterior"
          >
            <ChevronLeft size={18} />
          </button>
          
          <label className="person-month-picker" onClick={handleOpenMonthPicker} title="Escolher mes e ano">
            <span>{formattedMonthName}</span>
            <input
              ref={monthPickerRef}
              aria-label="Escolher mes e ano"
              type="month"
              value={selectedMonth}
              onChange={(event) => onMonthChange(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="icon-button"
            onClick={handleNextMonth}
            title="Próximo Mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="person-payment-summary">
        <div className="person-debt-grid">
          {paymentSummary.totalsByPayer.map(({
            person,
            originalAmount,
            paidAmount,
            abatedAmount,
            amount,
            receivableAmount,
          }) => {
            const photoUrl = getPersonPhotoUrl(person, firebaseUser);

            return (
              <div className="person-debt-card" key={person.id}>
                <div className="person-debt-person">
                  <PersonAvatar person={person} photoUrl={photoUrl} />
                  <div>
                    <span>Deve para</span>
                    <strong>{person.name}</strong>
                    <small>{person.email}</small>
                  </div>
                </div>
                <strong className="person-debt-amount money-negative">{formatSignedCurrency(amount, "negative")}</strong>
                <div className="person-debt-breakdown">
                  <small className="debt-total">Total da dívida: {formatSignedCurrency(originalAmount, "negative")}</small>
                  <small className="debt-paid">Pago: {formatCurrency(paidAmount)}</small>
                  <small className="debt-abated">Abatido: {formatCurrency(abatedAmount)}</small>
                  <small className="debt-receivable">A receber de {person.name}: {formatSignedCurrency(receivableAmount, "positive")}</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="person-total-card">
          <div className="person-summary-person">
            <PersonAvatar person={selectedPerson} photoUrl={selectedPersonPhotoUrl} size="large" />
            <div>
              <span>Resumo de</span>
              <strong>{selectedPerson.name}</strong>
              <small>{selectedPerson.email}</small>
            </div>
          </div>
          <span>Total a pagar no mês</span>
          <strong className="money-negative">{formatSignedCurrency(paymentSummary.totals.amount, "negative")}</strong>
          <div className="person-debt-breakdown">
            <small className="debt-total">Total original: {formatSignedCurrency(paymentSummary.totals.originalAmount, "negative")}</small>
            <small className="debt-paid">Total pago: {formatCurrency(paymentSummary.totals.paidAmount)}</small>
            <small className="debt-abated">Total abatido: {formatCurrency(paymentSummary.totals.abatedAmount)}</small>
          </div>
        </div>
      </div>

      {!personExpenses.length ? (
        <div className="empty-state">Nenhuma conta para este mês.</div>
      ) : (
        <div className="expense-list">
          {personExpenses.map((expense) => {
            const share = getShare(expense, personId);
            const isPayer = expense.payerId === personId;

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
                  <p>Pago: {personName(expense.payerId)}</p>
                  <p>Vencimento: {formatDate(expense.dueDate)}</p>
                </div>

                <div className="expense-side">
                  <strong className="money-negative">
                    {formatSignedCurrency(share?.amount, "negative")}
                  </strong>
                  <StatusBadge status={isPayer ? "self" : share?.status} />
                </div>
              </article>
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
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editingPaymentForm, setEditingPaymentForm] = useState({
    amount: "",
    paidAt: todayInputValue(),
    type: "PIX",
    description: "",
  });
  const paymentsByMonth = useMemo(() => {
    const grouped = settlementPayments.reduce((acc, payment) => {
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
  }, [settlementPayments]);

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
          <h2>Historico de pagamentos</h2>
          <span>{settlementPayments.length} pagamento(s)</span>
        </div>

        {!settlementPayments.length ? (
          <div className="empty-state settlement-history-empty">Nenhum pagamento registrado.</div>
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
                        <span>Descricao</span>
                        <input
                          value={editingPaymentForm.description}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Ex: transferencia recebida"
                        />
                      </label>

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
                          title="Apagar pagamento"
                          type="button"
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

function calculateSettlementRows(expenses, settlementPayments = []) {
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

          <div className="checkbox-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <button
              type="button"
              className={`checkbox-card ${theme === "light" ? "active" : ""}`}
              style={{
                cursor: "pointer",
                border: theme === "light" ? "2px solid var(--primary)" : "1px solid var(--line)",
                background: "var(--input-bg)",
                padding: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: theme === "light" ? "bold" : "normal"
              }}
              onClick={() => setTheme("light")}
            >
              <span style={{ color: "var(--text)" }}>☀️ Tema Claro</span>
              {theme === "light" && <Check size={18} style={{ color: "var(--primary)" }} />}
            </button>

            <button
              type="button"
              className={`checkbox-card ${theme === "dark" ? "active" : ""}`}
              style={{
                cursor: "pointer",
                border: theme === "dark" ? "2px solid var(--primary)" : "1px solid var(--line)",
                background: "var(--input-bg)",
                padding: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: theme === "dark" ? "bold" : "normal"
              }}
              onClick={() => setTheme("dark")}
            >
              <span style={{ color: "var(--text)" }}>🌙 Tema Escuro</span>
              {theme === "dark" && <Check size={18} style={{ color: "var(--primary)" }} />}
            </button>
          </div>
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

  const viewTitle = {
    month: "Contas do Mes",
    installments: "Contas Parceladas",
    fixed: "Contas Fixas",
  }[manageView];
  const viewCount = {
    month: `${expenses.length} registro(s)`,
    installments: `${installmentSummaries.length} parcelamento(s)`,
    fixed: `${fixedExpensesCount} conta(s) fixa(s)`,
  }[manageView];

  if (dataLoading) {
    return <div className="empty-state">Carregando...</div>;
  }

  if (!expenses.length && !installmentSummaries.length && !fixedExpensesCount) {
    return <div className="empty-state">Nenhuma conta cadastrada neste mês.</div>;
  }

  return (
    <section className="panel">
      <div className="section-heading manage-heading">
        <div>
          <h2>{viewTitle}</h2>
          <span>{viewCount}</span>
        </div>
        <div className="manage-actions">
          <button
            className={manageView === "installments" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView((current) => (current === "installments" ? "month" : "installments"))}
            type="button"
          >
            {manageView === "installments" ? "Ver contas do mes" : `Contas Parceladas (${installmentSummaries.length})`}
          </button>
          <button
            className={manageView === "fixed" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView((current) => (current === "fixed" ? "month" : "fixed"))}
            type="button"
          >
            {manageView === "fixed" ? "Ver contas do mes" : `Contas Fixas (${fixedExpensesCount})`}
          </button>
        </div>
      </div>

      {manageView === "installments" ? (
        <InstallmentSeriesView
          activeInstallments={activeInstallments}
          finishedInstallments={finishedInstallments}
          selectedMonth={selectedMonth}
          summaryTotals={installmentSummaryTotals}
        />
      ) : manageView === "fixed" ? (
        <FixedExpensesView groups={fixedExpenseGroups} selectedMonth={selectedMonth} />
      ) : !expenses.length ? (
        <div className="empty-state">Nenhuma conta cadastrada neste mes.</div>
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
                      onClick={() => onDelete(expense.id)}
                      title="Excluir despesa"
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
            <span>Ajuste os detalhes e o rateio</span>
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

