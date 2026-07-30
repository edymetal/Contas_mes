import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Download,
  FileText,
  Home,
  Printer,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  createAnnualReport,
  createReportComparison,
  createReportCsv,
} from "../domain/reports";
import { shiftMonth } from "../domain/expenses";
import {
  formatCurrency,
  formatMonthLabel,
  formatMonthName,
} from "../utils/presentation";

const TOTAL_ROWS = [
  { key: "consolidated", label: "Total consolidado", icon: WalletCards },
  { key: "shared", label: "Contas compartilhadas", icon: Home },
  { key: "market", label: "Mercado", icon: ShoppingCart },
  { key: "other", label: "Outros pagamentos", icon: ReceiptText },
];

const DIMENSION_OPTIONS = {
  categories: "Categorias",
  people: "Pessoas",
  establishments: "Estabelecimentos",
};

function formatChange(change) {
  if (!change.difference) return "Sem alteração";
  const direction = change.difference > 0 ? "aumento" : "redução";
  if (change.percent === null) {
    return `${direction} de ${formatCurrency(Math.abs(change.difference))}`;
  }
  return `${direction} de ${Math.abs(change.percent).toFixed(1).replace(".", ",")}%`;
}

function downloadTextFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPanel({
  dataLoading,
  expenses,
  marketItems,
  otherPayments,
  selectedMonth,
  onMonthChange,
}) {
  const [comparisonMonth, setComparisonMonth] = useState(() => shiftMonth(selectedMonth, -1));
  const [dimension, setDimension] = useState("categories");
  const year = selectedMonth.slice(0, 4);
  const comparison = useMemo(
    () => createReportComparison(
      expenses,
      marketItems,
      otherPayments,
      selectedMonth,
      comparisonMonth,
    ),
    [comparisonMonth, expenses, marketItems, otherPayments, selectedMonth],
  );
  const annualReport = useMemo(
    () => createAnnualReport(expenses, marketItems, otherPayments, year),
    [expenses, marketItems, otherPayments, year],
  );
  const dimensionRows = annualReport.dimensions[dimension];
  const annualMaximum = Math.max(...annualReport.months.map((month) => month.total), 1);
  const dimensionMaximum = Math.max(
    ...dimensionRows.flatMap((row) => row.months.map((month) => month.value)),
    1,
  );

  function exportCsv() {
    const csv = createReportCsv(expenses, marketItems, otherPayments, selectedMonth);
    downloadTextFile(
      `\uFEFF${csv}`,
      `relatorio_contas_${selectedMonth}.csv`,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="reports-shell">
      <section className="panel report-toolbar no-print">
        <div className="report-hero">
          <div className="report-hero-icon">
            <BarChart3 aria-hidden="true" size={27} />
          </div>
          <div className="report-hero-copy">
            <span className="eyebrow">Análise financeira</span>
            <h2>Relatórios e comparações</h2>
            <p>Compare períodos e descubra como cada grupo participa dos gastos.</p>
          </div>
          <div className="report-hero-badge">
            <TrendingUp aria-hidden="true" size={17} />
            Visão consolidada
          </div>
        </div>

        <div className="report-controls">
          <label>
            <span><CalendarDays aria-hidden="true" size={15} /> Mês principal</span>
            <input
              onChange={(event) => onMonthChange(event.target.value)}
              type="month"
              value={selectedMonth}
            />
          </label>
          <label>
            <span><CalendarDays aria-hidden="true" size={15} /> Comparar com</span>
            <input
              onChange={(event) => setComparisonMonth(event.target.value)}
              type="month"
              value={comparisonMonth}
            />
          </label>
          <label>
            <span><Users aria-hidden="true" size={15} /> Evolução por</span>
            <select value={dimension} onChange={(event) => setDimension(event.target.value)}>
              {Object.entries(DIMENSION_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <div className="report-export-actions">
            <button className="secondary-button" onClick={exportCsv} type="button">
              <Download aria-hidden="true" size={18} />
              Exportar CSV
            </button>
            <button className="primary-button" onClick={() => window.print()} type="button">
              <Printer aria-hidden="true" size={18} />
              Exportar PDF
            </button>
          </div>
        </div>
      </section>

      <header className="report-print-heading">
        <span>Contas Compartilhadas</span>
        <h2>Relatório de {formatMonthLabel(selectedMonth)}</h2>
        <p>Comparação com {formatMonthLabel(comparisonMonth)} e evolução anual de {year}.</p>
      </header>

      <section aria-busy={dataLoading} className="report-summary-grid">
        {TOTAL_ROWS.map(({ icon: Icon, key, label }) => {
          const change = comparison.changes[key];
          const ChangeIcon = change.difference > 0 ? ArrowUp : change.difference < 0 ? ArrowDown : TrendingUp;
          return (
            <article className={`report-summary-card ${key}`} key={key}>
              <div className="report-summary-card-head">
                <span className="report-summary-icon"><Icon aria-hidden="true" size={20} /></span>
                <span>{label}</span>
              </div>
              <div className="report-summary-value">
                <strong>{formatCurrency(change.current)}</strong>
                <small>em {formatMonthName(selectedMonth)}</small>
              </div>
              <div className={`report-change-pill ${change.difference > 0 ? "increase" : change.difference < 0 ? "decrease" : ""}`}>
                <ChangeIcon aria-hidden="true" size={14} />
                {formatChange(change)}
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel report-comparison-panel">
        <div className="section-heading">
          <div className="report-section-title">
            <span className="report-section-icon comparison"><FileText aria-hidden="true" size={20} /></span>
            <div>
              <span className="eyebrow">Comparação mensal</span>
              <h2>{formatMonthLabel(selectedMonth)} × {formatMonthLabel(comparisonMonth)}</h2>
            </div>
          </div>
        </div>

        <div className="report-table-wrap">
          <table className="report-table">
            <caption className="sr-only">
              Comparação dos totais entre {formatMonthLabel(selectedMonth)} e {formatMonthLabel(comparisonMonth)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Origem</th>
                <th scope="col">{formatMonthLabel(selectedMonth)}</th>
                <th scope="col">{formatMonthLabel(comparisonMonth)}</th>
                <th scope="col">Variação</th>
              </tr>
            </thead>
            <tbody>
              {TOTAL_ROWS.map(({ icon: Icon, key, label }) => {
                const change = comparison.changes[key];
                return (
                  <tr className={`report-source-row ${key}`} key={key}>
                    <th scope="row">
                      <span className="report-source-label">
                        <span className="report-source-icon"><Icon aria-hidden="true" size={16} /></span>
                        {label}
                      </span>
                    </th>
                    <td>{formatCurrency(change.current)}</td>
                    <td>{formatCurrency(change.comparison)}</td>
                    <td>
                      <span className={`report-table-change ${change.difference > 0 ? "increase" : change.difference < 0 ? "decrease" : ""}`}>
                        {change.difference > 0
                          ? <ArrowUp aria-hidden="true" size={13} />
                          : change.difference < 0
                            ? <ArrowDown aria-hidden="true" size={13} />
                            : null}
                        {change.difference > 0 ? "+" : ""}{formatCurrency(change.difference)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel report-annual-panel">
        <div className="section-heading">
          <div className="report-section-title">
            <span className="report-section-icon annual"><BarChart3 aria-hidden="true" size={20} /></span>
            <div>
              <span className="eyebrow">Evolução anual</span>
              <h2>Totais mensais de {year}</h2>
            </div>
          </div>
          <div className="report-annual-total">
            <span>Total no ano</span>
            <strong>{formatCurrency(annualReport.total)}</strong>
          </div>
        </div>

        <div className="report-chart-legend" aria-label="Legenda do gráfico">
          <span className="shared">Contas compartilhadas</span>
          <span className="market">Mercado</span>
          <span className="other">Outros pagamentos</span>
        </div>

        <div className="report-annual-chart">
          {annualReport.months.map((month) => (
            <article className={month.monthKey === selectedMonth ? "selected" : ""} key={month.monthKey}>
              <div className="report-annual-bar" aria-hidden="true">
                <span className="shared" style={{ height: `${month.shared / annualMaximum * 100}%` }} />
                <span className="market" style={{ height: `${month.market / annualMaximum * 100}%` }} />
                <span className="other" style={{ height: `${month.other / annualMaximum * 100}%` }} />
              </div>
              <strong>{formatCurrency(month.total)}</strong>
              <span>{formatMonthName(month.monthKey).slice(0, 3)}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel report-dimension-panel">
        <div className="section-heading">
          <div className="report-section-title">
            <span className="report-section-icon dimension"><TrendingUp aria-hidden="true" size={20} /></span>
            <div>
              <span className="eyebrow">Detalhamento anual</span>
              <h2>Evolução por {DIMENSION_OPTIONS[dimension].toLocaleLowerCase("pt-BR")}</h2>
            </div>
          </div>
          <span className="report-dimension-badge">{dimensionRows.length} grupo(s)</span>
        </div>

        {dimensionRows.length ? (
          <div className="report-table-wrap">
            <table className={`report-table report-dimension-table dimension-${dimension}`}>
              <caption className="sr-only">
                Evolução mensal por {DIMENSION_OPTIONS[dimension].toLocaleLowerCase("pt-BR")} em {year}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{DIMENSION_OPTIONS[dimension]}</th>
                  {annualReport.months.map((month) => (
                    <th
                      className={month.monthKey === selectedMonth ? "selected-month" : ""}
                      key={month.monthKey}
                      scope="col"
                    >
                      {formatMonthName(month.monthKey).slice(0, 3)}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {dimensionRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row"><span className="report-dimension-label">{row.label}</span></th>
                    {row.months.map((month) => (
                      <td
                        className={`${month.value ? "has-value" : "empty-value"} ${month.monthKey === selectedMonth ? "selected-month" : ""}`}
                        key={month.monthKey}
                        style={month.value ? { "--cell-alpha": 0.1 + month.value / dimensionMaximum * 0.42 } : undefined}
                      >
                        {month.value ? formatCurrency(month.value) : "—"}
                      </td>
                    ))}
                    <td><strong>{formatCurrency(row.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Nenhum dado disponível para esta dimensão em {year}.</div>
        )}
      </section>
    </div>
  );
}
