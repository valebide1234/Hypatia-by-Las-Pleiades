import "@testing-library/jest-dom/vitest";

// Node 25+ defines its own `localStorage` / `sessionStorage` globals. Without a storage file
// they are unusable, and they hide the ones jsdom provides. Use jsdom's (or a small in-memory
// stand-in) so tests behave as in a browser on every Node version.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  let usable = false;
  try {
    usable = typeof globalThis[name]?.clear === "function";
  } catch {
    usable = false;
  }
  if (!usable) {
    const fromJsdom = (globalThis as { jsdom?: { window: Window } }).jsdom?.window[name];
    Object.defineProperty(globalThis, name, { value: fromJsdom ?? memoryStorage(), configurable: true, writable: true });
  }
}
