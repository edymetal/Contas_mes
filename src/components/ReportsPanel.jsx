import { useMemo, useState } from "react";
import { Download, FileText, Printer, TrendingUp } from "lucide-react";
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
  { key: "consolidated", label: "Total consolidado" },
  { key: "shared", label: "Contas compartilhadas" },
  { key: "market", label: "Mercado" },
  { key: "other", label: "Outros pagamentos" },
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
        <div className="section-heading">
          <div>
            <span className="eyebrow">Análise financeira</span>
            <h2>Relatórios e comparações</h2>
          </div>
          <FileText aria-hidden="true" size={28} />
        </div>

        <div className="report-controls">
          <label>
            <span>Mês principal</span>
            <input
              onChange={(event) => onMonthChange(event.target.value)}
              type="month"
              value={selectedMonth}
            />
          </label>
          <label>
            <span>Comparar com</span>
            <input
              onChange={(event) => setComparisonMonth(event.target.value)}
              type="month"
              value={comparisonMonth}
            />
          </label>
          <label>
            <span>Evolução por</span>
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
        {TOTAL_ROWS.map(({ key, label }) => {
          const change = comparison.changes[key];
          return (
            <article className={`report-summary-card ${key}`} key={key}>
              <span>{label}</span>
              <strong>{formatCurrency(change.current)}</strong>
              <small className={change.difference > 0 ? "increase" : change.difference < 0 ? "decrease" : ""}>
                {formatChange(change)}
              </small>
            </article>
          );
        })}
      </section>

      <section className="panel report-comparison-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Comparação mensal</span>
            <h2>{formatMonthLabel(selectedMonth)} × {formatMonthLabel(comparisonMonth)}</h2>
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
              {TOTAL_ROWS.map(({ key, label }) => {
                const change = comparison.changes[key];
                return (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{formatCurrency(change.current)}</td>
                    <td>{formatCurrency(change.comparison)}</td>
                    <td className={change.difference > 0 ? "increase" : change.difference < 0 ? "decrease" : ""}>
                      {change.difference > 0 ? "+" : ""}{formatCurrency(change.difference)}
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
          <div>
            <span className="eyebrow">Evolução anual</span>
            <h2>Totais mensais de {year}</h2>
          </div>
          <strong>{formatCurrency(annualReport.total)}</strong>
        </div>

        <div className="report-annual-chart">
          {annualReport.months.map((month) => (
            <article className={month.monthKey === selectedMonth ? "selected" : ""} key={month.monthKey}>
              <div className="report-annual-bar" aria-hidden="true">
                <span style={{ height: `${month.total / annualMaximum * 100}%` }} />
              </div>
              <strong>{formatCurrency(month.total)}</strong>
              <span>{formatMonthName(month.monthKey).slice(0, 3)}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel report-dimension-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Detalhamento anual</span>
            <h2>Evolução por {DIMENSION_OPTIONS[dimension].toLocaleLowerCase("pt-BR")}</h2>
          </div>
          <TrendingUp aria-hidden="true" size={24} />
        </div>

        {dimensionRows.length ? (
          <div className="report-table-wrap">
            <table className="report-table report-dimension-table">
              <caption className="sr-only">
                Evolução mensal por {DIMENSION_OPTIONS[dimension].toLocaleLowerCase("pt-BR")} em {year}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{DIMENSION_OPTIONS[dimension]}</th>
                  {annualReport.months.map((month) => (
                    <th key={month.monthKey} scope="col">{formatMonthName(month.monthKey).slice(0, 3)}</th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {dimensionRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {row.months.map((month) => (
                      <td key={month.monthKey}>{formatCurrency(month.value)}</td>
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
