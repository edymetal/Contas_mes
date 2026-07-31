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

export function getLatestPlaceForProduct(payments, product) {
  const normalizedProduct = normalizeResourceNameForComparison(product);
  if (!normalizedProduct) return "";

  const latestPayment = payments.reduce((latest, payment) => {
    const place = String(payment.place || "").trim();
    if (
      !place
      || normalizeResourceNameForComparison(place) === "local nao informado"
      || normalizeResourceNameForComparison(payment.product) !== normalizedProduct
    ) {
      return latest;
    }

    const paidAt = String(payment.paidAt || "");
    return !latest || paidAt > latest.paidAt ? { paidAt, place } : latest;
  }, null);

  return latestPayment?.place || "";
}
