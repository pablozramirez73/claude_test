import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ScanProvider } from "./state/ScanContext";
import { initTelegram } from "./telegram/webapp";
import "./styles.css";

initTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScanProvider>
      <App />
    </ScanProvider>
  </StrictMode>,
);
