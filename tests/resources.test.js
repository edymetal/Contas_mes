import test from "node:test";
import assert from "node:assert/strict";
import { getLatestPlaceForProduct, normalizeMarketName } from "../src/domain/resources.js";

test("padroniza ARD como ARD DISCOUNT", () => {
  assert.equal(normalizeMarketName("ARD"), "ARD DISCOUNT");
  assert.equal(normalizeMarketName("ard"), "ARD DISCOUNT");
  assert.equal(normalizeMarketName("  ARD   DISCOUNT  "), "ARD DISCOUNT");
});

test("preserva os demais nomes de mercado", () => {
  assert.equal(normalizeMarketName("Mercado Central"), "Mercado Central");
  assert.equal(normalizeMarketName("  Supermercado Roma  "), "Supermercado Roma");
  assert.equal(normalizeMarketName(""), "");
});

test("encontra o local mais recente associado ao produto selecionado", () => {
  const payments = [
    { product: "Revisão", place: "Oficina Antiga", paidAt: "2026-05-10" },
    { product: "Outro produto", place: "Outro local", paidAt: "2026-07-20" },
    { product: "revisao", place: "Oficina Atual", paidAt: "2026-07-15" },
  ];

  assert.equal(getLatestPlaceForProduct(payments, "  REVISÃO "), "Oficina Atual");
  assert.equal(getLatestPlaceForProduct(payments, "Produto inexistente"), "");
});
