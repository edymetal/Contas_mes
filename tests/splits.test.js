import test from "node:test";
import assert from "node:assert/strict";
import {
  SPLIT_MODES,
  calculateSplitAmounts,
  createEqualSplitValues,
  getExpenseSplitConfiguration,
  serializeSplitValues,
} from "../src/domain/expenses.js";

test("rateio igual distribui todos os centavos sem alterar o total", () => {
  const result = calculateSplitAmounts(100, ["edney", "sonia", "rodney"]);

  assert.equal(result.isValid, true);
  assert.deepEqual(result.amounts, {
    edney: 33.34,
    sonia: 33.33,
    rodney: 33.33,
  });
  assert.equal(result.allocatedTotal, 100);
});

test("rateio percentual exige 100% e preserva o total monetário", () => {
  const result = calculateSplitAmounts(
    99.99,
    ["edney", "sonia", "rodney"],
    SPLIT_MODES.PERCENTAGE,
    { edney: 50, sonia: 30, rodney: 20 },
  );

  assert.equal(result.isValid, true);
  assert.deepEqual(result.amounts, {
    edney: 49.99,
    sonia: 30,
    rodney: 20,
  });
  assert.equal(result.allocatedTotal, 99.99);

  const invalid = calculateSplitAmounts(
    100,
    ["edney", "sonia"],
    SPLIT_MODES.PERCENTAGE,
    { edney: 60, sonia: 30 },
  );
  assert.equal(invalid.isValid, false);
  assert.match(invalid.error, /100%/);
});

test("rateio por valor valida a soma contra o total da conta", () => {
  const valid = calculateSplitAmounts(
    "80,50",
    ["edney", "sonia"],
    SPLIT_MODES.FIXED,
    { edney: "50,25", sonia: "30,25" },
  );
  assert.equal(valid.isValid, true);
  assert.deepEqual(valid.amounts, { edney: 50.25, sonia: 30.25 });

  const invalid = calculateSplitAmounts(
    80.5,
    ["edney", "sonia"],
    SPLIT_MODES.FIXED,
    { edney: 50, sonia: 20 },
  );
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.difference, 10.5);
});

test("configuração legada continua sendo interpretada como divisão igual", () => {
  const configuration = getExpenseSplitConfiguration({
    participants: ["edney", "sonia"],
    totalValue: 40,
    shares: {
      edney: { amount: 20, status: "self" },
      sonia: { amount: 20, status: "pending" },
    },
  });

  assert.deepEqual(configuration, { mode: SPLIT_MODES.EQUAL, values: {} });
});

test("gera valores iniciais e serializa somente participantes ativos", () => {
  assert.deepEqual(
    createEqualSplitValues(100, ["edney", "sonia", "rodney"], SPLIT_MODES.PERCENTAGE),
    { edney: 33.34, sonia: 33.33, rodney: 33.33 },
  );
  assert.deepEqual(
    serializeSplitValues(
      ["edney", "sonia"],
      SPLIT_MODES.FIXED,
      { edney: "60,50", sonia: 39.5, rodney: 10 },
    ),
    { edney: 60.5, sonia: 39.5 },
  );
});
