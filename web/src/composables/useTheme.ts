import { ref, computed, readonly } from "vue";

const STORAGE_KEY = "pathawk-ui-theme";

export type UiTheme = "light" | "dark";

const theme = ref<UiTheme>("light");
let synced = false;

function applyToDocument(t: UiTheme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

function readInitial(): UiTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** Call once from root (e.g. App.vue onMounted) to hydrate theme from storage / system. */
export function syncThemeFromStorage() {
  if (synced) return;
  synced = true;
  theme.value = readInitial();
  applyToDocument(theme.value);
}

export function useTheme() {
  const isDark = computed(() => theme.value === "dark");

  function setTheme(t: UiTheme) {
    theme.value = t;
    applyToDocument(t);
  }

  function toggleTheme() {
    setTheme(theme.value === "dark" ? "light" : "dark");
  }

  return {
    theme: readonly(theme),
    isDark,
    setTheme,
    toggleTheme,
  };
}
