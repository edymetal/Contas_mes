import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppErrorBoundary } from "./components/AppFeedback.jsx";
import {
  installGlobalErrorMonitoring,
  reportClientError,
} from "./services/observability.js";
import packageInfo from "../package.json";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/responsive.css";

installGlobalErrorMonitoring({
  version: import.meta.env.VITE_APP_VERSION || packageInfo.version,
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch((error) => {
      reportClientError(error, "service-worker:register");
    });
  });
}
