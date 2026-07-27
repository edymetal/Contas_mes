import { writeBatch } from "firebase/firestore";
import { db } from "./firebase.js";

export async function commitFirestoreMutations(mutations) {
  const batchSize = 450;

  for (let index = 0; index < mutations.length; index += batchSize) {
    const batch = writeBatch(db);
    mutations.slice(index, index + batchSize).forEach((mutation) => {
      if (mutation.operation === "delete") {
        batch.delete(mutation.reference);
      } else if (mutation.operation === "set") {
        batch.set(mutation.reference, mutation.data);
      } else {
        batch.update(mutation.reference, mutation.data);
      }
    });
    await batch.commit();
  }
}
