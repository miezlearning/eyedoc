use std::collections::HashSet;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SectionStat {
    pub heading: String,
    pub word_count: usize,
    pub image_count: usize,
}

/// Ringkasan isi dokumen yang disimpan di state, dipakai untuk dibandingkan pada revisi berikutnya.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DocxSnapshot {
    pub word_count: usize,
    pub image_count: usize,
    pub headings: Vec<String>,
    pub sections: Vec<SectionStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocxAnalysis {
    pub word_count: usize,
    pub last_heading: String,
    pub headings: Vec<String>,
    pub image_count: usize,
    pub sections: Vec<SectionStat>,
}

impl DocxAnalysis {
    pub fn snapshot(&self) -> DocxSnapshot {
        DocxSnapshot {
            word_count: self.word_count,
            image_count: self.image_count,
            headings: self.headings.clone(),
            sections: self.sections.clone(),
        }
    }
}

fn is_heading_style(value: &str) -> bool {
    let v = value.to_lowercase();
    v.contains("heading")
        || v.contains("judul")
        || v.contains("title")
        || v.starts_with("h1")
        || v.starts_with("h2")
        || v.starts_with("h3")
}

fn ensure_section(sections: &mut Vec<SectionStat>, heading: &str) -> usize {
    if let Some(index) = sections.iter().position(|s| s.heading == heading) {
        return index;
    }
    sections.push(SectionStat {
        heading: heading.to_string(),
        word_count: 0,
        image_count: 0,
    });
    sections.len() - 1
}

/// Ekstrak kata, gambar, daftar heading, dan statistik per bagian dari file .docx
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
    let mut total_images = 0;
    let mut headings = Vec::new();
    let mut sections: Vec<SectionStat> = Vec::new();
    let mut last_heading = String::from("Dokumen Utama");

    let mut in_t = false;
    let mut current_p_is_heading = false;
    let mut current_p_text = String::new();
    let mut current_p_images = 0usize;

    let mut buf = Vec::new();

    loop {
        match xml_reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => match e.name().as_ref() {
                b"w:p" => {
                    current_p_is_heading = false;
                    current_p_text.clear();
                    current_p_images = 0;
                }
                b"w:pStyle" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"w:val" {
                            if let Ok(val) = std::str::from_utf8(&attr.value) {
                                if is_heading_style(val) {
                                    current_p_is_heading = true;
                                }
                            }
                        }
                    }
                }
                b"w:t" => {
                    in_t = true;
                }
                b"w:drawing" | b"w:pict" => {
                    current_p_images += 1;
                    total_images += 1;
                }
                _ => {}
            },
            Ok(Event::Empty(ref e)) => match e.name().as_ref() {
                b"w:pStyle" => {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"w:val" {
                            if let Ok(val) = std::str::from_utf8(&attr.value) {
                                if is_heading_style(val) {
                                    current_p_is_heading = true;
                                }
                            }
                        }
                    }
                }
                b"w:drawing" | b"w:pict" => {
                    current_p_images += 1;
                    total_images += 1;
                }
                _ => {}
            },
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
                    let words_in_p = if trimmed.is_empty() {
                        0
                    } else {
                        trimmed.split_whitespace().count()
                    };

                    if current_p_is_heading && !trimmed.is_empty() {
                        last_heading = trimmed.to_string();
                        headings.push(trimmed.to_string());
                    }

                    if words_in_p > 0 || current_p_images > 0 {
                        total_words += words_in_p;
                        let index = ensure_section(&mut sections, &last_heading);
                        sections[index].word_count += words_in_p;
                        sections[index].image_count += current_p_images;
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
        image_count: total_images,
        sections,
    })
}

/// Changelog yang menyebut bagian yang benar-benar berubah, heading baru, dan gambar.
pub fn generate_changelog(
    version: u32,
    prev: Option<&DocxSnapshot>,
    current: &DocxAnalysis,
    is_milestone: bool,
    milestone_note: Option<&str>,
) -> String {
    let total = format!(
        "Total: {} kata, {} gambar",
        current.word_count, current.image_count
    );

    if is_milestone {
        let note = milestone_note.unwrap_or("ACC Dosen / Milestone");
        return format!("Milestone v{:02}: {} ({total})", version, note);
    }

    let Some(prev) = prev else {
        return format!(
            "Revisi v{:02}: Inisialisasi dokumen pada bagian {} ({total})",
            version, current.last_heading
        );
    };

    if prev.word_count == 0 {
        return format!(
            "Revisi v{:02}: Inisialisasi dokumen pada bagian {} ({total})",
            version, current.last_heading
        );
    }

    let prev_headings: HashSet<&str> = prev.headings.iter().map(String::as_str).collect();
    let current_headings: HashSet<&str> = current.headings.iter().map(String::as_str).collect();
    let new_headings: HashSet<&str> = current
        .headings
        .iter()
        .map(String::as_str)
        .filter(|h| !prev_headings.contains(h))
        .collect();

    let mut changes: Vec<String> = Vec::new();

    for h in &current.headings {
        if !prev_headings.contains(h.as_str()) {
            changes.push(format!("Menambah heading '{h}'"));
        }
    }
    for h in &prev.headings {
        if !current_headings.contains(h.as_str()) {
            changes.push(format!("Menghapus heading '{h}'"));
        }
    }

    for sec in &current.sections {
        let before = prev.sections.iter().find(|s| s.heading == sec.heading);
        let image_before = before.map(|s| s.image_count).unwrap_or(0);
        let image_diff = sec.image_count as i64 - image_before as i64;
        if image_diff > 0 {
            changes.push(format!(
                "Menambah {} gambar pada {}",
                image_diff, sec.heading
            ));
        } else if image_diff < 0 {
            changes.push(format!(
                "Menghapus {} gambar pada {}",
                image_diff.abs(),
                sec.heading
            ));
        }

        let word_before = before.map(|s| s.word_count).unwrap_or(0);
        let word_diff = sec.word_count as i64 - word_before as i64;
        if word_diff != 0 && !new_headings.contains(sec.heading.as_str()) {
            changes.push(format!("{} ({} kata)", sec.heading, word_diff));
        }
    }

    if changes.is_empty() {
        changes.push(format!("Pembaruan pada {}", current.last_heading));
    }

    if changes.len() > 4 {
        let extra = changes.len() - 4;
        changes.truncate(4);
        changes.push(format!("dan {extra} perubahan lain"));
    }

    format!("Revisi v{:02}: {} ({total})", version, changes.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn analysis(words: usize, images: usize, headings: &[&str], sections: Vec<SectionStat>) -> DocxAnalysis {
        DocxAnalysis {
            word_count: words,
            image_count: images,
            headings: headings.iter().map(|h| h.to_string()).collect(),
            last_heading: headings.last().unwrap_or(&"Dokumen Utama").to_string(),
            sections,
        }
    }

    #[test]
    fn test_generate_changelog() {
        let first = analysis(150, 0, &["Pendahuluan"], Vec::new());
        let cl1 = generate_changelog(1, None, &first, false, None);
        assert!(cl1.contains("Inisialisasi dokumen"));
        assert!(cl1.contains("0 gambar"));

        let prev = DocxSnapshot {
            word_count: 150,
            image_count: 0,
            headings: vec!["BAB I".to_string()],
            sections: vec![SectionStat {
                heading: "BAB I".to_string(),
                word_count: 150,
                image_count: 0,
            }],
        };
        let current = analysis(
            200,
            2,
            &["BAB I", "DAFTAR PUSTAKA"],
            vec![
                SectionStat { heading: "BAB I".to_string(), word_count: 160, image_count: 2 },
                SectionStat { heading: "DAFTAR PUSTAKA".to_string(), word_count: 40, image_count: 0 },
            ],
        );
        let cl2 = generate_changelog(2, Some(&prev), &current, false, None);
        assert!(cl2.contains("Menambah heading 'DAFTAR PUSTAKA'"));
        assert!(cl2.contains("Menambah 2 gambar pada BAB I"));
        assert!(cl2.contains("BAB I (+10 kata)"));
        assert!(cl2.contains("Total: 200 kata, 2 gambar"));

        let ms = generate_changelog(3, Some(&prev), &current, true, Some("ACC Bab 1"));
        assert!(ms.contains("Milestone v03"));
        assert!(ms.contains("ACC Bab 1"));
    }

    #[test]
    fn test_analyze_docx_detects_images_and_sections() {
        let temp_dir = std::env::temp_dir();
        let test_file_path = temp_dir.join("eyedoc_test_images.docx");

        let file = File::create(&test_file_path).expect("Gagal membuat file test");
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("word/document.xml", options).expect("start_file failed");

        let sample_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>BAB I PENDAHULUAN</w:t></w:r></w:p>
                <w:p><w:r><w:t>Latar belakang sistem otomatisasi dokumen.</w:t></w:r></w:p>
                <w:p><w:r><w:drawing/><w:t>Gambar 1 grafik.</w:t></w:r></w:p>
                <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>DAFTAR PUSTAKA</w:t></w:r></w:p>
                <w:p><w:r><w:t>Referensi pertama.</w:t></w:r></w:p>
            </w:body>
        </w:document>"#;

        zip.write_all(sample_xml.as_bytes()).expect("write failed");
        zip.finish().expect("finish zip failed");

        let result = analyze_docx(&test_file_path).expect("analyze_docx failed");
        assert_eq!(result.image_count, 1);
        assert_eq!(result.headings.len(), 2);
        assert_eq!(result.headings[1], "DAFTAR PUSTAKA");
        assert_eq!(result.word_count, 9);
        assert!(result.sections.iter().any(|s| s.heading == "BAB I PENDAHULUAN" && s.image_count == 1));
        assert!(result.sections.iter().any(|s| s.heading == "DAFTAR PUSTAKA" && s.word_count == 2));

        let _ = std::fs::remove_file(test_file_path);
    }
}
