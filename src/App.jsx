import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  Home,
  LogOut,
  Menu,
  Plus,
  Settings,
  SlidersHorizontal,
  UserRound,
  WalletCards,
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
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, db, googleProvider, hasFirebaseConfig } from "./services/firebase";
import { commitFirestoreMutations } from "./services/firestoreMutations";
import { reportClientError } from "./services/observability";
import { PEOPLE, getProfileByEmail } from "./config/people";
import {
  emptyExpenseForm as emptyForm,
  emptyMarketForm,
  emptyOtherPaymentForm,
} from "./config/forms";
import { LoadingScreen, LoginScreen } from "./components/AuthScreens";
import { ConnectionStatus } from "./components/AppFeedback";
import { Dashboard } from "./components/Dashboard";
import {
  EditExpenseModal,
  EditResourceItemModal,
  ManagePanel,
} from "./components/ExpenseManagement";
import { ResourceMonthSwitcher } from "./components/MonthSwitcher";
import { NewExpenseForm } from "./components/NewExpenseForm";
import { OtherAccountsView } from "./components/OtherAccounts";
import { PersonExpenses } from "./components/PersonExpenses";
import { PaymentModal, SettlementPanel } from "./components/SettlementPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  calculateSettlementSummaries,
  collectPendingSettlementShares,
  getSettlementAccountingMonth,
  hasLaterSettlementPayment,
  resolveLegacyAffectedShares,
} from "./domain/settlements";
import { getAuthErrorMessage, getFirebaseActionError } from "./domain/errors";
import {
  calculateCategoryTotals,
  calculateDashboardBreakdown,
  calculateDashboardMetrics,
  calculateDashboardYearSummary,
} from "./domain/dashboard";
import {
  addMonths,
  filterExpensesForMonth,
  getExpenseDisplayMonthKey,
  getExpenseMonthKey,
  getExpensesForMonth,
  getInstallmentInfo,
  getInstallmentSeriesExpenses,
  getInstallmentSeriesMissingHistory,
  getMonthDistance,
  getNormalizedExpenses,
  isFixedExpense,
  isSameFixedSeries,
  isSameInstallmentSeries,
  isValidInstallmentExpense,
  monthFromDate,
  roundMoney,
} from "./domain/expenses";
import {
  currentMonthValue,
  formatCurrency,
  formatEmail,
  formatMonthLabel,
  getPlaceSuggestions,
  getSettlementPaymentMonthKey,
  getViewTitle,
  todayInputValue,
} from "./utils/presentation";
import packageInfo from "../package.json";

const appVersion = import.meta.env.VITE_APP_VERSION || packageInfo.version;

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

function getObservedActionError(error, action) {
  reportClientError(error, `firebase:${action}`);
  return getFirebaseActionError(error, action);
}

function getObservedAuthError(error) {
  reportClientError(error, "firebase:authentication");
  return getAuthErrorMessage(error);
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
  const [allExpenses, setAllExpenses] = useState([]);
  const [settlementPayments, setSettlementPayments] = useState([]);
  const [marketItems, setMarketItems] = useState([]);
  const [otherPayments, setOtherPayments] = useState([]);
  const [marketItemsLoading, setMarketItemsLoading] = useState(false);
  const [otherPaymentsLoading, setOtherPaymentsLoading] = useState(false);
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
  const menuToggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const viewTitleRef = useRef(null);
  const canManageData = isAdminProfile(profile);
  const otherPaymentPlaceSuggestions = useMemo(() => getPlaceSuggestions(otherPayments), [otherPayments]);

  useEffect(() => {
    if (!isDrawerOpen) return undefined;

    const animationFrame = window.requestAnimationFrame(() => {
      sidebarRef.current?.querySelector(".nav-item.active")?.focus();
    });
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setIsDrawerOpen(false);
      window.requestAnimationFrame(() => menuToggleRef.current?.focus());
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(
      auth,
      async (user) => {
        setFirebaseUser(user);

        if (!user) {
          setProfile(null);
          setActiveView("dashboard");
          setAllExpenses([]);
          setSettlementPayments([]);
          setMarketItems([]);
          setOtherPayments([]);
          setMarketItemsLoading(false);
          setOtherPaymentsLoading(false);
          setDataLoading(false);
          setUserProfiles({});
          setPaymentTarget(null);
          setEditingExpense(null);
          setEditingResourceItem(null);
          setActionMessage("");
          setAuthLoading(false);
          return;
        }

        setAuthError("");
        if (!user.emailVerified) {
          setProfile(null);
          setAuthError("Confirme o endereço de e-mail da conta Google antes de acessar o sistema.");
          try {
            await signOut(auth);
          } catch (error) {
            setAuthError(getObservedActionError(error, "encerrar a sessão não verificada"));
          } finally {
            setAuthLoading(false);
          }
          return;
        }

        const matchedProfile = getProfileByEmail(user.email);
        if (!matchedProfile) {
          setProfile(null);
          setAuthError(`A conta ${user.email} não tem acesso ao sistema. Entre com uma conta autorizada ou solicite a liberação.`);
          try {
            await signOut(auth);
          } catch (error) {
            setAuthError(getObservedActionError(error, "encerrar a sessão não autorizada"));
          } finally {
            setAuthLoading(false);
          }
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
          } catch (error) {
            setActionMessage(getObservedActionError(error, "atualizar o perfil do usuário"));
          }
        }

        setProfile(matchedProfile);
        setActiveView(matchedProfile.id);
        setAuthLoading(false);
      },
      (error) => {
        setProfile(null);
        setAuthError(getObservedAuthError(error));
        setAuthLoading(false);
      },
    );
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
      (error) => setActionMessage(getObservedActionError(error, "carregar os perfis dos usuários")),
    );
  }, [profile]);

  useEffect(() => {
    if (!profile || !db || !canManageData || activeView !== "other-accounts") return undefined;

    setMarketItemsLoading(true);
    return onSnapshot(
      collection(db, "marketItems"),
      (snapshot) => {
        setMarketItems(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.purchasedAt || "").localeCompare(a.purchasedAt || "")),
        );
        setMarketItemsLoading(false);
      },
      (error) => {
        setMarketItemsLoading(false);
        setActionMessage(getObservedActionError(error, "carregar os itens de mercado"));
      },
    );
  }, [activeView, canManageData, profile]);

  useEffect(() => {
    if (!profile || !db || !canManageData || activeView !== "other-accounts") return undefined;

    setOtherPaymentsLoading(true);
    return onSnapshot(
      collection(db, "otherPayments"),
      (snapshot) => {
        setOtherPayments(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || "")),
        );
        setOtherPaymentsLoading(false);
      },
      (error) => {
        setOtherPaymentsLoading(false);
        setActionMessage(getObservedActionError(error, "carregar os outros pagamentos"));
      },
    );
  }, [activeView, canManageData, profile]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    setDataLoading(true);
    const expensesQuery = query(collection(db, "expenses"));

    return onSnapshot(
      expensesQuery,
      (snapshot) => {
        const nextExpenses = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter(isValidInstallmentExpense)
          .sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));

        setAllExpenses(nextExpenses);
        setDataLoading(false);
      },
      (error) => {
        setDataLoading(false);
        setActionMessage(getObservedActionError(error, "carregar o histórico de contas"));
      },
    );
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
        setActionMessage(getObservedActionError(error, "recuperar as parcelas anteriores"));
      } finally {
        installmentHistoryRepairInProgress.current = false;
      }
    }

    repairInstallmentHistory();
  }, [allExpenses, canManageData, profile]);

  useEffect(() => {
    if (!profile || !db) return undefined;

    const settlementsQuery = query(collection(db, "settlements"));

    return onSnapshot(
      settlementsQuery,
      (snapshot) => {
        const nextPayments = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.kind === "payment")
          .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));

        setSettlementPayments(nextPayments);
      },
      (error) => setActionMessage(getObservedActionError(error, "carregar os pagamentos de acerto")),
    );
  }, [profile]);

  const normalizedExpenses = useMemo(
    () => getNormalizedExpenses(allExpenses),
    [allExpenses],
  );

  const expenses = useMemo(
    () => filterExpensesForMonth(normalizedExpenses, selectedMonth),
    [normalizedExpenses, selectedMonth],
  );

  const metrics = useMemo(() => calculateDashboardMetrics(expenses), [expenses]);
  const categoryTotals = useMemo(() => calculateCategoryTotals(expenses), [expenses]);
  const dashboardBreakdown = useMemo(() => calculateDashboardBreakdown(expenses), [expenses]);
  const dashboardYearSummary = useMemo(
    () => calculateDashboardYearSummary(normalizedExpenses, selectedMonth),
    [normalizedExpenses, selectedMonth],
  );

  const selectedMonthSettlementPayments = useMemo(
    () => settlementPayments.filter((payment) => getSettlementPaymentMonthKey(payment) === selectedMonth),
    [selectedMonth, settlementPayments],
  );

  const settlementSummaries = useMemo(
    () => calculateSettlementSummaries(expenses, selectedMonthSettlementPayments),
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
      setAuthError(getObservedAuthError(error));
    }
  }

  async function handleLogout() {
    setAuthError("");
    try {
      await signOut(auth);
    } catch (error) {
      setActionMessage(getObservedActionError(error, "encerrar a sessão"));
    }
  }

  function ensureCanManageData() {
    if (canManageData) return true;
    setActionMessage("Seu acesso é somente leitura. Esta conta não pode alterar dados.");
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
      setMarketFormError(getObservedActionError(error, "salvar o item"));
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
      throw new Error(getObservedActionError(error, "salvar os itens da nota"));
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
      setOtherPaymentFormError(getObservedActionError(error, "salvar o pagamento"));
    }
  }

  async function handleDeleteResourceItem(collectionName, itemId, label) {
    if (!ensureCanManageData()) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${label}?`)) return;
    try {
      await deleteDoc(doc(db, collectionName, itemId));
      setActionMessage(`${label.charAt(0).toUpperCase()}${label.slice(1)} excluído com sucesso.`);
    } catch (error) {
      setActionMessage(getObservedActionError(error, "excluir o lançamento"));
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
      setActionMessage(getObservedActionError(error, "apagar a lista do mês"));
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

    try {
      await updateDoc(doc(db, collectionName, item.id), fields);
      setSelectedMonth(monthFromDate(date));
      setEditingResourceItem(null);
      setActionMessage("Lançamento atualizado com sucesso.");
    } catch (error) {
      throw new Error(getObservedActionError(error, "atualizar o lançamento"));
    }
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

    try {
      await batch.commit();
    } catch (error) {
      setFormError(getObservedActionError(error, "cadastrar a conta"));
      return;
    }

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
    if (personId !== profile.id) {
      setActionMessage("Só é possível registrar o pagamento do próprio perfil.");
      return;
    }

    try {
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
    } catch (error) {
      setActionMessage(getObservedActionError(error, "registrar o pagamento"));
    }
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
      setActionMessage(getObservedActionError(error, "registrar o pagamento de acerto"));
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
      setActionMessage(getObservedActionError(error, "atualizar o pagamento de acerto"));
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
      setActionMessage(getObservedActionError(error, "apagar o pagamento de acerto"));
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
      ? "Tem certeza que deseja excluir toda esta conta parcelada, incluindo as parcelas dos meses anteriores e seguintes?"
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

      const deletionTargets = getInstallmentSeriesExpenses(persistedExpenses, referenceExpense);

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
      setActionMessage(getObservedActionError(error, "excluir a conta"));
    }
  }

  async function handleUpdateExpense(expenseId, updatedData) {
    if (!canManageData) {
      throw new Error("Seu acesso é somente leitura. Esta conta não pode alterar dados.");
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

  function navigateToView(viewId) {
    setActiveView(viewId);
    setIsDrawerOpen(false);
    window.requestAnimationFrame(() => viewTitleRef.current?.focus());
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
      <div className="app-shell">
        {isDrawerOpen && (
          <div
            aria-hidden="true"
            className="drawer-backdrop"
            onClick={() => setIsDrawerOpen(false)}
          />
        )}

      <aside
        aria-label="Menu lateral"
        className={`sidebar ${isDrawerOpen ? "open" : ""}`}
        id="primary-navigation"
        ref={sidebarRef}
      >
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">
              <Home aria-hidden="true" size={24} />
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
                aria-current={activeView === item.id ? "page" : undefined}
                className={activeView === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => navigateToView(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
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
            <button aria-label="Sair" className="icon-button" onClick={handleLogout} title="Sair" type="button">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="content-wrapper">
        <header className="mobile-header">
          <button
            aria-controls="primary-navigation"
            aria-expanded={isDrawerOpen}
            aria-label="Abrir menu principal"
            className="icon-button menu-toggle"
            onClick={() => setIsDrawerOpen(true)}
            ref={menuToggleRef}
            type="button"
          >
            <Menu aria-hidden="true" size={22} />
          </button>
          <div className="mobile-user-tabs">
            {visiblePeople.map((person) => (
              <button
                aria-pressed={activeView === person.id}
                key={person.id}
                className={`mobile-user-tab ${activeView === person.id ? "active" : ""}`}
                onClick={() => navigateToView(person.id)}
                type="button"
              >
                {person.name}
              </button>
            ))}
          </div>
        </header>

        <main
          aria-busy={dataLoading}
          className="content"
          id="main-content"
          tabIndex={-1}
        >
          <header className="topbar">
            <div>
              <span className="eyebrow">{selectedMonth}</span>
              <h1 ref={viewTitleRef} tabIndex={-1}>{getViewTitle(activeView)}</h1>
            </div>
            {activeView === "manage" && (
              <ResourceMonthSwitcher selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
            )}
          </header>

        <ConnectionStatus />
        {actionMessage && <div className="notice" role="status" aria-live="polite">{actionMessage}</div>}

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
            dataLoading={marketItemsLoading || otherPaymentsLoading}
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
            settlementPayments={selectedMonthSettlementPayments}
            selectedMonth={selectedMonth}
            userProfiles={userProfiles}
            onMonthChange={setSelectedMonth}
          />
        )}

        {canManageData && activeView === "settlement" && (
          <SettlementPanel
            firebaseUser={firebaseUser}
            rows={settlementSummaries}
            settlementPayments={settlementPayments}
            userProfiles={userProfiles}
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
      </main>
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
      </div>
    </>
  );
}

export default App;

