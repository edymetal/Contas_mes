import { useMemo } from "react";
import { Check } from "lucide-react";
import { CATEGORIES, PEOPLE } from "../config/people";
import { roundMoney } from "../domain/expenses";
import { formatCurrency } from "../utils/presentation";

export function NewExpenseForm({
  form,
  formError,
  onChange,
  onSubmit,
  onToggleParticipant,
}) {
  const splitPreview = useMemo(() => {
    const totalValue = roundMoney(Number(String(form.totalValue).replace(",", ".")));
    if (!totalValue || !form.participants.length) return 0;

    return roundMoney(totalValue / form.participants.length);
  }, [form.totalValue, form.participants.length]);

  return (
    <section className="panel form-panel">
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <label>
            <span>Nome da despesa</span>
            <input
              placeholder="Aluguel, Internet, Seguro Carro"
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
            />
          </label>

          <label>
            <span>Tipo de Lançamento</span>
            <select
              value={form.type || "normal"}
              onChange={(event) => onChange("type", event.target.value)}
            >
              <option value="normal">Conta Única</option>
              <option value="installment">Parcelada (Cartão, etc.)</option>
              <option value="recurring">Fixa / Contínua (Mensal)</option>
            </select>
          </label>

          <label>
            <span>
              {form.type === "installment" ? "Valor da Parcela" : "Valor Mensal em euros"}
            </span>
            <input
              inputMode="decimal"
              placeholder="400,00"
              type="number"
              min="0"
              step="0.01"
              value={form.totalValue}
              onChange={(event) => onChange("totalValue", event.target.value)}
            />
          </label>

          {form.type === "installment" && (
            <>
              <label>
                <span>Vencimento da parcela atual</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => onChange("dueDate", event.target.value)}
                />
              </label>

              <label>
                <span>Parcela atual</span>
                <input
                  type="number"
                  min="1"
                  max={form.installmentsCount}
                  value={form.currentInstallment}
                  onChange={(event) => onChange("currentInstallment", Number(event.target.value))}
                />
              </label>

              <label>
                <span>Total de parcelas</span>
                <input
                  type="number"
                  min="1"
                  value={form.installmentsCount}
                  onChange={(event) => onChange(
                    "installmentsCount",
                    event.target.value === "" ? "" : Number(event.target.value),
                  )}
                />
              </label>
            </>
          )}

          {form.type === "normal" && (
            <>
              <label>
                <span>Data da despesa</span>
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) => onChange("expenseDate", event.target.value)}
                />
              </label>

              <label>
                <span>Forma de pagamento</span>
                <select
                  value={form.expensePaymentMethod || "Dinheiro"}
                  onChange={(event) => onChange("expensePaymentMethod", event.target.value)}
                >
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Personalizado">Personalizado</option>
                </select>
              </label>

              {form.expensePaymentMethod === "Personalizado" && (
                <label>
                  <span>Forma personalizada</span>
                  <input
                    placeholder="Ex: MB Way, cheque, vale"
                    value={form.customExpensePaymentMethod}
                    onChange={(event) => onChange(
                      "customExpensePaymentMethod",
                      event.target.value,
                    )}
                  />
                </label>
              )}

              <label>
                <span>Data de vencimento</span>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => onChange("dueDate", event.target.value)}
                />
              </label>
            </>
          )}

          {form.type === "recurring" && (
            <label>
              <span>Dia do vencimento</span>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(event) => onChange("dueDay", Number(event.target.value))}
              />
            </label>
          )}

          <label>
            <span>Categoria</span>
            <select value={form.category} onChange={(event) => onChange("category", event.target.value)}>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Quem pagou originalmente?</span>
            <select value={form.payerId} onChange={(event) => onChange("payerId", event.target.value)}>
              {PEOPLE.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {form.type !== "normal" && (
          <div
            style={{
              background: "var(--panel-muted)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              fontSize: "0.9rem",
              color: "var(--muted)",
            }}
          >
            {form.type === "installment" && (
              <p style={{ margin: 0 }}>
                💡 <strong>Conta Parcelada:</strong> Cada parcela tem o valor de{" "}
                <strong>{formatCurrency(form.totalValue)}</strong> (totalizando{" "}
                <strong>
                  {formatCurrency(Number(form.totalValue) * form.installmentsCount)}
                </strong>{" "}
                para a compra inteira de <strong>{form.installmentsCount} parcelas</strong>). Serão
                cadastradas todas as <strong>{form.installmentsCount} parcelas</strong>. Quando a
                parcela atual for maior que 1, as anteriores serão incluídas nos meses
                correspondentes como já pagas.
              </p>
            )}
            {form.type === "recurring" && (
              <p style={{ margin: 0 }}>
                💡 <strong>Conta Fixa:</strong> Esta despesa de{" "}
                <strong>{formatCurrency(form.totalValue)}</strong> será replicada mensalmente pelos
                próximos <strong>12 meses</strong>.
              </p>
            )}
          </div>
        )}

        <fieldset className="people-fieldset">
          <legend>Quem deve participar do rateio?</legend>
          <div className="checkbox-grid">
            {PEOPLE.map((person) => (
              <label className="checkbox-card" key={person.id}>
                <input
                  checked={form.participants.includes(person.id)}
                  onChange={() => onToggleParticipant(person.id)}
                  type="checkbox"
                />
                <span>{person.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="split-preview">
          <span>Valor por pessoa (por mês)</span>
          <strong>{formatCurrency(splitPreview)}</strong>
        </div>

        {formError && <div className="error-box">{formError}</div>}

        <button className="primary-button" type="submit">
          <Check size={18} />
          Salvar conta
        </button>
      </form>
    </section>
  );
}
