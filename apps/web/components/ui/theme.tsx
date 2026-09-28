"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "../../lib/cn";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "dogfood-theme";

const ThemeContext = createContext<{
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
} | null>(null);

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Three-way theme preference (light / dark / system) persisted to
 * localStorage. The initial class is applied by a blocking inline script in the
 * root layout so there is no light-mode flash before hydration.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // `useLayoutEffect`, not `useEffect`: the blocking script in the root layout
  // already set the class before first paint, and React's dev-only remount
  // clears the attributes it does not own. Re-applying before paint keeps the
  // two in agreement.
  useLayoutEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const next: Theme =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    setThemeState(next);
    const nextResolved = next === "system" ? systemTheme() : next;
    apply(nextResolved);
    setResolved(nextResolved);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = systemTheme();
      apply(next);
      setResolved(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const nextResolved = next === "system" ? systemTheme() : next;
    apply(nextResolved);
    setResolved(nextResolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

const OPTIONS: Array<{ value: Theme; label: string; icon: ReactNode }> = [
  { value: "light", label: "Light", icon: <Sun className="size-3.5" /> },
  { value: "dark", label: "Dark", icon: <Moon className="size-3.5" /> },
  { value: "system", label: "System", icon: <Monitor className="size-3.5" /> },
];

export function ThemeToggle({ className }: { className?: string }) {
  const context = useContext(ThemeContext);
  const theme = context?.theme ?? "system";
  const resolved = context?.resolved ?? "light";
  const setTheme = context?.setTheme;

  // No provider (e.g. a static marketing render) still gets a working button.
  if (!setTheme) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--df-ring)]",
              selected
                ? "bg-surface text-fg shadow-xs"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            {option.icon}
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {resolved === "dark" ? "Dark theme active" : "Light theme active"}
      </span>
    </div>
  );
}

/** Blocking script that applies the stored theme before first paint. */
export const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
