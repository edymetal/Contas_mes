import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  formatInstallmentLabel,
  getExpenseHistorySummary,
} from "../domain/expenses";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  personName,
} from "../utils/presentation";

const STATUS_LABELS = {
  paid: "Quitada",
  partial: "Parcial",
  pending: "Pendente",
};

export function ExpenseHistoryModal({
  allExpenses,
  expense,
  onClose,
  selectedMonth,
}) {
  const dialogRef = useDialogAccessibility(onClose);
  const summary = useMemo(
    () => getExpenseHistorySummary(allExpenses, expense, selectedMonth),
    [allExpenses, expense, selectedMonth],
  );
  const [visibleYear, setVisibleYear] = useState(() => selectedMonth.slice(0, 4));
  const availableYears = useMemo(() => (
    Array.from(new Set(summary.expenses.map((item) => item.historyMonthKey.slice(0, 4))))
      .sort((first, second) => second.localeCompare(first))
  ), [summary.expenses]);
  const olderYear = availableYears.find((year) => year < visibleYear);
  const newerYear = [...availableYears].reverse().find((year) => year > visibleYear);
  const visibleYearExpenses = summary.expenses.filter((item) => (
    item.historyMonthKey.startsWith(`${visibleYear}-`)
  ));
  const visibleMonthGroups = Array.from(
    visibleYearExpenses.reduce((groups, item) => {
      const group = groups.get(item.historyMonthKey) || [];
      group.push(item);
      groups.set(item.historyMonthKey, group);
      return groups;
    }, new Map()),
  )
    .map(([monthKey, expenses]) => ({ monthKey, expenses }))
    .sort((first, second) => second.monthKey.localeCompare(first.monthKey));

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="expense-history-title"
        aria-modal="true"
        className="modal expense-history-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="section-heading expense-history-heading">
          <div>
            <span>Histórico até {formatMonthLabel(selectedMonth)}</span>
            <h2 id="expense-history-title">{expense.title}</h2>
            <p>Somente o mês selecionado e os meses anteriores. Meses futuros não são incluídos.</p>
          </div>
          <button
            aria-label="Fechar histórico"
            autoFocus
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="expense-history-summary" aria-label="Resumo da despesa">
          <article>
            <span>Total de registros</span>
            <strong>{summary.totalCount}</strong>
          </article>
          <article className="paid">
            <span>Registros quitados</span>
            <strong>{summary.paidCount}</strong>
          </article>
          <article>
            <span>Valor total</span>
            <strong>{formatCurrency(summary.totalValue)}</strong>
          </article>
          <article className="paid">
            <span>Valor já pago</span>
            <strong>{formatCurrency(summary.paidValue)}</strong>
          </article>
          <article className="pending">
            <span>Valor pendente</span>
            <strong>{formatCurrency(summary.pendingValue)}</strong>
          </article>
        </div>

        <div className="expense-history-list" aria-label={`Histórico de ${expense.title}`}>
          <div className="expense-history-list-heading">
            <div>
              <h3>Meses de {visibleYear}</h3>
              <span>{visibleYearExpenses.length} registro(s) neste ano</span>
            </div>
            <div className="expense-history-year-navigation" aria-label="Navegação entre anos">
              <button
                aria-label="Ano anterior"
                className="icon-button"
                disabled={!olderYear}
                onClick={() => setVisibleYear(olderYear)}
                title={olderYear ? `Ir para ${olderYear}` : "Não há registros em anos anteriores"}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <strong aria-live="polite">{visibleYear}</strong>
              <button
                aria-label="Próximo ano"
                className="icon-button"
                disabled={!newerYear}
                onClick={() => setVisibleYear(newerYear)}
                title={newerYear ? `Ir para ${newerYear}` : "Não há registros em anos posteriores"}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {!visibleMonthGroups.length ? (
            <div className="empty-state compact">
              Nenhum registro encontrado em {visibleYear}.
            </div>
          ) : (
            visibleMonthGroups.map((monthGroup) => (
              <section className="expense-history-month-group" key={monthGroup.monthKey}>
                <div className="expense-history-month-heading">
                  <h4>{formatMonthLabel(monthGroup.monthKey)}</h4>
                  <span>
                    {monthGroup.expenses.length} {monthGroup.expenses.length === 1 ? "registro" : "registros"}
                  </span>
                </div>

                <div className="expense-history-month-rows">
                  {monthGroup.expenses.map((historyExpense) => (
                    <article className="expense-history-row" key={historyExpense.id}>
                      <div className="expense-history-period">
                        <strong>Vencimento em {formatDate(historyExpense.dueDate)}</strong>
                        <small>{historyExpense.title}</small>
                      </div>

                      <div className="expense-history-details">
                        <span>{historyExpense.category || "Sem categoria"}</span>
                        <small>{personName(historyExpense.payerId)}</small>
                        {historyExpense.installment && (
                          <small>{formatInstallmentLabel(historyExpense.installment)}</small>
                        )}
                      </div>

                      <div className="expense-history-payment">
                        <strong>{formatCurrency(historyExpense.totalValue)}</strong>
                        <span className={`tag expense-history-status ${historyExpense.historyStatus}`}>
                          {STATUS_LABELS[historyExpense.historyStatus]}
                        </span>
                        <small>{formatCurrency(historyExpense.historyPaidValue)} pago</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">Fechar</button>
        </div>
      </section>
    </div>
  );
}
