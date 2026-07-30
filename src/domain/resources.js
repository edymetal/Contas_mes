const MARKET_NAME_ALIASES = new Map([
  ["ard", "ARD DISCOUNT"],
  ["ard discount", "ARD DISCOUNT"],
]);

function normalizeResourceNameForComparison(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function normalizeMarketName(value) {
  const marketName = String(value || "").trim().replace(/\s+/g, " ");
  if (!marketName) return "";

  return MARKET_NAME_ALIASES.get(normalizeResourceNameForComparison(marketName)) || marketName;
}
