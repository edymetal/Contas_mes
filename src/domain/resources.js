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

function getLatestResourceForProduct(items, product, resourceField, dateField, ignoredValue) {
  const normalizedProduct = normalizeResourceNameForComparison(product);
  if (!normalizedProduct) return "";

  const latestItem = items.reduce((latest, item) => {
    const resource = String(item[resourceField] || "").trim();
    if (
      !resource
      || normalizeResourceNameForComparison(resource) === ignoredValue
      || normalizeResourceNameForComparison(item.product) !== normalizedProduct
    ) {
      return latest;
    }

    const itemDate = String(item[dateField] || "");
    return !latest || itemDate > latest.itemDate ? { itemDate, resource } : latest;
  }, null);

  return latestItem?.resource || "";
}

export function getLatestPlaceForProduct(payments, product) {
  return getLatestResourceForProduct(
    payments,
    product,
    "place",
    "paidAt",
    "local nao informado",
  );
}

export function getLatestMarketForProduct(marketItems, product) {
  return normalizeMarketName(getLatestResourceForProduct(
    marketItems,
    product,
    "market",
    "purchasedAt",
    "mercado nao informado",
  ));
}
