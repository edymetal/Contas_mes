import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Package,
  ShoppingCart,
  X,
} from "lucide-react";
import { MONTHS_PT } from "../config/forms";
import { monthFromDate, roundMoney } from "../domain/expenses";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import {
  formatCurrency,
  formatMonthName,
  normalizeSearchText,
} from "../utils/presentation";

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function formatQuantity(value) {
  return quantityFormatter.format(Number(value || 0));
}

function getMarketItemMonthKey(item) {
  return item.monthKey || monthFromDate(item.purchasedAt);
}

function sumMarketItems(items) {
  return items.reduce((totals, item) => ({
    quantity: roundMoney(totals.quantity + Number(item.quantity || 0)),
    value: roundMoney(totals.value + Number(item.totalValue || 0)),
  }), { quantity: 0, value: 0 });
}

export function getMarketAnalysisDashboard(items, analysisType, analysisValue, visibleYear) {
  const field = analysisType === "product" ? "product" : "market";
  const normalizedValue = normalizeSearchText(String(analysisValue || "").trim());
  const matchingItems = items.filter((item) => (
    normalizeSearchText(String(item[field] || "").trim()) === normalizedValue
  ));
  const availableYears = Array.from(new Set(
    matchingItems
      .map((item) => getMarketItemMonthKey(item).slice(0, 4))
      .filter(Boolean),
  )).sort((first, second) => second.localeCompare(first));
  const yearItems = matchingItems.filter((item) => (
    getMarketItemMonthKey(item).startsWith(`${visibleYear}-`)
  ));
  const overallTotals = sumMarketItems(matchingItems);
  const yearTotals = sumMarketItems(yearItems);
  const months = MONTHS_PT.map(({ value }) => {
    const monthKey = `${visibleYear}-${value}`;
    const monthItems = yearItems.filter((item) => getMarketItemMonthKey(item) === monthKey);
    const totals = sumMarketItems(monthItems);

    return {
      monthKey,
      count: monthItems.length,
      quantity: totals.quantity,
      value: totals.value,
    };
  });
  const years = availableYears.map((year) => {
    const yearGroup = matchingItems.filter((item) => (
      getMarketItemMonthKey(item).startsWith(`${year}-`)
    ));
    const totals = sumMarketItems(yearGroup);

    return {
      year,
      count: yearGroup.length,
      quantity: totals.quantity,
      value: totals.value,
    };
  });

  return {
    availableYears,
    matchingItems,
    months,
    overall: {
      count: matchingItems.length,
      quantity: overallTotals.quantity,
      value: overallTotals.value,
    },
    selectedYear: {
      count: yearItems.length,
      quantity: yearTotals.quantity,
      value: yearTotals.value,
    },
    years,
  };
}

export function MarketAnalysisModal({
  analysis,
  items,
  onClose,
  selectedMonth,
}) {
  const dialogRef = useDialogAccessibility(onClose);
  const selectedYear = selectedMonth.slice(0, 4);
  const initialDashboard = useMemo(
    () => getMarketAnalysisDashboard(items, analysis.type, analysis.value, selectedYear),
    [analysis.type, analysis.value, items, selectedYear],
  );
  const [visibleYear, setVisibleYear] = useState(() => {
    if (initialDashboard.availableYears.includes(selectedYear)) return selectedYear;
    if (initialDashboard.availableYears.includes(analysis.initialYear)) return analysis.initialYear;
    return initialDashboard.availableYears[0] || selectedYear;
  });
  const dashboard = useMemo(
    () => getMarketAnalysisDashboard(items, analysis.type, analysis.value, visibleYear),
    [analysis.type, analysis.value, items, visibleYear],
  );
  const olderYear = dashboard.availableYears.find((year) => year < visibleYear);
  const newerYear = [...dashboard.availableYears].reverse().find((year) => year > visibleYear);
  const analysisLabel = analysis.type === "market" ? "Mercado" : "Produto";
  const AnalysisIcon = analysis.type === "market" ? ShoppingCart : Package;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="market-analysis-title"
        aria-modal="true"
        className="modal market-analysis-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="section-heading market-analysis-heading">
          <div className="market-analysis-title">
            <span className="market-analysis-title-icon" aria-hidden="true">
              <AnalysisIcon size={22} />
            </span>
            <div>
              <span>Dashboard por {analysisLabel.toLowerCase()}</span>
              <h2 id="market-analysis-title">{analysis.label}</h2>
              <p>Quantidades e valores acumulados por mês, ano e em toda a base de dados.</p>
            </div>
          </div>
          <button
            aria-label="Fechar dashboard"
            autoFocus
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <div className="market-analysis-summary" aria-label={`Resumo de ${analysis.label}`}>
          <article className="quantity">
            <span>Quantidade total geral</span>
            <strong>{formatQuantity(dashboard.overall.quantity)}</strong>
            <small>{dashboard.overall.count} lançamento(s)</small>
          </article>
          <article className="total">
            <span>Valor total geral</span>
            <strong>{formatCurrency(dashboard.overall.value)}</strong>
            <small>Todos os anos</small>
          </article>
          <article className="quantity">
            <span>Quantidade em {visibleYear}</span>
            <strong>{formatQuantity(dashboard.selectedYear.quantity)}</strong>
            <small>{dashboard.selectedYear.count} lançamento(s)</small>
          </article>
          <article className="annual">
            <span>Valor em {visibleYear}</span>
            <strong>{formatCurrency(dashboard.selectedYear.value)}</strong>
            <small>Total do ano selecionado</small>
          </article>
        </div>

        <div className="market-analysis-content">
          <section className="market-analysis-months" aria-labelledby="market-analysis-months-title">
            <div className="market-analysis-section-heading">
              <div>
                <span><BarChart3 aria-hidden="true" size={17} /> Evolução mensal</span>
                <h3 id="market-analysis-months-title">Valores por mês em {visibleYear}</h3>
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

            <div className="market-analysis-month-table-wrap">
              <table className="market-analysis-month-table">
                <caption className="sr-only">Quantidades e valores mensais de {analysis.label} em {visibleYear}</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Quantidade</th>
                    <th scope="col">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.months.map((month) => (
                    <tr className={month.count ? "" : "is-empty"} key={month.monthKey}>
                      <th scope="row">{formatMonthName(month.monthKey)}</th>
                      <td>{formatQuantity(month.quantity)}</td>
                      <td><strong>{formatCurrency(month.value)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total de {visibleYear}</th>
                    <td>{formatQuantity(dashboard.selectedYear.quantity)}</td>
                    <td><strong>{formatCurrency(dashboard.selectedYear.value)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="market-analysis-years" aria-labelledby="market-analysis-years-title">
            <div className="market-analysis-section-heading">
              <div>
                <span>Comparação anual</span>
                <h3 id="market-analysis-years-title">Todos os anos</h3>
              </div>
            </div>

            <div className="market-analysis-year-list">
              {dashboard.years.map((year) => (
                <button
                  aria-pressed={year.year === visibleYear}
                  className={year.year === visibleYear
                    ? "market-analysis-year-button active"
                    : "market-analysis-year-button"}
                  key={year.year}
                  onClick={() => setVisibleYear(year.year)}
                  type="button"
                >
                  <span>
                    <strong>{year.year}</strong>
                    <small>{year.count} lançamento(s)</small>
                  </span>
                  <span>
                    <small>{formatQuantity(year.quantity)} unidade(s)</small>
                    <strong>{formatCurrency(year.value)}</strong>
                  </span>
                </button>
              ))}
            </div>

            <div className="market-analysis-grand-total">
              <span>Total geral de todos os anos</span>
              <strong>{formatCurrency(dashboard.overall.value)}</strong>
              <small>{formatQuantity(dashboard.overall.quantity)} unidade(s)</small>
            </div>
          </section>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">Fechar</button>
        </div>
      </section>
    </div>
  );
}
