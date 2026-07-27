import { ArrowRightLeft, CircleDollarSign, ReceiptText } from "lucide-react";
import { CategoryIcon } from "./CategoryTag";
import { roundMoney } from "../domain/expenses";
import { formatCurrency, formatDate, personName } from "../utils/presentation";

export function Dashboard({
  breakdown,
  categoryTotals,
  dataLoading,
  expenses,
  metrics,
  selectedMonth,
  yearSummary,
}) {
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
  const nextExpenses = [...expenses]
    .filter((expense) => expense.dueDate)
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .slice(0, 4);
  const totalCountLabel = totalCount === 1
    ? "1 conta cadastrada neste mês."
    : `${totalCount} contas cadastradas neste mês.`;
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
                  <span className="category-label">
                    <CategoryIcon category={item.category} size={16} />
                    {item.category}
                  </span>
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
    </div>
  );
}
