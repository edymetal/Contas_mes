export const PEOPLE = [
  {
    id: "edney",
    name: "Edney",
    email: "COLOCAR_EMAIL_EDNEY_AQUI",
  },
  {
    id: "sonia",
    name: "Sônia",
    email: "COLOCAR_EMAIL_SONIA_AQUI",
  },
  {
    id: "rodney",
    name: "Rodney",
    email: "COLOCAR_EMAIL_RODNEY_AQUI",
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
