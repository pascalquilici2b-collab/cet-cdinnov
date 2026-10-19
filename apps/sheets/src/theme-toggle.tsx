import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
export function ThemeToggle() {
  useEffect(() => {
    document.dispatchEvent(new Event("cdi-theme-controls-ready"));
  }, []);
  return (
    <button
      className="theme-toggle"
      type="button"
      data-theme-toggle
      aria-label="Activer le mode nuit"
      aria-pressed="false"
    >
      <Moon className="theme-moon" aria-hidden="true" />
      <Sun className="theme-sun" aria-hidden="true" />
      <span data-theme-label>Mode clair</span>
      <span className="theme-track" aria-hidden="true" />
    </button>
  );
}
