import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 4,
            },
            {
              name: "icons",
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 3,
            },
            {
              name: "firebase-firestore",
              test: /node_modules[\\/](?:@firebase[\\/](?:firestore|webchannel-wrapper)|firebase[\\/]firestore)[\\/]/,
              includeDependenciesRecursively: false,
              priority: 4,
            },
            {
              name: "firebase-auth",
              test: /node_modules[\\/](?:@firebase[\\/]auth|firebase[\\/]auth)[\\/]/,
              includeDependenciesRecursively: false,
              priority: 3,
            },
            {
              name: "firebase-core",
              test: /node_modules[\\/](?:@firebase|firebase)[\\/]/,
              includeDependenciesRecursively: false,
              priority: 2,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              maxSize: 350_000,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  plugins: [react()],
});
