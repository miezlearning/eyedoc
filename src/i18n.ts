import React from "react";
import { DEFAULT_LOCALE, locales, translateText } from "./locales";

/** Kode bahasa bebas, mengikuti file yang ada di folder locales. */
export type Language = string;

export const LANGUAGE_STORAGE_KEY = "eyedoc.language";
export const AVAILABLE_LOCALES = locales;
export { DEFAULT_LOCALE };

/**
 * Pesan error dari backend Rust masih berbahasa Indonesia.
 * Petakan ke English supaya tampilan konsisten saat bahasa = English.
 */
const BACKEND_ENGLISH: Record<string, string> = {
  "Folder kerja belum dipilih": "No work folder selected",
  "File tidak ditemukan": "File not found",
  "File dokumen tidak ditemukan": "Document file not found",
  "Folder pemantauan belum dipilih": "No monitored folder selected",
  "Path target tidak valid": "Invalid target path",
  "Konfigurasi GitHub belum lengkap (Token, Owner, Repo wajib diisi)": "GitHub configuration is incomplete. Token, Owner and Repo are required.",
  "Client ID dan Client Secret Google Cloud tidak boleh kosong": "Google Cloud Client ID and Client Secret cannot be empty",
  "Rilis terbaru tidak memiliki nomor versi": "The latest release has no version number",
  "Kode otorisasi telah kedaluwarsa. Silakan login ulang.": "Authorization code expired. Please sign in again.",
  "Otorisasi ditolak oleh pengguna.": "Authorization was denied by the user.",
  "Waktu otorisasi GitHub telah habis. Silakan coba lagi.": "GitHub authorization timed out. Please try again.",
  "Gagal menghubungi GitHub": "Failed to contact GitHub",
  "Gagal membaca token": "Failed to read token",
  "Gagal mengambil profil GitHub": "Failed to fetch GitHub profile",
  "Gagal menukar token dengan Google": "Failed to exchange token with Google",
  "Gagal mengunggah file ke Google Drive": "Failed to upload file to Google Drive",
  "Gagal membuka browser untuk otorisasi Google": "Failed to open browser for Google authorization",
  "Gagal menerima koneksi balik dari browser": "Failed to receive callback from browser",
  "Google Drive refresh_token belum tersedia. Harap hubungkan akun Google Drive terlebih dahulu.": "Google Drive refresh token is unavailable. Connect your Google Drive account first.",
  "Google menolak penukaran token": "Google rejected the token exchange",
  "Google Drive API menolak upload": "Google Drive API rejected the upload",
  "Google menolak otorisasi": "Google rejected the authorization",
  "Gagal menyimpan config": "Failed to save config",
  "Gagal serialize config": "Failed to serialize config",
  "Gagal membuka file": "Failed to open file",
};

export function translate(text: string, language: Language): string {
  if (language === DEFAULT_LOCALE) {
    const exact = BACKEND_ENGLISH[text];
    if (exact) return exact;
    const colon = text.indexOf(":");
    if (colon > 0) {
      const mapped = BACKEND_ENGLISH[text.slice(0, colon + 1)];
      if (mapped) return mapped + text.slice(colon + 1);
    }
    return text;
  }
  return translateText(text, language);
}

/** Terjemahkan turunan JSX secara rekursif tanpa mengubah struktur komponen. */
export function translateNode(node: React.ReactNode, language: Language): React.ReactNode {
  if (typeof node === "string") {
    return translate(node, language);
  }
  if (Array.isArray(node)) {
    return node.map((child, index) =>
      React.createElement(
        React.Fragment,
        { key: index },
        translateNode(child, language)
      )
    );
  }
  if (React.isValidElement(node)) {
    const props: Record<string, unknown> = { ...(node.props as Record<string, unknown>) };
    for (const key of ["title", "placeholder", "alt", "aria-label"]) {
      if (typeof props[key] === "string") {
        props[key] = translate(props[key] as string, language);
      }
    }
    if ("children" in props) {
      props.children = translateNode(props.children as React.ReactNode, language);
    }
    return React.cloneElement(node as React.ReactElement<Record<string, unknown>>, props);
  }
  return node;
}
