import { todayInputValue } from "../utils/presentation.js";

export const MONTHS_PT = [
  { value: "01", short: "Jan" },
  { value: "02", short: "Fev" },
  { value: "03", short: "Mar" },
  { value: "04", short: "Abr" },
  { value: "05", short: "Mai" },
  { value: "06", short: "Jun" },
  { value: "07", short: "Jul" },
  { value: "08", short: "Ago" },
  { value: "09", short: "Set" },
  { value: "10", short: "Out" },
  { value: "11", short: "Nov" },
  { value: "12", short: "Dez" },
];

export const emptyExpenseForm = {
  title: "",
  totalValue: "",
  expenseDate: "",
  expensePaymentMethod: "Dinheiro",
  customExpensePaymentMethod: "",
  dueDate: "",
  dueDay: new Date().getDate(),
  category: "Casa",
  payerId: "edney",
  participants: ["edney", "sonia", "rodney"],
  splitMode: "equal",
  splitValues: {},
  type: "normal",
  currentInstallment: 1,
  installmentsCount: 12,
  recurringMonths: 12,
};

export const emptyMarketForm = {
  market: "",
  product: "",
  description: "",
  quantity: "1",
  unitValue: "",
  purchasedAt: todayInputValue(),
};

export const emptyOtherPaymentForm = {
  place: "",
  paidAt: todayInputValue(),
  product: "",
  paymentMethod: "Cartão",
  quantity: "1",
  unitValue: "",
};
