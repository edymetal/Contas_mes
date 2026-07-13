import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_SIZE = 7 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("A imagem selecionada não pôde ser aberta."));
    };
    image.src = url;
  });
}

async function optimizeImage(file) {
  if (!file.type.startsWith("image/") || file.size <= 2.5 * 1024 * 1024) return file;

  const image = await loadImage(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, 2400 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("Não foi possível preparar a foto para leitura.");
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

export async function analyzeMarketReceipt(file) {
  if (!functions) throw new Error("O Firebase não está configurado.");
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Envie uma foto JPG, PNG ou WebP, ou uma nota em PDF.");
  }

  const preparedFile = await optimizeImage(file);
  if (preparedFile.size > MAX_FILE_SIZE) {
    throw new Error("O arquivo deve ter no máximo 7 MB. Tente uma foto com resolução menor.");
  }

  const dataUrl = await readAsDataUrl(preparedFile);
  const base64 = String(dataUrl).split(",")[1];
  const callable = httpsCallable(functions, "analyzeMarketReceipt", { timeout: 120000 });
  const response = await callable({
    data: base64,
    mimeType: preparedFile.type,
    fileName: preparedFile.name,
  });

  return response.data;
}
