import { createRoot } from "react-dom/client";
import { App } from "./app";
import { AuthGate } from "./auth-gate";
import "./styles.css";
const root = document.getElementById("root");
if (!root) throw new Error("Application root not found");
createRoot(root).render(
  <AuthGate>
    <App />
  </AuthGate>,
);
