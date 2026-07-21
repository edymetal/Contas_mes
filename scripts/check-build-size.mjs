import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const assetsDirectory = resolve("dist", "assets");
const maxChunkSizeBytes = 400 * 1024;
const javascriptFiles = readdirSync(assetsDirectory)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => ({
    fileName,
    size: statSync(resolve(assetsDirectory, fileName)).size,
  }))
  .sort((first, second) => second.size - first.size);

if (!javascriptFiles.length) {
  throw new Error("Nenhum arquivo JavaScript foi encontrado no build.");
}

const oversizedChunks = javascriptFiles.filter(({ size }) => size > maxChunkSizeBytes);
if (oversizedChunks.length) {
  const details = oversizedChunks
    .map(({ fileName, size }) => `${fileName}: ${(size / 1024).toFixed(1)} KB`)
    .join(", ");
  throw new Error(`Chunks acima do limite de 400 KB: ${details}`);
}

const largestChunk = javascriptFiles[0];
const totalSize = javascriptFiles.reduce((total, { size }) => total + size, 0);
console.log(
  `Bundle validado: ${javascriptFiles.length} chunks, maior ${(largestChunk.size / 1024).toFixed(1)} KB, ` +
  `total ${(totalSize / 1024).toFixed(1)} KB.`,
);
