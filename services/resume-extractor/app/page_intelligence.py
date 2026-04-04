from __future__ import annotations

from collections import Counter
import hashlib
import re
from typing import Any, Dict, List


SECTION_HINTS = [
    re.compile(r"\bskills?\b", re.I),
    re.compile(r"\beducation\b", re.I),
    re.compile(r"\bexperience\b", re.I),
    re.compile(r"\bprojects?\b", re.I),
    re.compile(r"\bsummary\b", re.I),
    re.compile(r"\b(certifications?|achievements?|awards?)\b", re.I),
]

CONTACT_HINTS = [
    re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I),
    re.compile(r"\+?\d[\d\s()+-]{7,}"),
    re.compile(r"\b(linkedin|github|portfolio)\b", re.I),
]

DATE_HINT = re.compile(r"\b(?:19|20)\d{2}\b")
PDF_NOISE_HINT = re.compile(r"\b(xref|obj|stream|endstream|flatedecode|catalog|mediaBox)\b", re.I)
BULLET_HINT = re.compile(r"^\s*(?:[-*]|•|·|\u2022)", re.M)


def ingest_document(file_bytes: bytes, mime_type: str, filename: str) -> Dict[str, Any]:
    normalized_name = (filename or "resume").strip() or "resume"
    lowered = normalized_name.lower()
    if mime_type == "application/pdf" or lowered.endswith(".pdf") or file_bytes[:4] == b"%PDF":
        file_type = "pdf"
    elif lowered.endswith(".docx") or "wordprocessingml.document" in mime_type:
        file_type = "docx"
    elif lowered.endswith((".png", ".jpg", ".jpeg")) or mime_type.startswith("image/"):
        file_type = "image"
    elif lowered.endswith(".rtf") or "rtf" in mime_type:
        file_type = "rtf"
    else:
        file_type = "text"

    return {
        "file_type": file_type,
        "filename": normalized_name,
        "mime_type": mime_type,
        "file_hash": hashlib.sha256(file_bytes).hexdigest(),
        "file_size_bytes": len(file_bytes),
    }


def normalize_extracted_text(text: str) -> str:
    normalized = text.replace("\r", "\n")
    normalized = normalized.replace("\uf0b7", "•").replace("\u2023", "•").replace("\u25e6", "•")
    normalized = normalized.replace("Ã¢â‚¬Â¢", "•").replace("Ã‚Â·", "•").replace("Â·", "•")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"([A-Za-z])-\s*\n\s*([A-Za-z])", r"\1\2", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def build_layout_blocks(text: str) -> List[Dict[str, Any]]:
    blocks: List[Dict[str, Any]] = []
    current_lines: List[str] = []
    start_line = 1
    all_lines = [line.rstrip() for line in text.splitlines()]

    def flush(end_line: int) -> None:
        nonlocal current_lines, start_line
        if not current_lines:
            return
        block_text = "\n".join(current_lines).strip()
        if block_text:
            blocks.append(
                {
                    "start_line": start_line,
                    "end_line": end_line,
                    "text": block_text,
                    "kind": infer_block_kind(block_text),
                }
            )
        current_lines = []

    for index, line in enumerate(all_lines, start=1):
        stripped = line.strip()
        if not stripped:
            flush(index - 1)
            start_line = index + 1
            continue
        if current_lines and looks_like_heading(stripped):
            flush(index - 1)
            start_line = index
        current_lines.append(stripped)

    flush(len(all_lines))
    return blocks


def infer_block_kind(text: str) -> str:
    compact = " ".join(text.splitlines()[:2]).strip()
    lowered = compact.lower()
    if any(pattern.search(lowered) for pattern in SECTION_HINTS):
        return "section"
    if any(pattern.search(compact) for pattern in CONTACT_HINTS):
        return "contact"
    if BULLET_HINT.search(text):
        return "bullets"
    return "paragraph"


def looks_like_heading(text: str) -> bool:
    if len(text) > 48:
        return False
    normalized = re.sub(r"[^A-Za-z\s&/+-]", "", text).strip()
    if not normalized:
        return False
    upper_ratio = sum(1 for ch in normalized if ch.isupper()) / max(
        sum(1 for ch in normalized if ch.isalpha()), 1
    )
    return upper_ratio > 0.75 or any(pattern.search(text) for pattern in SECTION_HINTS)


def compute_text_quality(text: str) -> Dict[str, Any]:
    cleaned = normalize_extracted_text(text)
    words = re.findall(r"\b\w+\b", cleaned)
    alpha_words = re.findall(r"\b[A-Za-z]{2,}\b", cleaned)
    printable = sum(1 for ch in cleaned if 32 <= ord(ch) <= 126)
    human_ratio = printable / max(len(cleaned), 1)
    pdf_noise_hits = len(PDF_NOISE_HINT.findall(cleaned))
    section_hits = sum(1 for pattern in SECTION_HINTS if pattern.search(cleaned))
    contact_hits = sum(1 for pattern in CONTACT_HINTS if pattern.search(cleaned))
    bullet_hits = len(BULLET_HINT.findall(cleaned))
    date_hits = len(DATE_HINT.findall(cleaned))
    non_alnum = sum(1 for ch in cleaned if not ch.isalnum() and not ch.isspace())
    glyph_ratio = non_alnum / max(len(cleaned), 1)
    likely_scanned = len(cleaned) < 200 or (human_ratio < 0.72 and section_hits == 0)
    score = 0.0
    score += min(len(alpha_words), 180) * 0.18
    score += section_hits * 9
    score += contact_hits * 8
    score += min(bullet_hits, 8) * 2.5
    score += min(date_hits, 10) * 1.5
    score += human_ratio * 25
    score -= pdf_noise_hits * 2.4
    score -= glyph_ratio * 80
    if likely_scanned:
        score -= 4

    return {
        "text_length": len(cleaned),
        "word_count": len(words),
        "alpha_word_count": len(alpha_words),
        "human_readable_ratio": round(human_ratio, 4),
        "section_heading_count": section_hits,
        "contact_hint_count": contact_hits,
        "bullet_count": bullet_hits,
        "date_count": date_hits,
        "glyph_ratio": round(glyph_ratio, 4),
        "pdf_noise_hits": pdf_noise_hits,
        "likely_scanned": likely_scanned,
        "score": round(score, 2),
    }


def choose_best_page_representation(page_number: int, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    ranked: List[Dict[str, Any]] = []
    for candidate in candidates:
        text = str(candidate.get("text") or "")
        quality = candidate.get("quality") or compute_text_quality(text)
        adjusted = float(quality["score"])
        method = str(candidate.get("method") or "unknown")
        if method == "native":
            adjusted += 1.5
        if method == "ocr" and quality["section_heading_count"] > 0:
            adjusted += 2.0
        if method == "merged" and quality["bullet_count"] > 0:
            adjusted += 2.5
        ranked.append(
            {
                **candidate,
                "page_number": page_number,
                "quality": quality,
                "adjusted_score": round(adjusted, 2),
            }
        )

    ranked.sort(key=lambda item: item["adjusted_score"], reverse=True)
    winner = ranked[0] if ranked else {"method": "unknown", "text": "", "quality": compute_text_quality("")}
    page_quality = winner["quality"]
    ocr_candidate = next((item for item in ranked if item.get("method") == "ocr"), None)
    native_candidate = next((item for item in ranked if item.get("method") == "native"), None)
    ocr_attempted = ocr_candidate is not None
    ocr_improved = (
        ocr_attempted
        and native_candidate is not None
        and float(ocr_candidate["adjusted_score"]) > float(native_candidate["adjusted_score"]) + 3
    )
    ocr_needed = bool(
        native_candidate
        and (
            native_candidate["quality"]["likely_scanned"]
            or native_candidate["quality"]["human_readable_ratio"] < 0.7
            or native_candidate["quality"]["section_heading_count"] == 0
        )
    )

    return {
        "page": page_number,
        "selected_method": winner.get("method"),
        "selected_score": winner.get("adjusted_score"),
        "selected_quality": page_quality,
        "candidates": [
            {
                "method": item.get("method"),
                "score": item.get("adjusted_score"),
                "text_length": item["quality"]["text_length"],
                "human_readable_ratio": item["quality"]["human_readable_ratio"],
                "section_heading_count": item["quality"]["section_heading_count"],
                "likely_scanned": item["quality"]["likely_scanned"],
            }
            for item in ranked
        ],
        "selected_text": str(winner.get("text") or ""),
        "ocr_needed": ocr_needed,
        "ocr_attempted": ocr_attempted,
        "ocr_improved_quality": ocr_improved,
        "layout_reconstruction_used": winner.get("method") == "merged",
    }


def summarize_page_sources(page_decisions: List[Dict[str, Any]]) -> Dict[str, int]:
    counter = Counter(str(item.get("selected_method") or "unknown") for item in page_decisions)
    return dict(counter)
