import { useMemo, useState } from "react";
import {
  BarChart3,
  LoaderCircle,
  ShoppingCart,
  WalletCards,
} from "lucide-react";
import { MONTHS_PT } from "../config/forms";
import { monthFromDate, roundMoney } from "../domain/expenses";
import { formatCurrency, formatMonthName } from "../utils/presentation";
import { ResourceListView } from "./ResourceListView";

export function OtherAccountsView({
  dataLoading,
  marketForm,
  marketFormError,
  marketItems,
  otherPaymentForm,
  otherPaymentFormError,
  otherPaymentPlaceSuggestions,
  otherPayments,
  selectedMonth,
  onMarketChange,
  onOtherPaymentChange,
  onEditMarketItem,
  onEditOtherPayment,
  onDeleteMarketItem,
  onDeleteOtherPayment,
  onDeleteMarketMonth,
  onDeleteOtherPaymentMonth,
  onMonthChange,
  onMarketSubmit,
  onMarketReceiptSubmit,
  onOtherPaymentSubmit,
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const isDashboard = activeTab === "dashboard";
  const isMarket = activeTab === "market";

  return (
    <div className="other-accounts-page" aria-busy={dataLoading}>
      <div className="resource-tabs" role="tablist" aria-label="Tipo de lançamento">
        <button
          className={isDashboard ? "resource-tab active" : "resource-tab"}
          onClick={() => setActiveTab("dashboard")}
          role="tab"
          type="button"
          aria-selected={isDashboard}
        >
          <BarChart3 size={18} /> Painel
        </button>
        <button
          className={isMarket ? "resource-tab active" : "resource-tab"}
          onClick={() => setActiveTab("market")}
          role="tab"
          type="button"
          aria-selected={isMarket}
        >
          <ShoppingCart size={18} /> Mercado
        </button>
        <button
          className={activeTab === "other-payments" ? "resource-tab active" : "resource-tab"}
          onClick={() => setActiveTab("other-payments")}
          role="tab"
          type="button"
          aria-selected={!isMarket}
        >
          <WalletCards size={18} /> Outros pagamentos
        </button>
      </div>

      {dataLoading ? (
        <div className="panel empty-state" role="status" aria-live="polite">
          <LoaderCircle className="spin-icon" size={20} />
          Carregando lançamentos...
        </div>
      ) : isDashboard ? (
        <OtherAccountsDashboard
          marketItems={marketItems}
          otherPayments={otherPayments}
          selectedMonth={selectedMonth}
        />
      ) : (
        <ResourceListView
          form={isMarket ? marketForm : otherPaymentForm}
          formError={isMarket ? marketFormError : otherPaymentFormError}
          items={isMarket ? marketItems : otherPayments}
          kind={activeTab}
          placeSuggestions={otherPaymentPlaceSuggestions}
          selectedMonth={selectedMonth}
          onChange={isMarket ? onMarketChange : onOtherPaymentChange}
          onEdit={isMarket ? onEditMarketItem : onEditOtherPayment}
          onDelete={isMarket ? onDeleteMarketItem : onDeleteOtherPayment}
          onDeleteMonth={isMarket ? onDeleteMarketMonth : onDeleteOtherPaymentMonth}
          onMonthChange={onMonthChange}
          onSubmit={isMarket ? onMarketSubmit : onOtherPaymentSubmit}
          onMarketReceiptSubmit={onMarketReceiptSubmit}
        />
      )}
    </div>
  );
}

function OtherAccountsDashboard({ marketItems, otherPayments, selectedMonth }) {
  const selectedYear = selectedMonth.slice(0, 4);
  const dashboard = useMemo(() => {
    const marketYearItems = marketItems.filter((item) => (
      item.monthKey || monthFromDate(item.purchasedAt)
    ).startsWith(selectedYear));
    const otherYearItems = otherPayments.filter((item) => (
      item.monthKey || monthFromDate(item.paidAt)
    ).startsWith(selectedYear));
    const marketTotal = roundMoney(marketYearItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0));
    const otherTotal = roundMoney(otherYearItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0));
    const total = roundMoney(marketTotal + otherTotal);
    const count = marketYearItems.length + otherYearItems.length;
    const locations = new Map();
    const monthlyTotals = new Map(MONTHS_PT.map(({ value }) => [
      `${selectedYear}-${value}`,
      { market: 0, other: 0 },
    ]));

    marketYearItems.forEach((item) => {
      const monthKey = item.monthKey || monthFromDate(item.purchasedAt);
      const month = monthlyTotals.get(monthKey);
      if (month) month.market = roundMoney(month.market + Number(item.totalValue || 0));
      const label = String(item.market || "Mercado não informado").trim();
      const key = `market:${label.toLowerCase()}`;
      const current = locations.get(key) || { label, kind: "Mercado", total: 0, count: 0 };
      current.total = roundMoney(current.total + Number(item.totalValue || 0));
      current.count += 1;
      locations.set(key, current);
    });
    otherYearItems.forEach((item) => {
      const monthKey = item.monthKey || monthFromDate(item.paidAt);
      const month = monthlyTotals.get(monthKey);
      if (month) month.other = roundMoney(month.other + Number(item.totalValue || 0));
      const label = String(item.place || "Local não informado").trim();
      const key = `other:${label.toLowerCase()}`;
      const current = locations.get(key) || { label, kind: "Outros", total: 0, count: 0 };
      current.total = roundMoney(current.total + Number(item.totalValue || 0));
      current.count += 1;
      locations.set(key, current);
    });

    return {
      total,
      count,
      average: count ? roundMoney(total / count) : 0,
      market: {
        total: marketTotal,
        count: marketYearItems.length,
        percent: total ? (marketTotal / total) * 100 : 0,
        locations: new Set(marketYearItems.map((item) => item.market).filter(Boolean)).size,
      },
      other: {
        total: otherTotal,
        count: otherYearItems.length,
        percent: total ? (otherTotal / total) * 100 : 0,
        locations: new Set(otherYearItems.map((item) => item.place).filter(Boolean)).size,
      },
      months: [...monthlyTotals.entries()].map(([monthKey, values]) => ({
        monthKey,
        market: values.market,
        other: values.other,
        total: roundMoney(values.market + values.other),
      })),
      topLocations: [...locations.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    };
  }, [marketItems, otherPayments, selectedYear]);

  const largestLocationTotal = dashboard.topLocations[0]?.total || 0;

  return (
    <div className="other-dashboard">
      <section className="panel other-dashboard-hero">
        <div className="other-dashboard-toolbar">
          <div>
            <span className="eyebrow">Visão consolidada</span>
            <h2>Resumo anual de {selectedYear}</h2>
            <p>Totais do ano para Mercado e Outros pagamentos.</p>
          </div>
        </div>
        <div className="other-dashboard-total">
          <span>Total combinado em {selectedYear}</span>
          <strong>{formatCurrency(dashboard.total)}</strong>
          <small>{dashboard.count} {dashboard.count === 1 ? "lançamento" : "lançamentos"} • média de {formatCurrency(dashboard.average)}</small>
        </div>
      </section>

      <div className="other-dashboard-summary-grid">
        <article className="panel other-dashboard-type-card market">
          <div className="other-dashboard-card-heading">
            <span className="other-dashboard-type-icon"><ShoppingCart size={21} /></span>
            <div><span>Mercado em {selectedYear}</span><small>{dashboard.market.percent.toFixed(0)}% do total</small></div>
          </div>
          <strong>{formatCurrency(dashboard.market.total)}</strong>
          <div className="other-dashboard-card-meta">
            <span>{dashboard.market.count} itens</span>
            <span>{dashboard.market.locations} mercados</span>
          </div>
        </article>

        <article className="panel other-dashboard-type-card other">
          <div className="other-dashboard-card-heading">
            <span className="other-dashboard-type-icon"><WalletCards size={21} /></span>
            <div><span>Outros pagamentos em {selectedYear}</span><small>{dashboard.other.percent.toFixed(0)}% do total</small></div>
          </div>
          <strong>{formatCurrency(dashboard.other.total)}</strong>
          <div className="other-dashboard-card-meta">
            <span>{dashboard.other.count} lançamentos</span>
            <span>{dashboard.other.locations} locais</span>
          </div>
        </article>
      </div>

      <section className="panel other-dashboard-months">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Evolução anual</span>
            <h3>Valores por mês em {selectedYear}</h3>
          </div>
        </div>
        <div className="other-dashboard-month-table-wrap">
          <table className="other-dashboard-month-table">
            <caption className="sr-only">Totais mensais de outras contas em {selectedYear}</caption>
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Mercado</th>
                <th scope="col">Outros pagamentos</th>
                <th scope="col">Total combinado</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.months.map((month) => (
                <tr className={month.total ? "" : "is-empty"} key={month.monthKey}>
                  <th scope="row">{formatMonthName(month.monthKey)}</th>
                  <td>{formatCurrency(month.market)}</td>
                  <td>{formatCurrency(month.other)}</td>
                  <td><strong>{formatCurrency(month.total)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total de {selectedYear}</th>
                <td>{formatCurrency(dashboard.market.total)}</td>
                <td>{formatCurrency(dashboard.other.total)}</td>
                <td><strong>{formatCurrency(dashboard.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="other-dashboard-detail-grid">
        <section className="panel other-dashboard-distribution">
          <div className="section-heading">
            <div><span className="eyebrow">Distribuição</span><h3>Participação no ano</h3></div>
          </div>
          {[
            { label: "Mercado", value: dashboard.market.total, percent: dashboard.market.percent, className: "market" },
            { label: "Outros pagamentos", value: dashboard.other.total, percent: dashboard.other.percent, className: "other" },
          ].map((row) => (
            <div className="other-dashboard-distribution-row" key={row.label}>
              <div><span>{row.label}</span><strong>{formatCurrency(row.value)}</strong></div>
              <div className="other-dashboard-progress" aria-label={`${row.label}: ${row.percent.toFixed(0)}%`}>
                <span className={row.className} style={{ width: `${row.percent}%` }} />
              </div>
            </div>
          ))}
          {!dashboard.count && <div className="empty-state compact">Nenhum lançamento neste ano.</div>}
        </section>

        <section className="panel other-dashboard-locations">
          <div className="section-heading">
            <div><span className="eyebrow">Maiores gastos</span><h3>Principais locais</h3></div>
          </div>
          {dashboard.topLocations.length ? (
            <div className="other-dashboard-location-list">
              {dashboard.topLocations.map((location) => (
                <div className="other-dashboard-location" key={`${location.kind}-${location.label}`}>
                  <div className="other-dashboard-location-copy">
                    <strong>{location.label}</strong>
                    <span>{location.kind} • {location.count} {location.count === 1 ? "lançamento" : "lançamentos"}</span>
                  </div>
                  <strong>{formatCurrency(location.total)}</strong>
                  <div className="other-dashboard-location-bar"><span style={{ width: `${largestLocationTotal ? (location.total / largestLocationTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">Nenhum local para exibir.</div>
          )}
        </section>
      </div>
    </div>
  );
}
