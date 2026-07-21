function normalizeErrorCode(error) {
  return String(error?.code || "")
    .toLowerCase()
    .replace(/^auth\//, "")
    .replace(/^firestore\//, "");
}

export function getFirebaseActionError(error, action) {
  const code = normalizeErrorCode(error);

  if (code === "permission-denied") {
    return `Sua conta não tem permissão para ${action}.`;
  }
  if (code === "unauthenticated") {
    return `Sua sessão expirou. Entre novamente para ${action}.`;
  }
  if (["unavailable", "network-request-failed"].includes(code)) {
    return `Sem conexão com o serviço. Verifique a internet e tente ${action} novamente.`;
  }
  if (code === "deadline-exceeded") {
    return `O serviço demorou para responder ao tentar ${action}. Tente novamente.`;
  }
  if (code === "resource-exhausted") {
    return `O limite temporário do serviço foi atingido ao tentar ${action}. Aguarde e tente novamente.`;
  }
  if (code === "not-found") {
    return `O registro necessário para ${action} não foi encontrado.`;
  }
  if (code) {
    return `Não foi possível ${action}. Tente novamente.`;
  }

  return error?.message || `Não foi possível ${action}.`;
}

export function getAuthErrorMessage(error) {
  const code = normalizeErrorCode(error);

  if (["popup-closed-by-user", "cancelled-popup-request"].includes(code)) {
    return "O acesso com o Google foi cancelado.";
  }
  if (code === "popup-blocked") {
    return "O navegador bloqueou a janela do Google. Libere pop-ups e tente novamente.";
  }
  if (code === "network-request-failed") {
    return "Não foi possível acessar o Google. Verifique sua conexão e tente novamente.";
  }
  if (code === "too-many-requests") {
    return "Foram feitas muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
  }
  if (code === "unauthorized-domain") {
    return "Este endereço não está autorizado no Firebase Authentication.";
  }

  return "Não foi possível entrar com o Google. Tente novamente.";
}
