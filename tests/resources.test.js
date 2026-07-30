import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMarketName } from "../src/domain/resources.js";

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
