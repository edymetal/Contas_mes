import { useMemo } from "react";
import { Equal, Percent, Scale } from "lucide-react";
import { PEOPLE } from "../config/people";
import {
  SPLIT_MODES,
  calculateSplitAmounts,
  createEqualSplitValues,
  normalizeSplitMode,
} from "../domain/expenses";
import { formatCurrency } from "../utils/presentation";

const MODE_OPTIONS = [
  {
    value: SPLIT_MODES.EQUAL,
    label: "Divisão igual",
    description: "O sistema divide o total automaticamente entre os participantes.",
    icon: Equal,
  },
  {
    value: SPLIT_MODES.PERCENTAGE,
    label: "Por percentual",
    description: "Defina qual porcentagem da conta pertence a cada pessoa.",
    icon: Percent,
  },
  {
    value: SPLIT_MODES.FIXED,
    label: "Por valor",
    description: "Informe diretamente quanto cabe a cada pessoa.",
    icon: Scale,
  },
];

export function SplitAllocationFields({
  participants,
  splitMode,
  splitValues,
  totalValue,
  onModeChange,
  onValuesChange,
}) {
  const mode = normalizeSplitMode(splitMode);
  const result = useMemo(
    () => calculateSplitAmounts(totalValue, participants, mode, splitValues),
    [mode, participants, splitValues, totalValue],
  );
  const selectedPeople = PEOPLE.filter((person) => participants.includes(person.id));
  const currentOption = MODE_OPTIONS.find((option) => option.value === mode);

  function changeMode(nextMode) {
    onModeChange(nextMode);
    onValuesChange(createEqualSplitValues(totalValue, participants, nextMode));
  }

  function distributeEqually() {
    onValuesChange(createEqualSplitValues(totalValue, participants, mode));
  }

  function updatePersonValue(personId, value) {
    onValuesChange({
      ...(splitValues || {}),
      [personId]: value,
    });
  }

  return (
    <fieldset className="split-allocation-fieldset">
      <legend>Como deseja dividir esta conta?</legend>

      <div className="split-mode-grid">
        {MODE_OPTIONS.map(({ description, icon: Icon, label, value }) => (
          <label className={`split-mode-option ${mode === value ? "selected" : ""}`} key={value}>
            <input
              checked={mode === value}
              name="split-mode"
              onChange={() => changeMode(value)}
              type="radio"
              value={value}
            />
            <Icon aria-hidden="true" size={19} />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </div>

      {!!selectedPeople.length && (
        <div className="split-allocation-editor">
          <div className="split-allocation-heading">
            <div>
              <strong>{currentOption?.label}</strong>
              <small>
                {mode === SPLIT_MODES.EQUAL
                  ? "Os centavos restantes são distribuídos automaticamente."
                  : "A soma precisa corresponder ao total da conta."}
              </small>
            </div>
            {mode !== SPLIT_MODES.EQUAL && (
              <button className="secondary-button compact-button" onClick={distributeEqually} type="button">
                Distribuir igualmente
              </button>
            )}
          </div>

          <div className="split-person-list">
            {selectedPeople.map((person) => (
              <div className="split-person-row" key={person.id}>
                <span>{person.name}</span>
                {mode === SPLIT_MODES.EQUAL ? (
                  <strong>{formatCurrency(result.amounts[person.id] || 0)}</strong>
                ) : (
                  <>
                    <label>
                      <span className="sr-only">
                        {mode === SPLIT_MODES.PERCENTAGE ? "Percentual" : "Valor"} de {person.name}
                      </span>
                      <input
                        inputMode="decimal"
                        min="0"
                        onChange={(event) => updatePersonValue(person.id, event.target.value)}
                        step="0.01"
                        type="number"
                        value={splitValues?.[person.id] ?? ""}
                      />
                      <span aria-hidden="true">{mode === SPLIT_MODES.PERCENTAGE ? "%" : "€"}</span>
                    </label>
                    <strong>{formatCurrency(result.amounts[person.id] || 0)}</strong>
                  </>
                )}
              </div>
            ))}
          </div>

          <div
            aria-live="polite"
            className={`split-allocation-summary ${result.isValid ? "valid" : "invalid"}`}
          >
            <span>
              {mode === SPLIT_MODES.PERCENTAGE
                ? `Percentual informado: ${result.inputTotal}%`
                : `Total distribuído: ${formatCurrency(result.allocatedTotal)}`}
            </span>
            <strong>{result.isValid ? "Rateio completo" : result.error}</strong>
          </div>
        </div>
      )}
    </fieldset>
  );
}
