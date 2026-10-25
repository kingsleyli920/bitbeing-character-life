/** Per-browser convenience only (which character was open last); every access may throw. */
const KEY = 'character-life:last-character';

export function rememberCharacter(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private mode or blocked storage: nothing to remember
  }
}

export function forgetCharacter(id: string): void {
  try {
    if (localStorage.getItem(KEY) === id) localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

export function lastCharacter(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
