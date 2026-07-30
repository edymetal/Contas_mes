import test from "node:test";
import assert from "node:assert/strict";
import {
  getDescriptionSuggestions,
  getPlaceSuggestions,
  getProductSuggestions,
} from "../src/utils/presentation.js";

test("lista produtos anteriores sem duplicar nomes equivalentes", () => {
  const suggestions = getProductSuggestions([
    { product: "Arroz" },
    { product: "  Leite  " },
    { product: "arroz" },
    { product: "Café" },
    { product: "cafe" },
    { product: "" },
    { product: "Produto não informado" },
  ]);

  assert.deepEqual(suggestions, ["Arroz", "Café", "Leite"]);
});

test("lista locais anteriores com a mesma normalização dos produtos", () => {
  const suggestions = getPlaceSuggestions([
    { place: "Oficina" },
    { place: " oficina " },
    { place: "Amazon" },
    { place: "Local não informado" },
  ]);

  assert.deepEqual(suggestions, ["Amazon", "Oficina"]);
});

test("lista descrições anteriores sem valores vazios ou duplicados", () => {
  const suggestions = getDescriptionSuggestions([
    { description: "Alimento" },
    { description: "  Bebida " },
    { description: "alimento" },
    { description: "" },
    { description: "Descrição não informada" },
  ]);

  assert.deepEqual(suggestions, ["Alimento", "Bebida"]);
});
