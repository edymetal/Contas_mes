import { X } from "lucide-react";
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
  const summary = getExpenseHistorySummary(allExpenses, expense, selectedMonth);

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
            <h3>Meses encontrados</h3>
            <span>{summary.totalCount} registro(s)</span>
          </div>

          {!summary.expenses.length ? (
            <div className="empty-state compact">
              Nenhum registro encontrado até {formatMonthLabel(selectedMonth)}.
            </div>
          ) : (
            summary.expenses.map((historyExpense) => (
              <article className="expense-history-row" key={historyExpense.id}>
                <div className="expense-history-period">
                  <strong>{formatMonthLabel(historyExpense.historyMonthKey)}</strong>
                  <small>Vencimento em {formatDate(historyExpense.dueDate)}</small>
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
