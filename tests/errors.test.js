import test from "node:test";
import assert from "node:assert/strict";
import { getAuthErrorMessage, getFirebaseActionError } from "../src/domain/errors.js";

test("traduz falha de permissão sem expor detalhes técnicos", () => {
  assert.equal(
    getFirebaseActionError(
      { code: "permission-denied", message: "Missing or insufficient permissions." },
      "salvar a conta",
    ),
    "Sua conta não tem permissão para salvar a conta.",
  );
});

test("aceita códigos do Firebase com prefixo do produto", () => {
  assert.equal(
    getFirebaseActionError({ code: "firestore/unavailable" }, "carregar os dados"),
    "Sem conexão com o serviço. Verifique a internet e tente carregar os dados novamente.",
  );
});

test("não mostra mensagem interna para código desconhecido", () => {
  assert.equal(
    getFirebaseActionError({ code: "internal", message: "sensitive backend detail" }, "salvar os dados"),
    "Não foi possível salvar os dados. Tente novamente.",
  );
});

test("preserva mensagens de validação locais sem código técnico", () => {
  assert.equal(
    getFirebaseActionError(new Error("Informe um valor válido."), "salvar a conta"),
    "Informe um valor válido.",
  );
});

test("orienta quando o navegador bloqueia o login", () => {
  assert.equal(
    getAuthErrorMessage({ code: "auth/popup-blocked" }),
    "O navegador bloqueou a janela do Google. Libere pop-ups e tente novamente.",
  );
});

test("não expõe detalhes internos em falha desconhecida de autenticação", () => {
  assert.equal(
    getAuthErrorMessage({ code: "auth/internal-error", message: "sensitive auth detail" }),
    "Não foi possível entrar com o Google. Tente novamente.",
  );
});
