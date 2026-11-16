/**
 * Sistem lokalisasi EyeDoc.
 *
 * Menambah bahasa:
 * 1. Buat file baru di folder ini, misalnya `fr.ts`.
 * 2. Ikuti bentuk LocaleDefinition di bawah.
 * 3. File itu otomatis terdeteksi dan muncul di pemilih bahasa.
 * Tidak perlu mengubah App.tsx atau i18n.ts.
 */

export interface LocaleDefinition {
  code: string;
  name: string;
  /** Teks sumber Bahasa Inggris -> terjemahan bahasa ini. */
  translations: Record<string, string>;
}

const modules = import.meta.glob<LocaleDefinition>("./*.ts", {
  eager: true,
  import: "default",
});

export const locales: LocaleDefinition[] = Object.entries(modules)
  .filter(([path]) => !path.endsWith("/index.ts"))
  .map(([, module]) => module)
  .filter((module) => module && typeof module.code === "string" && typeof module.name === "string")
  .sort((a, b) => a.code.localeCompare(b.code));

export const DEFAULT_LOCALE = "en";

export function getLocale(code: string): LocaleDefinition {
  return (
    locales.find((locale) => locale.code === code) ??
    locales.find((locale) => locale.code === DEFAULT_LOCALE) ?? {
      code: DEFAULT_LOCALE,
      name: "English",
      translations: {},
    }
  );
}

function lookup(translations: Record<string, string>, text: string): string | undefined {
  const exact = translations[text];
  if (exact) return exact;

  // Pesan dinamis seperti "Failed to sync document: <detail>"
  const colon = text.indexOf(":");
  if (colon > 0) {
    const prefix = translations[text.slice(0, colon + 1)];
    if (prefix) return prefix + text.slice(colon + 1);
  }

  // Potongan teks JSX yang punya spasi di awal atau akhir
  const trimmed = text.trim();
  if (trimmed !== text) {
    const mapped = translations[trimmed];
    if (mapped) {
      const start = text.indexOf(trimmed);
      return text.slice(0, start) + mapped + text.slice(start + trimmed.length);
    }
  }

  return undefined;
}

export function translateText(text: string, code: string): string {
  if (code === DEFAULT_LOCALE) return text;
  return lookup(getLocale(code).translations, text) ?? text;
}
