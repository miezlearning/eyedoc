# Menambah bahasa baru

Semua teks antarmuka EyeDoc ada di folder ini. English adalah bahasa sumber, jadi teks di komponen ditulis dalam Bahasa Inggris.

## Cara menambah bahasa

1. Salin `en.ts` menjadi file baru, misalnya `fr.ts`.
2. Isi `code` dengan kode bahasa (misalnya `fr`), `name` (misalnya `Français`), dan `flag` berupa emoji bendera (misalnya `🇫🇷`).
3. Isi `translations` dengan pasangan `teks Inggris` → `terjemahan`.

Contoh:

```ts
import type { LocaleDefinition } from "./index";

const locale: LocaleDefinition = {
  code: "fr",
  name: "Français",
  flag: "🇫🇷",
  translations: {
    Overview: "Vue d'ensemble",
    Settings: "Paramètres",
    "Connect GitHub Account": "Connecter le compte GitHub",
  },
};

export default locale;
```

4. Selesai. File baru otomatis terbaca dan tombolnya muncul di halaman **Tentang**. Tidak perlu mengubah komponen lain.

## Aturan

- Kunci harus sama persis dengan teks Inggris di `src/App.tsx`, termasuk tanda baca.
- Kalau sebuah kunci belum diterjemahkan, teks Inggris yang akan tampil. Tidak ada error.
- Pesan dari backend Rust berbahasa Indonesia diterjemahkan ke English di `src/i18n.ts` (`BACKEND_ENGLISH`). Untuk bahasa lain, tambahkan terjemahannya di file locale kamu.
- Setelah menambah atau mengubah terjemahan, jalankan `npm run build` untuk memastikan tidak ada kesalahan tipe.
