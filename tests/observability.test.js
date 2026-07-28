import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDiagnostic,
  createDiagnosticEntry,
  sanitizeDiagnosticText,
} from "../src/services/observability.js";

test("remove credenciais, e-mails e parâmetros de URL dos diagnósticos", () => {
  const sanitized = sanitizeDiagnosticText(
    "apiKey=segredo123 usuario@exemplo.com https://app.test/path?token=abc",
  );

  assert.equal(
    sanitized,
    "apiKey=[removido] [e-mail removido] https://app.test/path",
  );
});

test("cria diagnóstico limitado a dados técnicos seguros", () => {
  const error = new Error("Falha para pessoa@exemplo.com");
  error.code = "permission-denied";
  error.stack = "stack com conteúdo interno";

  assert.deepEqual(
    createDiagnosticEntry(error, "firebase:salvar token=secreto", {
      online: false,
      path: "/Contas_mes/?token=segredo",
      randomValue: 0.25,
      timestamp: "2026-07-28T10:00:00.000Z",
      version: "1.2.34",
    }),
    {
      id: "20260728T100000000Z025",
      timestamp: "2026-07-28T10:00:00.000Z",
      version: "1.2.34",
      context: "firebase:salvar token=[removido]",
      name: "Error",
      code: "permission-denied",
      message: "Falha para [e-mail removido]",
      online: false,
      path: "/Contas_mes/",
    },
  );
});

test("mantém somente os vinte diagnósticos mais recentes", () => {
  const entries = Array.from({ length: 22 }, (_, index) => ({ id: index }));
  const result = entries.reduce(appendDiagnostic, []);

  assert.equal(result.length, 20);
  assert.equal(result[0].id, 2);
  assert.equal(result.at(-1).id, 21);
});
