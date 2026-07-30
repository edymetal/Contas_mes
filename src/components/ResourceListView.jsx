import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PAYMENT_TYPES } from "../config/people";
import { monthFromDate, roundMoney } from "../domain/expenses";
import { normalizeMarketName } from "../domain/resources";
import { normalizeReceiptCategory } from "../services/receiptAnalysis";
import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  formatMonthName,
  normalizeSearchText,
} from "../utils/presentation";
import { MarketAnalysisModal } from "./MarketAnalysisModal";
import { ResourceMonthSwitcher } from "./MonthSwitcher";
import { MarketReceiptImporter } from "./ReceiptImporter";

const RESOURCE_SEARCH_COLUMNS = [
  { value: "all", marketLabel: "Todas as colunas", otherLabel: "Todas as colunas" },
  { value: "location", marketLabel: "Mercado", otherLabel: "Local" },
  { value: "date", marketLabel: "Data", otherLabel: "Data" },
  { value: "product", marketLabel: "Produto", otherLabel: "Produto" },
  { value: "detail", marketLabel: "Descrição", otherLabel: "Pagamento" },
  { value: "quantity", marketLabel: "Quantidade", otherLabel: "Quantidade" },
  { value: "unitValue", marketLabel: "Valor", otherLabel: "Valor" },
  { value: "totalValue", marketLabel: "Total", otherLabel: "Total" },
];

const RESOURCE_SORTABLE_COLUMNS = RESOURCE_SEARCH_COLUMNS.filter((column) => column.value !== "all");

function getMarketItemDescription(item) {
  return normalizeReceiptCategory(item.product, item.description);
}

function getResourceColumnLabel(column, isMarket) {
  return isMarket ? column.marketLabel : column.otherLabel;
}

function getResourceValuesByColumn(item, isMarket) {
  const itemDate = isMarket ? item.purchasedAt : item.paidAt;

  return {
    location: [isMarket ? normalizeMarketName(item.market) : item.place],
    date: [itemDate, formatDate(itemDate)],
    product: [item.product],
    detail: [isMarket ? getMarketItemDescription(item) : item.paymentMethod],
    quantity: [item.quantity],
    unitValue: [item.unitValue, formatCurrency(item.unitValue)],
    totalValue: [item.totalValue, formatCurrency(item.totalValue)],
  };
}

export function resourceItemMatchesSearch(item, searchTerm, searchColumn = "all", isMarket = true) {
  const normalizedSearchTerm = normalizeSearchText(searchTerm).trim();
  if (!normalizedSearchTerm) return true;

  const valuesByColumn = getResourceValuesByColumn(item, isMarket);
  const searchableValues = searchColumn === "all"
    ? Object.values(valuesByColumn).flat()
    : valuesByColumn[searchColumn] || [];

  return normalizeSearchText(searchableValues.filter((value) => (
    value !== undefined && value !== null
  )).join(" ")).includes(normalizedSearchTerm);
}

export function getResourceItemsForSearchScope(items, selectedMonth, searchScope, isMarket = true) {
  if (searchScope === "all") return items;

  const selectedYear = selectedMonth.slice(0, 4);
  return items.filter((item) => {
    const itemDate = isMarket ? item.purchasedAt : item.paidAt;
    const itemMonth = item.monthKey || monthFromDate(itemDate);

    return searchScope === "year"
      ? itemMonth.startsWith(`${selectedYear}-`)
      : itemMonth === selectedMonth;
  });
}

function getResourceSortValue(item, sortKey, isMarket) {
  const itemDate = isMarket ? item.purchasedAt : item.paidAt;
  const numericColumns = new Set(["quantity", "unitValue", "totalValue"]);
  const values = {
    location: isMarket ? normalizeMarketName(item.market) : item.place,
    date: itemDate,
    product: item.product,
    detail: isMarket ? getMarketItemDescription(item) : item.paymentMethod,
    quantity: item.quantity,
    unitValue: item.unitValue,
    totalValue: item.totalValue,
  };

  return numericColumns.has(sortKey) ? Number(values[sortKey] || 0) : values[sortKey] || "";
}

export function sortResourceItems(items, sortKey, sortDirection = "asc", isMarket = true) {
  if (!sortKey) return items;

  return items
    .map((item, index) => ({ item, index }))
    .sort((first, second) => {
      const firstValue = getResourceSortValue(first.item, sortKey, isMarket);
      const secondValue = getResourceSortValue(second.item, sortKey, isMarket);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : normalizeSearchText(firstValue).localeCompare(
          normalizeSearchText(secondValue),
          "pt-BR",
          { numeric: true },
        );

      if (comparison === 0) return first.index - second.index;
      return sortDirection === "desc" ? -comparison : comparison;
    })
    .map(({ item }) => item);
}

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
  const [searchTerm, setSearchTerm] = useState("");
  const [searchColumn, setSearchColumn] = useState("all");
  const [searchScope, setSearchScope] = useState("month");
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "asc" });
  const [resourceAnalysis, setResourceAnalysis] = useState(null);
  const hasSearchTerm = Boolean(normalizeSearchText(searchTerm).trim());
  const selectedYear = selectedMonth.slice(0, 4);
  const monthlyItems = useMemo(
    () => getResourceItemsForSearchScope(items, selectedMonth, "month", isMarket),
    [isMarket, items, selectedMonth],
  );
  const scopedItems = useMemo(
    () => getResourceItemsForSearchScope(items, selectedMonth, searchScope, isMarket),
    [isMarket, items, searchScope, selectedMonth],
  );
  const filteredItems = useMemo(
    () => scopedItems.filter((item) => (
      resourceItemMatchesSearch(item, searchTerm, searchColumn, isMarket)
    )),
    [isMarket, scopedItems, searchColumn, searchTerm],
  );
  const sortedItems = useMemo(
    () => sortResourceItems(filteredItems, sortConfig.key, sortConfig.direction, isMarket),
    [filteredItems, isMarket, sortConfig],
  );
  const filteredTotal = useMemo(
    () => filteredItems.reduce((total, item) => roundMoney(total + Number(item.totalValue || 0)), 0),
    [filteredItems],
  );
  const totalPreview = roundMoney(
    Number(String(form.quantity || 0).replace(",", ".")) * Number(String(form.unitValue || 0).replace(",", ".")),
  );
  const dateField = isMarket ? "purchasedAt" : "paidAt";
  const scopeTitle = {
    month: formatMonthLabel(selectedMonth),
    year: `Ano de ${selectedYear}`,
    all: "Toda a base de dados",
  }[searchScope];
  const scopeDescription = {
    month: `em ${formatMonthLabel(selectedMonth)}`,
    year: `no ano de ${selectedYear}`,
    all: "em toda a base de dados",
  }[searchScope];
  const totalLabel = {
    month: "Total do mês",
    year: "Total do ano",
    all: "Total de toda a base",
  }[searchScope];
  const displayedCount = hasSearchTerm
    ? `${filteredItems.length} de ${scopedItems.length} resultado(s)`
    : `${filteredItems.length} ${filteredItems.length === 1 ? "lançamento" : "lançamentos"}`;

  async function handleDeleteMonth() {
    setIsDeletingMonth(true);
    try {
      await onDeleteMonth(monthlyItems);
    } finally {
      setIsDeletingMonth(false);
    }
  }

  function handleSort(sortKey) {
    setSortConfig((current) => ({
      key: sortKey,
      direction: current.key === sortKey && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function openResourceAnalysis(type, item) {
    const fields = {
      market: "market",
      place: "place",
      product: "product",
      description: "description",
    };
    const fallbackLabels = {
      market: "Mercado não informado",
      place: "Local não informado",
      product: "Produto não informado",
      description: "Descrição não informada",
    };
    const value = type === "description"
      ? getMarketItemDescription(item)
      : type === "market"
        ? normalizeMarketName(item.market)
        : item[fields[type]];
    const fallbackLabel = fallbackLabels[type];
    const itemDate = isMarket ? item.purchasedAt : item.paidAt;
    const initialYear = (item.monthKey || monthFromDate(itemDate)).slice(0, 4);

    setResourceAnalysis({
      type,
      value: value || "",
      label: String(value || fallbackLabel).trim(),
      initialYear,
      kind: isMarket ? "market" : "other-payments",
    });
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
            <span className="eyebrow">Consulta de lançamentos</span>
            <h2>{scopeTitle}</h2>
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

        <div
          className="manage-search-toolbar resource-search-toolbar"
          role="search"
          aria-label={isMarket ? "Buscar itens de mercado" : "Buscar outros pagamentos"}
        >
          <div className="manage-search-control manage-search-field">
            <label htmlFor={`resource-search-${kind}`}>
              {isMarket ? "Buscar itens de mercado" : "Buscar pagamentos"}
            </label>
            <div className="manage-search">
              <Search aria-hidden="true" size={19} />
              <input
                id={`resource-search-${kind}`}
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
              {RESOURCE_SEARCH_COLUMNS.map((column) => (
                <option key={column.value} value={column.value}>
                  {getResourceColumnLabel(column, isMarket)}
                </option>
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

        <div className="resource-total-card">
          <span>{totalLabel}</span>
          <strong>{formatCurrency(filteredTotal)}</strong>
          <small aria-live="polite">{displayedCount}</small>
        </div>

        <div className="resource-table-wrap">
          <table className="resource-table">
            <caption className="sr-only">
              {isMarket ? "Itens de mercado" : "Outros pagamentos"} {scopeDescription}
            </caption>
            <thead>
              <tr>
                {RESOURCE_SORTABLE_COLUMNS.map((column) => {
                  const label = getResourceColumnLabel(column, isMarket);
                  const isActive = sortConfig.key === column.value;
                  const nextDirection = isActive && sortConfig.direction === "asc" ? "decrescente" : "crescente";

                  return (
                    <th
                      aria-sort={isActive ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                      className={column.value === "quantity" ? "resource-quantity-column" : undefined}
                      key={column.value}
                      scope="col"
                    >
                      <button
                        aria-label={`Ordenar por ${label} em ordem ${nextDirection}`}
                        className="table-sort-button"
                        onClick={() => handleSort(column.value)}
                        title={`Ordenar por ${label}`}
                        type="button"
                      >
                        <span>{label}</span>
                        {isActive
                          ? sortConfig.direction === "asc"
                            ? <ArrowUp aria-hidden="true" size={15} />
                            : <ArrowDown aria-hidden="true" size={15} />
                          : <ChevronsUpDown aria-hidden="true" size={15} />}
                      </button>
                    </th>
                  );
                })}
                <th aria-label="Ações" scope="col" />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    {isMarket ? (
                      <button
                        aria-label={`Ver dashboard do mercado ${normalizeMarketName(item.market) || "não informado"}`}
                        className="resource-analysis-trigger"
                        onClick={() => openResourceAnalysis("market", item)}
                        title="Ver dashboard do mercado"
                        type="button"
                      >
                        {normalizeMarketName(item.market) || "Mercado não informado"}
                      </button>
                    ) : (
                      <button
                        aria-label={`Ver dashboard do local ${item.place || "não informado"}`}
                        className="resource-analysis-trigger"
                        onClick={() => openResourceAnalysis("place", item)}
                        title="Ver dashboard do local"
                        type="button"
                      >
                        {item.place || "Local não informado"}
                      </button>
                    )}
                  </td>
                  <td>{formatDate(isMarket ? item.purchasedAt : item.paidAt)}</td>
                  <td>
                    <button
                      aria-label={`Ver dashboard do produto ${item.product || "não informado"}`}
                      className="resource-analysis-trigger"
                      onClick={() => openResourceAnalysis("product", item)}
                      title="Ver dashboard do produto"
                      type="button"
                    >
                      {item.product || "Produto não informado"}
                    </button>
                  </td>
                  <td>
                    {isMarket ? (
                      <button
                        aria-label={`Ver dashboard da descrição ${getMarketItemDescription(item) || "não informada"}`}
                        className="resource-analysis-trigger"
                        onClick={() => openResourceAnalysis("description", item)}
                        title="Ver dashboard da descrição"
                        type="button"
                      >
                        {getMarketItemDescription(item) || "Descrição não informada"}
                      </button>
                    ) : item.paymentMethod}
                  </td>
                  <td className="resource-quantity-column">{item.quantity}</td>
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
          {!filteredItems.length && (
            <div className="empty-state">
              {hasSearchTerm
                ? `Nenhum lançamento encontrado para “${searchTerm.trim()}” ${scopeDescription}.`
                : `Nenhum lançamento ${scopeDescription}.`}
            </div>
          )}
        </div>
      </section>

      {resourceAnalysis && (
        <MarketAnalysisModal
          analysis={resourceAnalysis}
          items={items}
          kind={resourceAnalysis.kind}
          onClose={() => setResourceAnalysis(null)}
          selectedMonth={selectedMonth}
        />
      )}
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
