import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Pencil, Trash2 } from "lucide-react";
import { ResourceMonthSwitcher } from "./MonthSwitcher";
import { PersonAvatar } from "./PersonExpenses";
import { PAYMENT_TYPES, getPersonById } from "../config/people";
import { roundMoney } from "../domain/expenses";
import {
  getSettlementAccountingMonth,
  hasLaterSettlementPayment,
} from "../domain/settlements";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import {
  formatCurrency,
  formatDate,
  formatMonthLabel,
  getPaidAtMonthKey,
  getPersonPhotoUrl,
  getShare,
  personName,
  todayInputValue,
} from "../utils/presentation";

export function PaymentModal({ form, onChange, onClose, onSubmit, target }) {
  const { expense, personId } = target;
  const share = getShare(expense, personId);
  const dialogRef = useDialogAccessibility(onClose);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="payment-title"
        aria-modal="true"
        className="modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="section-heading">
          <div>
            <h2 id="payment-title">Registrar pagamento</h2>
            <span>
              {expense.title} • {formatCurrency(share?.amount)}
            </span>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <label>
            <span>Data do pagamento</span>
            <input
              type="date"
              value={form.paidAt}
              onChange={(event) => onChange((current) => ({ ...current, paidAt: event.target.value }))}
            />
          </label>

          <label>
            <span>Tipo de pagamento</span>
            <select value={form.type} onChange={(event) => onChange((current) => ({ ...current, type: event.target.value }))}>
              {PAYMENT_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Descrição opcional</span>
            <textarea
              rows="3"
              value={form.description}
              onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button" type="submit">
              Confirmar pagamento
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
export function SettlementPanel({
  firebaseUser,
  onDeletePayment,
  onRegisterPayment,
  onUpdatePayment,
  onMonthChange,
  rows = [],
  selectedMonth,
  settlementPayments = [],
  userProfiles = {},
}) {
  const pendingRows = useMemo(
    () => rows.filter((row) => Number(row.amount || 0) > 0),
    [rows],
  );
  const [paymentForms, setPaymentForms] = useState({});
  const [activeSettlementKey, setActiveSettlementKey] = useState(
    () => pendingRows[0] ? getRowKey(pendingRows[0]) : null,
  );
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editingPaymentForm, setEditingPaymentForm] = useState({
    amount: "",
    paidAt: todayInputValue(),
    type: "PIX",
    description: "",
  });
  const filteredSettlementPayments = useMemo(
    () => settlementPayments.filter(
      (payment) => getSettlementAccountingMonth(payment) === selectedMonth,
    ),
    [selectedMonth, settlementPayments],
  );
  const paymentsByMonth = useMemo(() => {
    const grouped = filteredSettlementPayments.reduce((acc, payment) => {
      const monthKey = getPaidAtMonthKey(payment);
      const currentGroup = acc.get(monthKey) || {
        monthKey,
        total: 0,
        payments: [],
      };

      currentGroup.total = roundMoney(currentGroup.total + Number(payment.amount || 0));
      currentGroup.payments.push(payment);
      acc.set(monthKey, currentGroup);
      return acc;
    }, new Map());

    return Array.from(grouped.values()).sort((a, b) => (b.monthKey || "").localeCompare(a.monthKey || ""));
  }, [filteredSettlementPayments]);

  function getRowKey(row) {
    return `${row.fromId}->${row.toId}`;
  }

  function getPaymentForm(row) {
    return paymentForms[getRowKey(row)] || {
      amount: "",
      paidAt: todayInputValue(),
      type: "PIX",
      description: "",
    };
  }

  useEffect(() => {
    if (!pendingRows.length) {
      setActiveSettlementKey(null);
      return;
    }

    if (!activeSettlementKey || !pendingRows.some((row) => getRowKey(row) === activeSettlementKey)) {
      setActiveSettlementKey(getRowKey(pendingRows[0]));
    }
  }, [activeSettlementKey, pendingRows]);

  useEffect(() => {
    if (editingPaymentId && !filteredSettlementPayments.some((payment) => payment.id === editingPaymentId)) {
      setEditingPaymentId(null);
    }
  }, [editingPaymentId, filteredSettlementPayments]);

  function updatePaymentForm(row, field, value) {
    const key = getRowKey(row);
    setPaymentForms((current) => ({
      ...current,
      [key]: {
        ...getPaymentForm(row),
        ...current[key],
        [field]: value,
      },
    }));
  }

  async function submitPayment(event, row, amountOverride) {
    event?.preventDefault();
    const key = getRowKey(row);
    const form = getPaymentForm(row);
    const saved = await onRegisterPayment(row, {
      ...form,
      amount: amountOverride ?? form.amount,
    });

    if (!saved) return;

    setPaymentForms((current) => ({
      ...current,
      [key]: {
        ...form,
        amount: "",
        description: "",
      },
    }));
  }

  function startEditingPayment(payment) {
    setEditingPaymentId(payment.id);
    setEditingPaymentForm({
      amount: String(payment.amount || ""),
      paidAt: payment.paidAt || todayInputValue(),
      type: payment.type || "PIX",
      description: payment.description || "",
    });
  }

  async function submitPaymentEdit(event, payment) {
    event.preventDefault();
    const saved = await onUpdatePayment(payment, editingPaymentForm);
    if (!saved) return;

    setEditingPaymentId(null);
    setEditingPaymentForm({
      amount: "",
      paidAt: todayInputValue(),
      type: "PIX",
      description: "",
    });
  }

  const selectedRow = pendingRows.find((row) => getRowKey(row) === activeSettlementKey);

  return (
    <section className="panel">
      <div className="section-heading settlement-history-heading">
        <div>
          <h2>Acertos calculados</h2>
          <span>{pendingRows.length} acerto(s) pendente(s) em {formatMonthLabel(selectedMonth)}</span>
        </div>
        <ResourceMonthSwitcher
          selectedMonth={selectedMonth}
          onMonthChange={onMonthChange}
        />
      </div>

      {!pendingRows.length ? (
        <div className="empty-state">Nenhuma dívida pendente neste mês.</div>
      ) : (
        <>
          <div className="settlement-selector" aria-label="Escolha o saldo para visualizar">
            {pendingRows.map((row) => {
              const key = getRowKey(row);
              const isActive = key === activeSettlementKey;

              return (
                <button
                  className={`settlement-person-tab${isActive ? " active" : ""}`}
                  key={key}
                  onClick={() => setActiveSettlementKey((current) => (current === key ? null : key))}
                  type="button"
                  aria-expanded={isActive}
                >
                  <span>{personName(row.fromId)}</span>
                  <small>{formatCurrency(row.amount)}</small>
                </button>
              );
            })}
          </div>

          {selectedRow ? (
            <div className="settlement-grid">
              {[selectedRow].map((row) => {
            const form = getPaymentForm(row);

            return (
              <article className="settlement-card settlement-payment-card" key={getRowKey(row)}>
                <div className="settlement-card-heading">
                  <div className="settlement-people">
                    <div>
                      <span>Quem paga</span>
                      <strong>{personName(row.fromId)}</strong>
                    </div>
                    <ArrowRightLeft size={20} />
                    <div>
                      <span>Quem recebe</span>
                      <strong>{personName(row.toId)}</strong>
                    </div>
                  </div>
                </div>

                <div className="settlement-balance-summary" aria-label="Resumo do saldo">
                  <div>
                    <span>Total da dívida</span>
                    <strong>{formatCurrency(row.originalAmount)}</strong>
                  </div>
                  <div>
                    <span>Abatido</span>
                    <strong>{formatCurrency(row.crossPaidAmount)}</strong>
                  </div>
                  <div>
                    <span>Pago</span>
                    <strong>{formatCurrency(row.paidAmount)}</strong>
                  </div>
                  <div className="settlement-remaining-box">
                    <span>Restante</span>
                    <strong>{formatCurrency(row.amount)}</strong>
                  </div>
                </div>

                <form className="settlement-payment-form" onSubmit={(event) => submitPayment(event, row)}>
                    <div className="settlement-form-title">
                      <strong>Registrar pagamento</strong>
                      <span>Informe um valor parcial ou quite o restante da dívida.</span>
                    </div>

                    <label>
                      <span>Valor do pagamento</span>
                      <input
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        type="number"
                        value={form.amount}
                        onChange={(event) => updatePaymentForm(row, "amount", event.target.value)}
                        placeholder={String(row.amount).replace(".", ",")}
                        required
                      />
                    </label>

                    <label>
                      <span>Data</span>
                      <input
                        type="date"
                        value={form.paidAt}
                        onChange={(event) => updatePaymentForm(row, "paidAt", event.target.value)}
                      />
                    </label>

                    <label>
                      <span>Tipo</span>
                      <select value={form.type} onChange={(event) => updatePaymentForm(row, "type", event.target.value)}>
                        {PAYMENT_TYPES.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>

                    <label className="settlement-description-field">
                      <span>Descrição opcional</span>
                      <input
                        value={form.description}
                        onChange={(event) => updatePaymentForm(row, "description", event.target.value)}
                        placeholder="Ex: transferência recebida"
                      />
                    </label>

                    <div className="settlement-payment-actions">
                      <button className="primary-button" type="submit">
                        Pagamento
                      </button>
                      <button
                        className="secondary-button"
                        onClick={(event) => submitPayment(event, row, row.amount)}
                        type="button"
                      >
                        Pagar Tudo
                      </button>
                    </div>
                </form>
              </article>
            );
              })}
            </div>
          ) : null}
        </>
      )}

      <div className="settlement-history">
        <div className="section-heading settlement-history-heading">
          <div>
            <h2>Histórico de pagamentos</h2>
            <span>
              {filteredSettlementPayments.length} pagamento(s) referente(s) a {formatMonthLabel(selectedMonth)}
            </span>
          </div>
        </div>

        {!filteredSettlementPayments.length ? (
          <div className="empty-state settlement-history-empty">
            Nenhum pagamento referente a {formatMonthLabel(selectedMonth)}.
          </div>
        ) : (
          <div className="settlement-history-list">
            {paymentsByMonth.map((group) => (
              <section className="settlement-history-month" key={group.monthKey}>
                <div className="settlement-history-month-heading">
                  <h3>{formatMonthLabel(group.monthKey)}</h3>
                  <span>{formatCurrency(group.total)}</span>
                </div>

                <div className="settlement-history-month-list">
                  {group.payments.map((payment) => {
                    const isEditing = editingPaymentId === payment.id;
                    const hasLaterPayment = hasLaterSettlementPayment(payment, settlementPayments);
                    const fromPerson = getPersonById(payment.fromId) || {
                      id: payment.fromId,
                      name: personName(payment.fromId),
                    };
                    const toPerson = getPersonById(payment.toId) || {
                      id: payment.toId,
                      name: personName(payment.toId),
                    };

                    return (
                      <article className="settlement-history-item" key={payment.id}>
                  {isEditing ? (
                    <form className="settlement-history-edit" onSubmit={(event) => submitPaymentEdit(event, payment)}>
                      <label>
                        <span>Valor</span>
                        <input
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          type="number"
                          value={editingPaymentForm.amount}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, amount: event.target.value }))
                          }
                          readOnly={hasLaterPayment}
                          title={hasLaterPayment ? "Ajuste primeiro os pagamentos mais recentes deste acerto." : ""}
                          required
                        />
                      </label>

                      <label>
                        <span>Data</span>
                        <input
                          type="date"
                          value={editingPaymentForm.paidAt}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, paidAt: event.target.value }))
                          }
                        />
                      </label>

                      <label>
                        <span>Tipo</span>
                        <select
                          value={editingPaymentForm.type}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, type: event.target.value }))
                          }
                        >
                          {PAYMENT_TYPES.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>

                      <label className="settlement-history-description">
                        <span>Descrição</span>
                        <input
                          value={editingPaymentForm.description}
                          onChange={(event) =>
                            setEditingPaymentForm((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Ex: transferencia recebida"
                        />
                      </label>

                      {hasLaterPayment && (
                        <small className="settlement-history-description">
                          O valor está protegido porque há pagamentos posteriores. Data, tipo e descrição ainda podem ser editados.
                        </small>
                      )}

                      <div className="settlement-history-actions">
                        <button className="primary-button" type="submit">
                          Salvar
                        </button>
                        <button className="secondary-button" onClick={() => setEditingPaymentId(null)} type="button">
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="settlement-history-main">
                        <strong>{formatCurrency(payment.amount)}</strong>
                        <div className="settlement-history-people">
                          <div className="settlement-history-person">
                            <PersonAvatar
                              decorative
                              person={fromPerson}
                              photoUrl={getPersonPhotoUrl(fromPerson, firebaseUser, userProfiles)}
                              size="small"
                            />
                            <span>{fromPerson.name}</span>
                          </div>
                          <span className="settlement-history-verb">pagou</span>
                          <div className="settlement-history-person">
                            <PersonAvatar
                              decorative
                              person={toPerson}
                              photoUrl={getPersonPhotoUrl(toPerson, firebaseUser, userProfiles)}
                              size="small"
                            />
                            <span>{toPerson.name}</span>
                          </div>
                        </div>
                        <small>
                          {formatDate(payment.paidAt)} - {payment.type || "PIX"}
                          {payment.description ? ` - ${payment.description}` : ""}
                        </small>
                        <small>Referente a {formatMonthLabel(payment.monthKey)}</small>
                      </div>

                      <div className="settlement-history-actions">
                        <button
                          className="icon-button"
                          onClick={() => startEditingPayment(payment)}
                          title="Editar pagamento"
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => onDeletePayment(payment)}
                          title={hasLaterPayment ? "Apague primeiro os pagamentos mais recentes deste acerto" : "Apagar pagamento"}
                          type="button"
                          disabled={hasLaterPayment}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
