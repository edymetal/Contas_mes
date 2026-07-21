import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_COLLECTIONS,
  BACKUP_VERSION,
  createBackupPayload,
  formatBackupSummary,
  restoreFirestoreTimestamps,
  validateAndNormalizeBackupPayload,
} from "../src/domain/backup.js";

function completeCollections() {
  return Object.fromEntries(
    BACKUP_COLLECTIONS.map(({ key }) => [key, [{ id: `${key}-1`, value: key }]]),
  );
}

test("cria um backup versão 2 com todas as coleções", () => {
  const exportedAt = "2026-07-21T12:00:00.000Z";
  const payload = createBackupPayload(completeCollections(), exportedAt);

  assert.equal(payload.version, BACKUP_VERSION);
  assert.equal(payload.exportedAt, exportedAt);
  BACKUP_COLLECTIONS.forEach(({ key }) => {
    assert.equal(payload[key].length, 1);
  });
});

test("mantém compatibilidade com backups da versão 1", () => {
  const normalized = validateAndNormalizeBackupPayload({
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    expenses: [{ id: "expense-1", title: "Água" }],
    settlements: [],
  });

  assert.equal(normalized.version, 1);
  assert.equal(normalized.expenses.length, 1);
  assert.deepEqual(normalized.marketItems, []);
  assert.deepEqual(normalized.userProfiles, []);
});

test("rejeita backup versão 2 sem uma das coleções obrigatórias", () => {
  const data = createBackupPayload(completeCollections(), "2026-07-21T12:00:00.000Z");
  delete data.marketReceipts;

  assert.throws(
    () => validateAndNormalizeBackupPayload(data),
    /coleção de notas de mercado não foi encontrada/,
  );
});

test("rejeita coleção que não seja uma lista", () => {
  const data = createBackupPayload(completeCollections(), "2026-07-21T12:00:00.000Z");
  data.otherPayments = {};

  assert.throws(
    () => validateAndNormalizeBackupPayload(data),
    /coleção de outros pagamentos deve ser uma lista/,
  );
});

test("rejeita registros sem identificador válido", () => {
  const data = createBackupPayload(completeCollections(), "2026-07-21T12:00:00.000Z");
  data.expenses = [{ id: "pasta/documento" }];

  assert.throws(
    () => validateAndNormalizeBackupPayload(data),
    /possui um identificador inválido/,
  );
});

test("rejeita identificadores duplicados dentro da mesma coleção", () => {
  const data = createBackupPayload(completeCollections(), "2026-07-21T12:00:00.000Z");
  data.settlements = [{ id: "duplicado" }, { id: "duplicado" }];

  assert.throws(
    () => validateAndNormalizeBackupPayload(data),
    /está duplicado em acertos/,
  );
});

test("rejeita versões futuras para evitar importações incompatíveis", () => {
  const data = createBackupPayload(completeCollections(), "2026-07-21T12:00:00.000Z");
  data.version = BACKUP_VERSION + 1;

  assert.throws(() => validateAndNormalizeBackupPayload(data), /Versão de backup não suportada/);
});

test("resume as quantidades das coleções para confirmação", () => {
  const payload = createBackupPayload({}, "2026-07-21T12:00:00.000Z");
  payload.expenses = [{ id: "expense-1" }, { id: "expense-2" }];

  assert.equal(
    formatBackupSummary(payload),
    "2 contas, 0 acertos, 0 itens de mercado, 0 notas de mercado, 0 outros pagamentos, 0 perfis",
  );
});

test("restaura timestamps antigos e atuais do Firestore em estruturas aninhadas", () => {
  const restored = restoreFirestoreTimestamps({
    oldTimestamp: { seconds: 10, nanoseconds: 20 },
    nested: [{ type: "firestore/timestamp/1.0", seconds: 30, nanoseconds: 40 }],
  }, (seconds, nanoseconds) => `timestamp:${seconds}:${nanoseconds}`);

  assert.deepEqual(restored, {
    oldTimestamp: "timestamp:10:20",
    nested: ["timestamp:30:40"],
  });
});

test("não converte objetos comuns que também possuam segundos", () => {
  const value = { seconds: 10, nanoseconds: 20, description: "duração" };

  assert.deepEqual(
    restoreFirestoreTimestamps(value, () => "timestamp"),
    value,
  );
});
