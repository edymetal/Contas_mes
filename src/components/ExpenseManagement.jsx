import { useMemo, useState } from "react";
import { Check, Pencil, Search, Trash2, X } from "lucide-react";
import { CategoryTag } from "./CategoryTag";
import { ExpenseHistoryModal } from "./ExpenseHistoryModal";
import { PlaceAutocomplete } from "./ResourceListView";
import { CATEGORIES, PAYMENT_TYPES, PEOPLE } from "../config/people";
import { getFirebaseActionError } from "../domain/errors";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { reportClientError } from "../services/observability";
import {
  formatInstallmentLabel,
  getExpenseDisplayMonthKey,
  getExpenseKind,
  getExpensesForMonth,
  getFixedExpenseMonthGroups,
  getInstallmentInfo,
  getInstallmentSeriesKey,
  getInstallmentSeriesSummaries,
  getNormalizedExpenses,
  isExpenseFullySettled,
  isFixedExpense,
  roundMoney,
  shiftMonth,
  sumInstallmentExpenses,
} from "../domain/expenses";
import {
  formatCurrency,
  formatDate,
  formatDateMonth,
  formatInstallmentPeriod,
  formatMonthLabel,
  formatMonthName,
  normalizeSearchText,
  personName,
} from "../utils/presentation";

const SEARCH_COLUMN_OPTIONS = [
  { value: "all", label: "Todas as colunas" },
  { value: "title", label: "Despesa" },
  { value: "value", label: "Valor" },
  { value: "dueDate", label: "Vencimento" },
  { value: "category", label: "Categoria" },
  { value: "payer", label: "Quem pagou" },
  { value: "participants", label: "Rateio" },
  { value: "status", label: "Situação" },
];

function getFormattedSearchValues(values) {
  return values.flatMap((value) => {
    if (!value) return [];
    return [value, formatDate(value)];
  });
}

function getCurrencySearchValues(values) {
  return values.flatMap((value) => {
    if (value === undefined || value === null || value === "") return [];
    return [value, formatCurrency(value)];
  });
}

export function expenseMatchesSearch(expense, searchTerm, searchColumn = "all") {
  const normalizedSearchTerm = normalizeSearchText(searchTerm).trim();
  if (!normalizedSearchTerm) return true;

  const isPaid = isExpenseFullySettled(expense);
  if (searchColumn === "status" && normalizedSearchTerm === "nao paga") {
    return !isPaid;
  }

  const installmentExpenses = expense.installments instanceof Map
    ? Array.from(expense.installments.values())
    : [];
  const searchValuesByColumn = {
    title: [
      expense.title,
      expense.installment ? formatInstallmentLabel(expense.installment) : "",
    ],
    value: getCurrencySearchValues([
      expense.totalValue,
      expense.installmentValue,
      expense.paidValue,
      expense.remainingValue,
      ...installmentExpenses.map((item) => item.totalValue),
    ]),
    dueDate: getFormattedSearchValues([
      expense.dueDate,
      expense.firstDueDate,
      expense.finalDueDate,
      expense.finalizedDate,
      ...installmentExpenses.map((item) => item.dueDate),
    ]),
    category: [expense.category],
    payer: [personName(expense.payerId)],
    participants: (expense.participants || []).map(personName),
    status: [isPaid ? "paga quitada" : "não pendente"],
  };
  const searchableValues = searchColumn === "all"
    ? Object.values(searchValuesByColumn).flat()
    : searchValuesByColumn[searchColumn] || [];

  return normalizeSearchText(searchableValues.join(" ")).includes(normalizedSearchTerm);
}

export function getExpensesForSearchScope(allExpenses, monthlyExpenses, selectedMonth, searchScope) {
  if (searchScope === "month") return monthlyExpenses;

  const expenseSource = allExpenses.length ? allExpenses : monthlyExpenses;
  const normalizedExpenses = getNormalizedExpenses(expenseSource);
  if (searchScope === "year") {
    const selectedYear = selectedMonth.slice(0, 4);
    return normalizedExpenses.filter((expense) => (
      getExpenseDisplayMonthKey(expense).startsWith(`${selectedYear}-`)
    ));
  }

  return normalizedExpenses;
}

export function ManagePanel({ allExpenses = [], expenses, selectedMonth, onEdit, onDelete, dataLoading }) {
  const [manageView, setManageView] = useState("month");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [searchScope, setSearchScope] = useState("month");
  const [historyExpense, setHistoryExpense] = useState(null);
  const hasSearchTerm = Boolean(normalizeSearchText(searchTerm).trim());
  const expenseSource = allExpenses.length ? allExpenses : expenses;
  const scopedExpenses = useMemo(
    () => getExpensesForSearchScope(allExpenses, expenses, selectedMonth, searchScope),
    [allExpenses, expenses, searchScope, selectedMonth],
  );
  const filteredExpenseSource = useMemo(
    () => expenseSource.filter((expense) => expenseMatchesSearch(expense, searchTerm, searchColumn)),
    [expenseSource, searchColumn, searchTerm],
  );
  const filteredScopedExpenses = useMemo(
    () => scopedExpenses.filter((expense) => expenseMatchesSearch(expense, searchTerm, searchColumn)),
    [scopedExpenses, searchColumn, searchTerm],
  );
  const scopedInstallmentKeys = useMemo(() => {
    return new Set(
      scopedExpenses
        .map((expense) => {
          const installmentInfo = getInstallmentInfo(expense);
          return installmentInfo ? getInstallmentSeriesKey(expense, installmentInfo) : "";
        })
        .filter(Boolean),
    );
  }, [scopedExpenses]);
  const filteredInstallmentKeys = useMemo(() => {
    return new Set(
      filteredScopedExpenses
        .map((expense) => {
          const installmentInfo = getInstallmentInfo(expense);
          return installmentInfo ? getInstallmentSeriesKey(expense, installmentInfo) : "";
        })
        .filter(Boolean),
    );
  }, [filteredScopedExpenses]);
  const allInstallmentSummaries = useMemo(
    () => getInstallmentSeriesSummaries(expenseSource)
      .filter((item) => scopedInstallmentKeys.has(item.key)),
    [expenseSource, scopedInstallmentKeys],
  );
  const installmentSummaries = useMemo(
    () => allInstallmentSummaries.filter((item) => filteredInstallmentKeys.has(item.key)),
    [allInstallmentSummaries, filteredInstallmentKeys],
  );
  const activeInstallments = installmentSummaries.filter((item) => !item.completed);
  const finishedInstallments = installmentSummaries
    .filter((item) => item.completed)
    .sort((a, b) => (b.finalizedDate || b.finalDueDate || "").localeCompare(a.finalizedDate || a.finalDueDate || ""));
  const installmentSummaryTotals = useMemo(() => {
    const nextMonth = shiftMonth(selectedMonth, 1);

    return {
      currentMonth: sumInstallmentExpenses(getExpensesForMonth(filteredExpenseSource, selectedMonth)),
      nextMonth: sumInstallmentExpenses(getExpensesForMonth(filteredExpenseSource, nextMonth)),
      nextMonthKey: nextMonth,
      remaining: installmentSummaries.reduce(
        (sum, installment) => roundMoney(sum + Number(installment.remainingValue || 0)),
        0,
      ),
    };
  }, [filteredExpenseSource, installmentSummaries, selectedMonth]);
  const allFixedExpenseGroups = useMemo(
    () => getFixedExpenseMonthGroups(scopedExpenses),
    [scopedExpenses],
  );
  const fixedExpenseGroups = useMemo(
    () => getFixedExpenseMonthGroups(filteredScopedExpenses),
    [filteredScopedExpenses],
  );
  const allFixedExpensesCount = allFixedExpenseGroups.reduce((sum, group) => sum + group.expenses.length, 0);
  const fixedExpensesCount = fixedExpenseGroups.reduce((sum, group) => sum + group.expenses.length, 0);
  const allSingleExpenses = useMemo(
    () => scopedExpenses.filter((expense) => getExpenseKind(expense) === "normal"),
    [scopedExpenses],
  );
  const singleExpenses = useMemo(
    () => filteredScopedExpenses.filter((expense) => getExpenseKind(expense) === "normal"),
    [filteredScopedExpenses],
  );
  const listedExpenses = manageView === "single" ? singleExpenses : filteredScopedExpenses;
  const selectedYear = selectedMonth.slice(0, 4);
  const scopeDescription = {
    month: `em ${formatMonthLabel(selectedMonth)}`,
    year: `em ${selectedYear}`,
    all: "em toda a base",
  }[searchScope];

  const viewTitle = {
    month: {
      month: "Contas do Mês",
      year: "Contas do Ano",
      all: "Todas as Contas",
    }[searchScope],
    single: "Contas Únicas",
    installments: "Contas Parceladas",
    fixed: "Contas Fixas",
  }[manageView];
  const viewResultCount = {
    month: filteredScopedExpenses.length,
    single: singleExpenses.length,
    installments: installmentSummaries.length,
    fixed: fixedExpensesCount,
  }[manageView];
  const viewTotalCount = {
    month: scopedExpenses.length,
    single: allSingleExpenses.length,
    installments: allInstallmentSummaries.length,
    fixed: allFixedExpensesCount,
  }[manageView];
  const viewCount = {
    month: `${scopedExpenses.length} registro(s)`,
    single: `${allSingleExpenses.length} conta(s) única(s)`,
    installments: `${allInstallmentSummaries.length} parcelamento(s)`,
    fixed: `${allFixedExpensesCount} conta(s) fixa(s)`,
  }[manageView];
  const displayedViewCount = hasSearchTerm
    ? `${viewResultCount} de ${viewTotalCount} resultado(s)`
    : viewCount;

  return (
    <section className="panel">
      <div className="section-heading manage-heading">
        <div>
          <h2>{viewTitle}</h2>
          <span aria-live="polite">{displayedViewCount}</span>
        </div>
        <div className="manage-actions">
          <button
            aria-pressed={manageView === "month"}
            className={manageView === "month" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("month")}
            type="button"
          >
            Contas ({scopedExpenses.length})
          </button>
          <button
            aria-pressed={manageView === "single"}
            className={manageView === "single" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("single")}
            type="button"
          >
            Contas Únicas ({allSingleExpenses.length})
          </button>
          <button
            aria-pressed={manageView === "installments"}
            className={manageView === "installments" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("installments")}
            type="button"
          >
            Contas Parceladas ({allInstallmentSummaries.length})
          </button>
          <button
            aria-pressed={manageView === "fixed"}
            className={manageView === "fixed" ? "primary-button" : "secondary-button"}
            onClick={() => setManageView("fixed")}
            type="button"
          >
            Contas Fixas ({allFixedExpensesCount})
          </button>
        </div>
      </div>

      <div className="manage-search-toolbar" role="search" aria-label="Buscar contas">
        <div className="manage-search-control manage-search-field">
          <label htmlFor="manage-account-search">Buscar contas</label>
          <div className="manage-search">
            <Search aria-hidden="true" size={19} />
            <input
              id="manage-account-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Digite o valor que deseja buscar"
              autoComplete="off"
            />
            {searchTerm && (
              <button
                aria-label="Limpar busca"
                className="manage-search-clear"
                onClick={() => setSearchTerm("")}
                title="Limpar busca"
                type="button"
              >
                <X size={17} />
              </button>
            )}
          </div>
        </div>

        <label className="manage-search-control">
          <span>Coluna</span>
          <select value={searchColumn} onChange={(event) => setSearchColumn(event.target.value)}>
            {SEARCH_COLUMN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="manage-search-control">
          <span>Buscar em</span>
          <select value={searchScope} onChange={(event) => setSearchScope(event.target.value)}>
            <option value="month">{formatMonthName(selectedMonth)}</option>
            <option value="year">Ano de {selectedYear}</option>
            <option value="all">Toda a base de dados</option>
          </select>
        </label>
      </div>

      {dataLoading ? (
        <div className="empty-state">Carregando...</div>
      ) : hasSearchTerm && !viewResultCount ? (
        <div className="empty-state">Nenhuma conta encontrada para “{searchTerm.trim()}” {scopeDescription}.</div>
      ) : manageView === "installments" ? (
        <InstallmentSeriesView
          activeInstallments={activeInstallments}
          emptyText={`Nenhuma conta parcelada ${scopeDescription}.`}
          finishedInstallments={finishedInstallments}
          selectedMonth={selectedMonth}
          summaryTotals={installmentSummaryTotals}
        />
      ) : manageView === "fixed" ? (
        <FixedExpensesView
          emptyText={`Nenhuma conta fixa ${scopeDescription}.`}
          groups={fixedExpenseGroups}
        />
      ) : !listedExpenses.length ? (
        <div className="empty-state">
          {manageView === "single"
            ? `Nenhuma conta única cadastrada ${scopeDescription}.`
            : `Nenhuma conta cadastrada ${scopeDescription}.`}
        </div>
      ) : (
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Contas exibidas para gerenciamento</caption>
          <thead>
            <tr>
              <th scope="col">Despesa</th>
              <th scope="col">Valor</th>
              <th scope="col">Vencimento</th>
              <th scope="col">Categoria</th>
              <th scope="col">Quem pagou</th>
              <th scope="col">Rateio</th>
              <th scope="col">Situação</th>
              <th scope="col" style={{ textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {listedExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <button
                      aria-label={`Ver histórico de ${expense.title}`}
                      className="expense-history-trigger"
                      onClick={() => setHistoryExpense(expense)}
                      title="Ver histórico da despesa"
                      type="button"
                    >
                      {expense.title}
                    </button>
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
                  <CategoryTag category={expense.category} />
                </td>
                <td>{personName(expense.payerId)}</td>
                <td>{expense.participants?.map(personName).join(", ")}</td>
                <td>
                  <span className={`tag expense-payment-status ${isExpenseFullySettled(expense) ? "paid" : "pending"}`}>
                    {isExpenseFullySettled(expense) ? "Paga" : "Não paga"}
                  </span>
                </td>
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
                          ? "Excluir toda a conta parcelada"
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

      {historyExpense && (
        <ExpenseHistoryModal
          allExpenses={expenseSource}
          expense={historyExpense}
          onClose={() => setHistoryExpense(null)}
          selectedMonth={selectedMonth}
        />
      )}
    </section>
  );
}

function InstallmentSeriesView({ activeInstallments, emptyText, finishedInstallments, selectedMonth, summaryTotals }) {
  const installments = [...activeInstallments, ...finishedInstallments];

  if (!activeInstallments.length && !finishedInstallments.length) {
    return <div className="empty-state">{emptyText}</div>;
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

function FixedExpensesView({ emptyText, groups }) {
  if (!groups.length) {
    return <div className="empty-state">{emptyText}</div>;
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

export function EditResourceItemModal({ item, placeSuggestions, onClose, onSave }) {
  const isMarket = item.kind === "market";
  const dialogRef = useDialogAccessibility(onClose);
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
      reportClientError(saveError, "resource:update");
      setError(saveError.message || "Não foi possível atualizar o lançamento.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="resource-edit-title"
        aria-modal="true"
        className="modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="section-heading">
          <div>
            <h2 id="resource-edit-title">Editar {isMarket ? "item de mercado" : "pagamento"}</h2>
            <span>Altere os dados do lançamento</span>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
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
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Cancelar</button>
            <button className="primary-button" type="submit"><Check size={18} /> Salvar alterações</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function EditExpenseModal({ expense, onClose, onSave }) {
  const dialogRef = useDialogAccessibility(onClose);
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
      reportClientError(err, "expense:update");
      setError(getFirebaseActionError(err, "atualizar a conta"));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="edit-title"
        aria-modal="true"
        className="modal"
        ref={dialogRef}
        role="dialog"
        style={{ maxWidth: "600px" }}
        tabIndex={-1}
      >
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
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
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

          {error && <div className="error-box" role="alert">{error}</div>}

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
