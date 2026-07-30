import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReceiptCategory,
  singularizeReceiptCategory,
} from "../src/services/receiptAnalysis.js";

test("normaliza categorias conhecidas do Gemini sempre no singular", () => {
  assert.equal(normalizeReceiptCategory("BISCOTTI AL CACAO", "Biscoitos"), "Biscoito");
  assert.equal(normalizeReceiptCategory("PANE INTEGRALE", "Pães"), "Pão");
  assert.equal(normalizeReceiptCategory("CIOCCOLATO LATTE", "Chocolates"), "Chocolate");
  assert.equal(normalizeReceiptCategory("UOVA FRESCHE", "Ovos"), "Ovo");
  assert.equal(normalizeReceiptCategory("PASTA PENNE", "Massas"), "Massa");
});

test("converte plurais inesperados da descrição para o singular", () => {
  assert.equal(singularizeReceiptCategory("Biscoitos"), "Biscoito");
  assert.equal(singularizeReceiptCategory("Pães integrais"), "Pão integral");
  assert.equal(singularizeReceiptCategory("Chocolates"), "Chocolate");
  assert.equal(singularizeReceiptCategory("Taxas/Sacolas"), "Taxa/Sacola");
  assert.equal(singularizeReceiptCategory("Flores naturais"), "Flor natural");
});

test("preserva palavras singulares terminadas em s", () => {
  assert.equal(singularizeReceiptCategory("Lápis"), "Lápis");
  assert.equal(singularizeReceiptCategory("Tênis"), "Tênis");
  assert.equal(singularizeReceiptCategory("Arroz"), "Arroz");
});
