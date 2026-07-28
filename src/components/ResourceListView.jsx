import { useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { PAYMENT_TYPES } from "../config/people";
import { monthFromDate, roundMoney } from "../domain/expenses";
import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  normalizeSearchText,
} from "../utils/presentation";
import { ResourceMonthSwitcher } from "./MonthSwitcher";
import { MarketReceiptImporter } from "./ReceiptImporter";

export function ResourceListView({
  form,
  formError,
  items,
  kind,
  placeSuggestions,
  selectedMonth,
  onChange,
  onEdit,
  onDelete,
  onDeleteMonth,
  onMonthChange,
  onMarketReceiptSubmit,
  onSubmit,
}) {
  const isMarket = kind === "market";
  const [isDeletingMonth, setIsDeletingMonth] = useState(false);
  const monthlyItems = useMemo(
    () => items.filter((item) => {
      const itemDate = isMarket ? item.purchasedAt : item.paidAt;
      return (item.monthKey || monthFromDate(itemDate)) === selectedMonth;
    }),
    [isMarket, items, selectedMonth],
  );
  const monthlyTotal = useMemo(
    () => monthlyItems.reduce((total, item) => roundMoney(total + Number(item.totalValue || 0)), 0),
    [monthlyItems],
  );
  const totalPreview = roundMoney(
    Number(String(form.quantity || 0).replace(",", ".")) * Number(String(form.unitValue || 0).replace(",", ".")),
  );
  const dateField = isMarket ? "purchasedAt" : "paidAt";

  async function handleDeleteMonth() {
    setIsDeletingMonth(true);
    try {
      await onDeleteMonth(monthlyItems);
    } finally {
      setIsDeletingMonth(false);
    }
  }

  return (
    <div className="resource-page">
      {isMarket && <MarketReceiptImporter onConfirm={onMarketReceiptSubmit} />}

      <section className="panel resource-form-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Novo lançamento</span>
            <h2>{isMarket ? "Adicionar item de mercado" : "Adicionar outro pagamento"}</h2>
          </div>
          <strong className="resource-preview-total">{formatCurrency(totalPreview)}</strong>
        </div>

        <form className="form-grid resource-form" onSubmit={onSubmit}>
          <label>
            {isMarket ? "Mercado" : "Local"}
            {isMarket ? (
              <input
                value={form.market}
                onChange={(event) => onChange("market", event.target.value)}
                placeholder="Ex.: ARD"
              />
            ) : (
              <PlaceAutocomplete
                id="new-other-payment-place"
                value={form.place}
                suggestions={placeSuggestions}
                onChange={(value) => onChange("place", value)}
                placeholder="Ex.: Amazon"
              />
            )}
          </label>
          <label>
            Data
            <input type="date" value={form[dateField]} onChange={(event) => onChange(dateField, event.target.value)} />
          </label>
          <label>
            Produto
            <input value={form.product} onChange={(event) => onChange("product", event.target.value)} placeholder="Nome do produto" />
          </label>
          {isMarket ? (
            <label>
              Descrição
              <input value={form.description} onChange={(event) => onChange("description", event.target.value)} placeholder="Ex.: Alimentos" />
            </label>
          ) : (
            <label>
              Pagamento
              <select value={form.paymentMethod} onChange={(event) => onChange("paymentMethod", event.target.value)}>
                {PAYMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
          )}
          <label>
            Qtd
            <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => onChange("quantity", event.target.value)} />
          </label>
          <label>
            Valor unitário (€)
            <input type="number" min="0.01" step="0.01" value={form.unitValue} onChange={(event) => onChange("unitValue", event.target.value)} />
          </label>
          {formError && <p className="form-error resource-form-error" role="alert">{formError}</p>}
          <div className="resource-form-action">
            <button className="primary-button" type="submit"><Plus size={18} /> Adicionar à lista</button>
          </div>
        </form>
      </section>

      <section className="panel resource-list-panel">
        <div className="section-heading resource-list-heading">
          <div>
            <span className="eyebrow">Controle mensal</span>
            <h2>{formatMonthLabel(selectedMonth)}</h2>
          </div>
          <div className="resource-list-actions">
            <button
              className="resource-delete-month-button"
              type="button"
              disabled={!monthlyItems.length || isDeletingMonth}
              onClick={handleDeleteMonth}
            >
              {isDeletingMonth ? <LoaderCircle className="spin-icon" size={17} /> : <Trash2 size={17} />}
              {isDeletingMonth ? "Apagando…" : "Apagar lista do mês"}
            </button>
            <ResourceMonthSwitcher selectedMonth={selectedMonth} onMonthChange={onMonthChange} />
          </div>
        </div>

        <div className="resource-total-card">
          <span>Total do mês</span>
          <strong>{formatCurrency(monthlyTotal)}</strong>
          <small>{monthlyItems.length} {monthlyItems.length === 1 ? "lançamento" : "lançamentos"}</small>
        </div>

        <div className="resource-table-wrap">
          <table className="resource-table">
            <caption className="sr-only">
              {isMarket ? "Itens de mercado" : "Outros pagamentos"} de {formatMonthLabel(selectedMonth)}
            </caption>
            <thead>
              <tr>
                <th scope="col">{isMarket ? "Mercado" : "Local"}</th>
                <th scope="col">Data</th>
                <th scope="col">Produto</th>
                <th scope="col">{isMarket ? "Descrição" : "Pagamento"}</th>
                <th scope="col">Qtd</th>
                <th scope="col">Valor</th>
                <th scope="col">Total</th>
                <th aria-label="Ações" scope="col" />
              </tr>
            </thead>
            <tbody>
              {monthlyItems.map((item) => (
                <tr key={item.id}>
                  <td>{isMarket ? item.market : item.place}</td>
                  <td>{formatDate(isMarket ? item.purchasedAt : item.paidAt)}</td>
                  <td>{item.product}</td>
                  <td>{isMarket ? item.description || "-" : item.paymentMethod}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unitValue)}</td>
                  <td><strong>{formatCurrency(item.totalValue)}</strong></td>
                  <td>
                    <div className="resource-row-actions">
                      <button className="icon-button" title="Editar lançamento" type="button" onClick={() => onEdit(item)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-button danger-button" title="Excluir lançamento" type="button" onClick={() => onDelete(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!monthlyItems.length && <div className="empty-state">Nenhum lançamento neste mês.</div>}
        </div>
      </section>
    </div>
  );
}

export function PlaceAutocomplete({ id, value, suggestions, onChange, placeholder, required = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchValue = normalizeSearchText(value.trim());
  const filteredSuggestions = useMemo(() => {
    if (!searchValue) return [];

    return suggestions
      .filter((suggestion) => {
        const normalizedSuggestion = normalizeSearchText(suggestion);
        return normalizedSuggestion.includes(searchValue) && normalizedSuggestion !== searchValue;
      })
      .slice(0, 8);
  }, [searchValue, suggestions]);
  const showSuggestions = isOpen && filteredSuggestions.length > 0;

  function selectSuggestion(suggestion) {
    onChange(suggestion);
    setIsOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!filteredSuggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, filteredSuggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && showSuggestions) {
      event.preventDefault();
      selectSuggestion(filteredSuggestions[activeIndex]);
    }
  }

  return (
    <div
      className="place-autocomplete"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <input
        aria-autocomplete="list"
        aria-controls={`${id}-options`}
        aria-expanded={showSuggestions}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          setIsOpen(Boolean(event.target.value.trim()));
        }}
        onFocus={() => setIsOpen(Boolean(value.trim()))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        required={required}
      />
      {showSuggestions && (
        <div className="place-autocomplete-options" id={`${id}-options`} role="listbox">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              key={suggestion}
              onClick={() => selectSuggestion(suggestion)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              tabIndex={-1}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
