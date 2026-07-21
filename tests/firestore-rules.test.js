import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const compactRules = rules.replace(/\s+/g, " ");

test("exige conta autenticada com e-mail verificado", () => {
  assert.match(compactRules, /request\.auth != null/);
  assert.match(compactRules, /request\.auth\.token\.email is string/);
  assert.match(compactRules, /request\.auth\.token\.email_verified == true/);
});

for (const [collectionName, idName] of [
  ["expenses", "expenseId"],
  ["settlements", "settlementId"],
  ["marketItems", "itemId"],
  ["marketReceipts", "receiptId"],
  ["otherPayments", "paymentId"],
]) {
  test(`mantém escritas de ${collectionName} exclusivas para administradores`, () => {
    const collectionPolicy = new RegExp(
      `match /${collectionName}/\\{${idName}\\} \\{ ` +
      "allow read: if allowedEmail\\(\\); " +
      "allow create, update, delete: if adminEmail\\(\\); \\}",
    );

    assert.match(compactRules, collectionPolicy);
  });
}

test("limita atualizações do próprio perfil aos campos públicos", () => {
  assert.match(
    compactRules,
    /request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\[ "personId", "name", "email", "photoURL", "updatedAt" \]\)/,
  );
  assert.match(compactRules, /request\.resource\.data\.email == authEmail\(\)/);
  assert.match(compactRules, /request\.resource\.data\.updatedAt == request\.time/);
});

test("mantém bloqueio padrão para caminhos não declarados", () => {
  assert.match(compactRules, /match \/\{document=\*\*\} \{ allow read, write: if false; \}/);
  assert.doesNotMatch(compactRules, /allow read, write: if true/);
});
