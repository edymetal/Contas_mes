import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryTag } from "./CategoryTag";
import { MONTHS_PT } from "../config/forms";
import { getPersonById } from "../config/people";
import {
  formatInstallmentLabel,
  isSettledStatus,
  roundMoney,
  shiftMonth,
} from "../domain/expenses";
import { calculatePersonSettlementSummary } from "../domain/settlements";
import {
  formatCurrency,
  formatDate,
  formatEmail,
  formatMonthName,
  formatSignedCurrency,
  getPersonInitials,
  getPersonPhotoUrl,
  getShare,
  personName,
} from "../utils/presentation";

export function PersonExpenses({
  expenses,
  firebaseUser,
  personId,
  selectedMonth,
  onMonthChange,
  settlementPayments = [],
  userProfiles = {},
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(2026);
  const containerRef = useRef(null);

  useEffect(() => {
    if (selectedMonth) {
      const year = Number(selectedMonth.split("-")[0]);
      if (!isNaN(year)) {
        setPickerYear(year);
      }
    }
  }, [selectedMonth]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsPickerOpen(false);
      }
    }
    if (isPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsPickerOpen(false);
      }
    }
    if (isPickerOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPickerOpen]);

  const personExpenses = expenses.filter((expense) => expense.participants?.includes(personId));
  const expensesByPayer = useMemo(() => {
    const groups = [];
    const groupByPayerId = new Map();

    personExpenses.forEach((expense) => {
      let group = groupByPayerId.get(expense.payerId);

      if (!group) {
        group = {
          payerId: expense.payerId,
          expenses: [],
          totalAmount: 0,
        };
        groupByPayerId.set(expense.payerId, group);
        groups.push(group);
      }

      group.expenses.push(expense);
      group.totalAmount = roundMoney(
        group.totalAmount + Number(getShare(expense, personId)?.amount || 0),
      );
    });

    return groups;
  }, [personExpenses]);
  const selectedPerson = getPersonById(personId);
  const selectedPersonPhotoUrl = getPersonPhotoUrl(selectedPerson, firebaseUser, userProfiles);
  const paymentSummary = useMemo(
    () => calculatePersonSettlementSummary(
      expenses,
      settlementPayments,
      personId,
    ),
    [expenses, settlementPayments, personId],
  );

  const formattedMonthName = useMemo(() => {
    if (!selectedMonth) return "";
    return formatMonthName(selectedMonth);
  }, [selectedMonth]);

  function handlePrevMonth() {
    onMonthChange(shiftMonth(selectedMonth, -1));
  }

  function handleNextMonth() {
    onMonthChange(shiftMonth(selectedMonth, 1));
  }

  return (
    <section className="panel">
      <div className="section-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2>Contas de {selectedPerson.name}</h2>
          <span>{personExpenses.length} registro(s)</span>
        </div>

        <div className="person-month-switcher" ref={containerRef}>
          <button
            type="button"
            className="icon-button"
            onClick={handlePrevMonth}
            title="Mês Anterior"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            className={`person-month-picker-btn ${isPickerOpen ? "active" : ""}`}
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            title="Escolher mês"
          >
            <Calendar size={16} className="picker-icon" />
            <span>{formattedMonthName}</span>
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={handleNextMonth}
            title="Próximo Mês"
          >
            <ChevronRight size={18} />
          </button>

          {isPickerOpen && (
            <div className="custom-month-dropdown">
              <div className="picker-year-header">
                <button
                  type="button"
                  className="year-nav-btn"
                  onClick={() => setPickerYear((prev) => prev - 1)}
                  title="Ano Anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="picker-year-display">{pickerYear}</span>
                <button
                  type="button"
                  className="year-nav-btn"
                  onClick={() => setPickerYear((prev) => prev + 1)}
                  title="Próximo Ano"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="picker-months-grid">
                {MONTHS_PT.map((m) => {
                  const monthValue = `${pickerYear}-${m.value}`;
                  const isSelected = selectedMonth === monthValue;

                  return (
                    <button
                      key={m.value}
                      type="button"
                      className={`picker-month-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        onMonthChange(monthValue);
                        setIsPickerOpen(false);
                      }}
                    >
                      {m.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="person-payment-summary">
        <div className="person-debt-grid">
          {paymentSummary.totalsByPayer.map(({
            person,
            originalAmount,
            paidAmount,
            abatedAmount,
            amount,
            receivableAmount,
          }) => {
            const photoUrl = getPersonPhotoUrl(person, firebaseUser, userProfiles);
            const hasReceivableAmount = receivableAmount > 0;
            const mainAmount = hasReceivableAmount ? receivableAmount : amount;
            const mainAmountClassName = hasReceivableAmount ? "money-positive" : "money-negative";
            const mainAmountSign = hasReceivableAmount ? "positive" : "negative";

            return (
              <div className="person-debt-card" key={person.id}>
                <div className="person-debt-person">
                  <PersonAvatar person={person} photoUrl={photoUrl} />
                  <div>
                    <strong>{person.name}</strong>
                    <small>{formatEmail(person.email)}</small>
                  </div>
                </div>
                <strong className={`person-debt-amount ${mainAmountClassName}`}>
                  {formatSignedCurrency(mainAmount, mainAmountSign)}
                </strong>
                <div className="person-debt-breakdown">
                  <small className="debt-total">Dívida: {formatSignedCurrency(originalAmount, "negative")}</small>
                  <small className="debt-paid">Pago: {formatCurrency(paidAmount)}</small>
                  <small className="debt-abated">Abatido: {formatCurrency(abatedAmount)}</small>
                  <small className="debt-receivable">Receber {person.name}: {formatSignedCurrency(receivableAmount, "positive")}</small>
                </div>
              </div>
            );
          })}
        </div>

        <div className="person-total-card">
          <div className="person-summary-person">
            <PersonAvatar person={selectedPerson} photoUrl={selectedPersonPhotoUrl} size="large" />
            <div>
              <strong>{selectedPerson.name}</strong>
              <small>{formatEmail(selectedPerson.email)}</small>
            </div>
          </div>
          <div className="person-total-main">
            <span>Total Mês</span>
            <strong className="money-negative">{formatSignedCurrency(paymentSummary.totals.amount, "negative")}</strong>
          </div>
          <div className="person-debt-breakdown">
            <small className="debt-total">Dívida: {formatSignedCurrency(paymentSummary.totals.originalAmount, "negative")}</small>
            <small className="debt-paid">Pago: {formatCurrency(paymentSummary.totals.paidAmount)}</small>
            <small className="debt-abated">
              <span>Abatido</span>
              {paymentSummary.totalsByPayer.map(({ person, abatedAmount }) => (
                <span key={`abated-${person.id}`}>
                  {person.name}: {formatCurrency(abatedAmount)}
                </span>
              ))}
            </small>
          </div>
        </div>
      </div>

      <section className="person-expense-section" aria-labelledby="person-expense-list-title">
        <div className="person-expense-section-heading">
          <div>
            <span>Detalhamento</span>
            <h3 id="person-expense-list-title">Lista de contas</h3>
          </div>
          <small>
            {personExpenses.length} {personExpenses.length === 1 ? "conta no mês" : "contas no mês"}
          </small>
        </div>

        {!personExpenses.length ? (
          <div className="empty-state">Nenhuma conta para este mês.</div>
        ) : (
          <div className="expense-list">
            {expensesByPayer.map(({ payerId, expenses: payerExpenses, totalAmount }) => {
              const payer = getPersonById(payerId);
              const payerPhotoUrl = getPersonPhotoUrl(payer, firebaseUser, userProfiles);

              return (
                <section className="expense-payer-group" key={payerId} aria-label={`Contas pagas por ${personName(payerId)}`}>
                  <div className="expense-payer-divider">
                    <div className="expense-payer-label">
                      <PersonAvatar person={payer} photoUrl={payerPhotoUrl} />
                      <strong>{personName(payerId)}</strong>
                    </div>
                    <small>
                      {payerExpenses.length} {payerExpenses.length === 1 ? "conta" : "contas"} · Total:{" "}
                      {formatCurrency(totalAmount)}
                    </small>
                  </div>

                  <div className="expense-payer-items">
                    {payerExpenses.map((expense) => {
                      const share = getShare(expense, personId);
                      const isPayer = expense.payerId === personId;
                      const displayStatus = isPayer ? "self" : share?.status;
                      const isPaidOrSettled = isSettledStatus(displayStatus);
                      const amountClassName = isPaidOrSettled ? "money-positive" : "money-negative";
                      const amountLabel = isPaidOrSettled
                        ? formatCurrency(share?.amount)
                        : formatSignedCurrency(share?.amount, "negative");

                      return (
                        <article className="expense-card" key={expense.id}>
                          <div className="expense-main">
                            <h3>{expense.title}</h3>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <CategoryTag category={expense.category} />
                              {expense.installment && (
                                <span className="tag" style={{ background: "var(--panel-muted)", color: "var(--muted)", borderColor: "var(--line)" }}>
                                  {formatInstallmentLabel(expense.installment)}
                                </span>
                              )}
                            </div>
                            <p>Vencimento: {formatDate(expense.dueDate)}</p>
                          </div>

                          <div className="expense-side">
                            <strong className={amountClassName}>{amountLabel}</strong>
                            <StatusBadge status={displayStatus} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

export function PersonAvatar({ decorative = false, person, photoUrl, size = "default" }) {
  const className = `person-avatar ${size === "large" ? "large" : size === "small" ? "small" : ""}`.trim();

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={decorative ? "" : person.name}
        className={className}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div aria-hidden={decorative || undefined} className={`${className} placeholder`}>
      {getPersonInitials(person)}
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = {
    pending: "Pendente",
    paid: "Pago",
    settled: "Liquidado",
    self: "Pago",
  };

  return <span className={`status-badge ${status}`}>{labels[status] || "Pendente"}</span>;
}
