import type { LocaleDefinition } from "./index";

/**
 * English adalah bahasa sumber, jadi tidak perlu daftar terjemahan.
 * Tambahkan entri hanya jika ada teks yang harus diubah dari sumbernya.
 */
const locale: LocaleDefinition = {
  code: "en",
  name: "English",
  flag: "🇬🇧",
  translations: {},
};

export default locale;
