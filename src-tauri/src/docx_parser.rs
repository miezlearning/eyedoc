use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxAnalysis {
    pub word_count: usize,
    pub last_heading: String,
    pub headings: Vec<String>,
}

/// Ekstrak teks dan hitung kata serta heading dari file .docx
pub fn analyze_docx(path: &Path) -> Result<DocxAnalysis, String> {
    let file = File::open(path).map_err(|e| format!("Gagal membuka file: {}", e))?;
    let reader = BufReader::new(file);
    let mut archive = ZipArchive::new(reader).map_err(|e| format!("Bukan arsip .docx valid: {}", e))?;

    let mut xml_content = String::new();
    {
        let mut document_xml = archive
            .by_name("word/document.xml")
            .map_err(|e| format!("File word/document.xml tidak ditemukan di dalam .docx: {}", e))?;
        document_xml
            .read_to_string(&mut xml_content)
            .map_err(|e| format!("Gagal membaca word/document.xml: {}", e))?;
    }

    let mut xml_reader = Reader::from_str(&xml_content);
    xml_reader.config_mut().trim_text(true);

    let mut total_words = 0;
    let mut headings = Vec::new();
    let mut last_heading = String::from("Dokumen Utama");

    let mut in_t = false;
    let mut current_p_is_heading = false;
    let mut current_p_text = String::new();

    let mut buf = Vec::new();

    loop {
        match xml_reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"w:p" => {
                    current_p_is_heading = false;
                    current_p_text.clear();
                }
                b"w:pStyle" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"w:val" {
                            if let Ok(val) = std::str::from_utf8(&attr.value) {
                                let val_lower = val.to_lowercase();
                                if val_lower.contains("heading")
                                    || val_lower.contains("judul")
                                    || val_lower.contains("title")
                                    || val_lower.starts_with("h1")
                                    || val_lower.starts_with("h2")
                                    || val_lower.starts_with("h3")
                                {
                                    current_p_is_heading = true;
                                }
                            }
                        }
                    }
                }
                b"w:t" => {
                    in_t = true;
                }
                _ => {}
            },
            Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"w:pStyle" {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"w:val" {
                            if let Ok(val) = std::str::from_utf8(&attr.value) {
                                let val_lower = val.to_lowercase();
                                if val_lower.contains("heading")
                                    || val_lower.contains("judul")
                                    || val_lower.contains("title")
                                    || val_lower.starts_with("h1")
                                    || val_lower.starts_with("h2")
                                    || val_lower.starts_with("h3")
                                {
                                    current_p_is_heading = true;
                                }
                            }
                        }
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_t {
                    if let Ok(txt) = e.unescape() {
                        current_p_text.push_str(&txt);
                        current_p_text.push(' ');
                    }
                }
            }
            Ok(Event::End(ref e)) => match e.name().as_ref() {
                b"w:t" => {
                    in_t = false;
                }
                b"w:p" => {
                    let trimmed = current_p_text.trim();
                    if !trimmed.is_empty() {
                        let words_in_p = trimmed.split_whitespace().count();
                        total_words += words_in_p;

                        if current_p_is_heading {
                            last_heading = trimmed.to_string();
                            headings.push(trimmed.to_string());
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(e) => {
                eprintln!("Error membaca XML docx: {}", e);
                break;
            }
        }
        buf.clear();
    }

    Ok(DocxAnalysis {
        word_count: total_words,
        last_heading,
        headings,
    })
}

/// Menghasilkan changelog otomatis berdasarkan perubahan jumlah kata dan heading
pub fn generate_changelog(
    version: u32,
    prev_words: usize,
    current_words: usize,
    heading: &str,
    is_milestone: bool,
    milestone_note: Option<&str>,
) -> String {
    if is_milestone {
        let note = milestone_note.unwrap_or("ACC Dosen / Milestone");
        return format!(
            "Milestone v{:02}: {} (Total: {} kata)",
            version, note, current_words
        );
    }

    if version <= 1 || prev_words == 0 {
        return format!(
            "Revisi v{:02}: Inisialisasi dokumen pada bagian {} (Total: {} kata)",
            version, heading, current_words
        );
    }

    let diff = current_words as i64 - prev_words as i64;
    if diff > 0 {
        format!(
            "Revisi v{:02}: Menambah {} kata pada bagian {} (Total: {} kata)",
            version, diff, heading, current_words
        )
    } else if diff < 0 {
        format!(
            "Revisi v{:02}: Mengurangi {} kata pada bagian {} (Total: {} kata)",
            version,
            diff.abs(),
            heading,
            current_words
        )
    } else {
        format!(
            "Revisi v{:02}: Pembaruan konten pada bagian {} (Total: {} kata)",
            version, heading, current_words
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn test_generate_changelog() {
        let cl1 = generate_changelog(1, 0, 150, "Pendahuluan", false, None);
        assert!(cl1.contains("Inisialisasi dokumen"));

        let cl2 = generate_changelog(2, 150, 200, "Bab 1", false, None);
        assert!(cl2.contains("Menambah 50 kata"));

        let cl3 = generate_changelog(3, 200, 180, "Bab 1", false, None);
        assert!(cl3.contains("Mengurangi 20 kata"));

        let cl4 = generate_changelog(4, 180, 180, "Bab 2", false, None);
        assert!(cl4.contains("Pembaruan konten"));

        let cl_ms = generate_changelog(5, 180, 190, "Bab 2", true, Some("ACC Bab 1 & 2"));
        assert!(cl_ms.contains("Milestone v05"));
        assert!(cl_ms.contains("ACC Bab 1 & 2"));
    }

    #[test]
    fn test_analyze_docx_synthetic() {
        let temp_dir = std::env::temp_dir();
        let test_file_path = temp_dir.join("eyedoc_test_sample.docx");

        let file = File::create(&test_file_path).expect("Gagal membuat file test");
        let mut zip = zip::ZipWriter::new(file);

        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("word/document.xml", options).expect("start_file failed");

        let sample_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p>
                    <w:pPr>
                        <w:pStyle w:val="Heading1"/>
                    </w:pPr>
                    <w:r>
                        <w:t>BAB I PENDAHULUAN</w:t>
                    </w:r>
                </w:p>
                <w:p>
                    <w:r>
                        <w:t>Latar belakang penelitian ini adalah sistem otomatisasi dokumen skripsi mahasiswa.</w:t>
                    </w:r>
                </w:p>
            </w:body>
        </w:document>"#;

        zip.write_all(sample_xml.as_bytes()).expect("write failed");
        zip.finish().expect("finish zip failed");

        let analysis = analyze_docx(&test_file_path).expect("analyze_docx failed");
        assert_eq!(analysis.headings.len(), 1);
        assert_eq!(analysis.headings[0], "BAB I PENDAHULUAN");
        assert_eq!(analysis.last_heading, "BAB I PENDAHULUAN");
        assert_eq!(analysis.word_count, 11);

        let _ = std::fs::remove_file(test_file_path);
    }
}
