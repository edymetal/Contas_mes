export const PEOPLE = [
  {
    id: "edney",
    name: "Edney",
    email: "edneypugleise@gmail.com",
  },
  {
    id: "sonia",
    name: "Sônia",
    email: "soniapugleise@gmail.com",
  },
  {
    id: "rodney",
    name: "Rodney",
    email: "RODNEYPUGLEISEMACHADO@gmail.com",
  },
];

export const CATEGORIES = ["Casa", "Carro", "Viagem", "Outros"];

export const PAYMENT_TYPES = ["Dinheiro", "PIX", "Transferência", "Cartão", "Outro"];

export function getPersonById(id) {
  return PEOPLE.find((person) => person.id === id);
}

export function getProfileByEmail(email) {
  return PEOPLE.find((person) => person.email.toLowerCase() === email?.toLowerCase());
}
