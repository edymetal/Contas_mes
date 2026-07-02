import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BarChart3,
  CalendarDays,
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

const currencyFormatter = new Intl.NumberFormat("pt-PT", {
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

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
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

function getShare(expense, personId) {
  return expense.shares?.[personId];
}

function personName(id) {
  return getPersonById(id)?.name || id;
}

function formatInstallmentLabel(label) {
  if (!label) return "";
  if (label.startsWith("Fixo")) return "Fixo";
  return label;
}

function isSettledStatus(status) {
  return status === "paid" || status === "settled" || status === "self";
}

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("contas_mes_theme") || "light";
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
  const [expenses, setExpenses] = useState([]);
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

  useEffect(() => {
    if (!hasFirebaseConfig) {
      setAuthLoading(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError("");

      if (!user) {
        setProfile(null);
        setActiveView("dashboard");
        setAuthLoading(false);
        return;
      }

      const matchedProfile = getProfileByEmail(user.email);
      if (!matchedProfile) {
        setProfile(null);
        setAuthError("Este e-mail não está cadastrado para acessar o sistema.");
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
          .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

        setExpenses(nextExpenses);
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

    const settlementsQuery = query(collection(db, "settlements"), where("monthKey", "==", selectedMonth));

    return onSnapshot(settlementsQuery, (snapshot) => {
      const nextPayments = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.kind === "payment")
        .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));

      setSettlementPayments(nextPayments);
    });
  }, [profile, selectedMonth]);

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

  const settlementRows = useMemo(
    () => calculateSettlementRows(expenses, settlementPayments),
    [expenses, settlementPayments],
  );

  async function handleLogin() {
    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(error.message || "Não foi possível entrar com o Google.");
    }
  }

  async function handleLogout() {
    await signOut(auth);
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

    for (let index = 0; index < runs; index += 1) {
      const currentDueDate = addMonths(computedDueDate, index);
      const currentMonthKey = monthFromDate(currentDueDate);
      
      const shareAmount = roundMoney(valuePerMonth / form.participants.length);
      const shares = form.participants.reduce((acc, personId) => {
        acc[personId] = {
          amount: shareAmount,
          status: personId === form.payerId ? "self" : "pending",
          payment: personId === form.payerId ? { type: "Pagamento original", paidAt: currentDueDate } : null,
        };
        return acc;
      }, {});

      let label = "";
      if (type === "installment") {
        label = `Parcela ${currentInstallment + index} de ${totalInstallments}`;
      } else if (type === "recurring") {
        label = "Fixo";
      }

      const docRef = doc(collection(db, "expenses"));
      const expenseData = {
        title: form.title.trim(),
        totalValue: valuePerMonth,
        expenseDate: type === "normal" ? form.expenseDate || "" : "",
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
        shares,
        createdBy: profile.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(docRef, expenseData);
    }

    await batch.commit();

    setSelectedMonth(monthFromDate(computedDueDate));
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
    setPaymentTarget({ expense, personId });
    setPaymentForm({ paidAt: todayInputValue(), type: "PIX", description: "" });
  }

  async function confirmPayment(event) {
    event.preventDefault();
    if (!paymentTarget) return;

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

  async function registerSettlementPayment(row, paymentData) {
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

  async function handleDeleteExpense(expenseId) {
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
          payment: { type: "Pagamento original", paidAt: updatedData.dueDate },
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
      monthKey: monthFromDate(updatedData.dueDate),
      category: updatedData.category,
      payerId: updatedData.payerId,
      participants: updatedData.participants,
      shares,
      updatedAt: serverTimestamp(),
    };

    if (updatedData.installment !== undefined) {
      updateFields.installment = updatedData.installment;
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
          <button className="drawer-close-button" onClick={() => setIsDrawerOpen(false)} type="button">
            <X size={20} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          {navItems.map((item) => {
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
            {PEOPLE.map((person) => (
              <button
                key={person.id}
                className={`user-tab ${activeView === person.id ? "active" : ""}`}
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

            <label className="month-filter">
              <CalendarDays size={18} />
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </label>
          </header>

        {actionMessage && <div className="notice">{actionMessage}</div>}

        {activeView === "dashboard" && (
          <Dashboard
            categoryTotals={categoryTotals}
            dataLoading={dataLoading}
            expenses={expenses}
            metrics={metrics}
          />
        )}

        {activeView === "new" && (
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
            currentProfile={profile}
            expenses={expenses}
            personId={activeView}
            settlementRows={settlementRows}
            onPay={openPayment}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        )}

        {activeView === "settlement" && (
          <SettlementPanel rows={settlementRows} onRegisterPayment={registerSettlementPayment} />
        )}

        {activeView === "settings" && (
          <SettingsPanel theme={theme} setTheme={setTheme} />
        )}

        {activeView === "manage" && (
          <ManagePanel
            expenses={expenses}
            onEdit={setEditingExpense}
            onDelete={handleDeleteExpense}
            dataLoading={dataLoading}
          />
        )}
      </section>
    </div>

      {paymentTarget && (
        <PaymentModal
          form={paymentForm}
          onChange={setPaymentForm}
          onClose={() => setPaymentTarget(null)}
          onSubmit={confirmPayment}
          target={paymentTarget}
        />
      )}

      {editingExpense && (
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
        <p>Entrar com uma das contas autorizadas: Edney, Sônia ou Rodney.</p>

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

function Dashboard({ categoryTotals, dataLoading, expenses, metrics }) {
  return (
    <div className="view-grid">
      <section className="metrics-grid">
        <MetricCard icon={ReceiptText} label="Gastos do mês" value={formatCurrency(metrics.total)} />
        <MetricCard icon={WalletCards} label="Total pendente" value={formatCurrency(metrics.pending)} tone="warning" />
        <MetricCard icon={Check} label="Total pago" value={formatCurrency(metrics.paid)} tone="success" />
      </section>

      <div className="dashboard-main-content">
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

        <section className="panel table-panel">
          <div className="section-heading">
            <h2>Contas cadastradas</h2>
            <span>{expenses.length} registro(s)</span>
          </div>
          {dataLoading ? <div className="empty-state">Carregando...</div> : <ExpensesTable expenses={expenses} />}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, tone = "default", value }) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">
        <Icon size={22} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
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

function PersonExpenses({ currentProfile, expenses, onPay, personId, selectedMonth, onMonthChange, settlementRows }) {
  const personExpenses = expenses.filter((expense) => expense.participants?.includes(personId));
  const selectedPerson = getPersonById(personId);
  const paymentSummary = useMemo(() => {
    const totalsByPayer = PEOPLE
      .filter((person) => person.id !== personId)
      .map((person) => ({ person, amount: 0 }));

    const totalToPay = settlementRows.reduce((sum, row) => {
      if (row.fromId !== personId) return sum;

      const amount = Number(row.amount || 0);
      const payerRow = totalsByPayer.find((item) => item.person.id === row.toId);
      if (payerRow) {
        payerRow.amount = roundMoney(payerRow.amount + amount);
      }

      return roundMoney(sum + amount);
    }, 0);

    return { totalsByPayer, totalToPay };
  }, [settlementRows, personId]);

  const formattedMonthName = useMemo(() => {
    if (!selectedMonth) return "";
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
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

        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--panel-muted)", padding: "6px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)" }}>
          <button
            type="button"
            className="icon-button"
            onClick={handlePrevMonth}
            style={{ padding: "4px" }}
            title="Mês Anterior"
          >
            <ChevronLeft size={18} />
          </button>
          
          <span style={{ fontWeight: "600", fontSize: "0.9rem", minWidth: "140px", textAlign: "center", textTransform: "capitalize" }}>
            {formattedMonthName}
          </span>

          <button
            type="button"
            className="icon-button"
            onClick={handleNextMonth}
            style={{ padding: "4px" }}
            title="Próximo Mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="person-payment-summary">
        <div className="person-debt-grid">
          {paymentSummary.totalsByPayer.map(({ person, amount }) => (
            <div className="person-debt-card" key={person.id}>
              <span>Deve para {person.name}</span>
              <strong>{formatCurrency(amount)}</strong>
            </div>
          ))}
        </div>

        <div className="person-total-card">
          <span>Total a pagar no mês</span>
          <strong>{formatCurrency(paymentSummary.totalToPay)}</strong>
        </div>
      </div>

      {!personExpenses.length ? (
        <div className="empty-state">Nenhuma conta para este mês.</div>
      ) : (
        <div className="expense-list">
          {personExpenses.map((expense) => {
            const share = getShare(expense, personId);
            const isPayer = expense.payerId === personId;
            const canPay = currentProfile.id === personId && !isPayer && share?.status === "pending";

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
                  <p>
                    {personName(expense.payerId)} pagou • vencimento {formatDate(expense.dueDate)}
                  </p>
                </div>

                <div className="expense-side">
                  <strong>{formatCurrency(share?.amount)}</strong>
                  <StatusBadge status={isPayer ? "self" : share?.status} />
                  {canPay && (
                    <button className="secondary-button" onClick={() => onPay(expense, personId)} type="button">
                      Marcar como pago
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }) {
  const labels = {
    pending: "Pendente",
    paid: "Pago",
    settled: "Liquidado",
    self: "Pagamento original",
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

function SettlementPanel({ onRegisterPayment, rows }) {
  const [paymentForms, setPaymentForms] = useState({});

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

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Saldos cruzados</h2>
        <span>{rows.length} saldo(s)</span>
      </div>

      {!rows.length ? (
        <div className="empty-state">Nenhum saldo pendente neste mês.</div>
      ) : (
        <div className="settlement-grid">
          {rows.map((row) => {
            const form = getPaymentForm(row);

            return (
              <article className="settlement-card settlement-payment-card" key={getRowKey(row)}>
                <div className="settlement-card-heading">
                  <div>
                    <span>{personName(row.fromId)} deve para</span>
                    <strong>{personName(row.toId)}</strong>
                  </div>
                  <div className="settlement-balance-summary">
                    <span>Total: {formatCurrency(row.originalAmount)}</span>
                    <span>Pago: {formatCurrency(row.paidAmount)}</span>
                    <strong>Restante: {formatCurrency(row.amount)}</strong>
                  </div>
                </div>

                <form className="settlement-payment-form" onSubmit={(event) => submitPayment(event, row)}>
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
                      Registrar pagamento
                    </button>
                    <button
                      className="secondary-button"
                      onClick={(event) => submitPayment(event, row, row.amount)}
                      type="button"
                    >
                      Pagar restante
                    </button>
                  </div>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function calculateSettlementRows(expenses, settlementPayments = []) {
  const balances = new Map();
  const paidBalances = new Map();

  expenses.forEach((expense) => {
    Object.entries(expense.shares || {}).forEach(([personId, share]) => {
      if (personId === expense.payerId || share.status !== "pending") return;
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
      const firstOwesSecond = balances.get(`${first}->${second}`) || 0;
      const secondOwesFirst = balances.get(`${second}->${first}`) || 0;
      const net = roundMoney(firstOwesSecond - secondOwesFirst);

      if (net > 0) {
        const paidAmount = Math.min(paidBalances.get(`${first}->${second}`) || 0, net);
        const remainingAmount = roundMoney(net - paidAmount);
        if (remainingAmount > 0) {
          rows.push({
            fromId: first,
            toId: second,
            originalAmount: net,
            paidAmount,
            amount: remainingAmount,
          });
        }
      }

      if (net < 0) {
        const originalAmount = Math.abs(net);
        const paidAmount = Math.min(paidBalances.get(`${second}->${first}`) || 0, originalAmount);
        const remainingAmount = roundMoney(originalAmount - paidAmount);
        if (remainingAmount > 0) {
          rows.push({
            fromId: second,
            toId: first,
            originalAmount,
            paidAmount,
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

function ManagePanel({ expenses, onEdit, onDelete, dataLoading }) {
  if (dataLoading) {
    return <div className="empty-state">Carregando...</div>;
  }

  if (!expenses.length) {
    return <div className="empty-state">Nenhuma conta cadastrada neste mês.</div>;
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Contas do Mês</h2>
        <span>{expenses.length} registro(s)</span>
      </div>

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
    </section>
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
