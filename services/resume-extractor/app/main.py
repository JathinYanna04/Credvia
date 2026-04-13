from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, ValidationError
import httpx
from app.page_intelligence import (
    build_layout_blocks,
    choose_best_page_representation,
    compute_text_quality,
    ingest_document,
    normalize_extracted_text,
    summarize_page_sources,
)

app = FastAPI(title="Credvia Resume Extractor", version="0.3.0")

SCHEMA_VERSION = "2.0.0"
PARSER_VERSION = "phase2-heuristic"

PDF_INTERNAL_PATTERNS = [
    re.compile(r"\bxref\b", re.I),
    re.compile(r"\bflatedecode\b", re.I),
    re.compile(r"\bobjstm\b", re.I),
    re.compile(r"\blength\d*\b", re.I),
    re.compile(r"\bfilter\b", re.I),
    re.compile(r"\bdecodeparms\b", re.I),
    re.compile(r"\bpdftex\b", re.I),
    re.compile(r"/[A-Za-z][A-Za-z0-9]+"),
    re.compile(r"\bendobj\b", re.I),
    re.compile(r"\bstream\b", re.I),
    re.compile(r"\bendstream\b", re.I),
    re.compile(r"\blinearized\b", re.I),
    re.compile(r"\btrailer\b", re.I),
]

PDF_CONTAMINATION_MARKERS = [
    "%PDF",
    " obj",
    "endobj",
    "stream",
    "endstream",
    "xref",
    "trailer",
    "/FlateDecode",
    "/Length",
    "/Type",
    "/Filter",
    "JFIF",
]

SECTION_HEADINGS = {
    "skills": re.compile(r"\bskills?\b", re.I),
    "education": re.compile(r"\beducation\b", re.I),
    "experience": re.compile(r"\b(experience|employment|work history)\b", re.I),
    "projects": re.compile(r"\bprojects?\b", re.I),
    "certifications": re.compile(r"\bcertifications?\b", re.I),
    "achievements": re.compile(r"\bachievements?|awards?\b", re.I),
    "positions_of_responsibility": re.compile(r"\b(position|leadership|responsibility)\b", re.I),
    "publications": re.compile(r"\bpublications?\b", re.I),
    "volunteering": re.compile(r"\bvolunteer(ing)?\b", re.I),
}

SECTION_SYNONYMS = {
    "skills": ["technical skills", "skills", "skillset", "tooling", "technologies", "technical expertise"],
    "core_competencies": ["core competencies", "core strengths", "competencies"],
    "education": ["education", "academics", "academic", "qualification", "qualifications"],
    "experience": [
        "experience",
        "work experience",
        "professional experience",
        "employment",
        "work history",
        "internships",
    ],
    "projects": ["projects", "project work", "academic projects", "personal projects"],
    "certifications": ["certifications", "certification", "licenses"],
    "achievements": ["achievements", "awards", "honors"],
    "positions_of_responsibility": ["positions of responsibility", "leadership", "responsibilities"],
    "roles_responsibilities": ["roles & responsibilities", "roles and responsibilities"],
    "hackathons": ["hackathons", "hackathons & competitions", "competitions", "contests"],
    "publications": ["publications", "research"],
    "volunteering": ["volunteering", "volunteer", "community"],
    "languages": ["languages", "language proficiency"],
    "courses": ["courses", "coursework", "relevant coursework"],
    "declaration": ["declaration"],
    "extra_curricular": ["extra curricular", "extra-curricular", "activities"],
}

DEGREE_KEYWORDS = re.compile(
    r"\b(b\.?sc|bachelor|m\.?sc|master|ph\.?d|mba|b\.?tech|m\.?tech|associate|intermediate|class\s*xii|class\s*x)\b",
    re.I,
)

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

STOPWORDS = {
    "the",
    "and",
    "with",
    "for",
    "from",
    "that",
    "this",
    "your",
    "you",
    "are",
    "was",
    "were",
    "will",
    "have",
    "has",
    "had",
    "resume",
}

PDF_INTERNAL_HINT = re.compile(r"\b(xref|flatedecode|objstm|endstream|startxref|endobj)\b", re.I)
PDF_METADATA_HINT = re.compile(
    r"/(Type|Length|Filter|DecodeParms|Root|Info|Pages|Catalog|Page|Font|Contents|MediaBox|Resources)\b"
)

SOFT_SKILLS = {
    "problem solving",
    "teamwork",
    "communication",
    "analytical thinking",
    "backend development",
    "agile development",
}

SPOKEN_LANGUAGES = {
    "english",
    "hindi",
    "telugu",
    "spanish",
    "french",
    "german",
    "mandarin",
    "tamil",
    "kannada",
    "malayalam",
}

PROGRAMMING_LANGUAGES = {
    "java",
    "python",
    "c",
    "c++",
    "c#",
    "javascript",
    "typescript",
    "sql",
    "go",
    "rust",
    "kotlin",
    "swift",
    "php",
    "ruby",
    "r",
    "scala",
    "dart",
}

TECHNOLOGY_CANONICAL = {
    "react": "React",
    "react.js": "React",
    "fastapi": "FastAPI",
    "javalin": "Javalin",
    "jdbc": "JDBC",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "supabase": "Supabase",
    "yolo": "YOLO",
    "opencv": "OpenCV",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "mongodb": "MongoDB",
    "docker": "Docker",
    "firebase": "Firebase",
    "power bi": "Power BI",
    "pypdf": "PyPDF",
}

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MAX_LLM_TEXT_CHARS = 12000


def read_env_value(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return default
    trimmed = value.strip()
    return trimmed if trimmed else default


def read_env_float(name: str, default: float) -> float:
    raw = read_env_value(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def read_env_int(name: str, default: int) -> int:
    raw = read_env_value(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def read_env_bool(name: str, default: bool) -> bool:
    raw = read_env_value(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


APP_VERSION = read_env_value("APP_VERSION", "0.3.0")
GIT_SHA = read_env_value("GIT_SHA", read_env_value("RENDER_GIT_COMMIT", "unknown"))
SCHEMA_VERSION = read_env_value("RESUME_SCHEMA_VERSION", SCHEMA_VERSION)
PARSER_VERSION = read_env_value("RESUME_PARSER_VERSION", PARSER_VERSION)
LLM_ALWAYS_ON = read_env_bool("LLM_ALWAYS_ON", True)
LLM_PROVIDER = read_env_value("LLM_PROVIDER", "groq")
RESUME_EXTRACTOR_GROQ_MODEL = read_env_value(
    "RESUME_EXTRACTOR_GROQ_MODEL",
    read_env_value("GROQ_MODEL", "llama-3.1-8b-instant"),
)
RESUME_EXTRACTOR_GROQ_BASE_URL = read_env_value(
    "RESUME_EXTRACTOR_GROQ_BASE_URL",
    read_env_value("GROQ_BASE_URL", GROQ_BASE_URL),
)
OPENAI_MODEL = read_env_value("OPENAI_MODEL", "gpt-4.1-mini")
LLM_TIMEOUT_SECONDS = read_env_float("LLM_TIMEOUT_SECONDS", read_env_float("GROQ_TIMEOUT_SECONDS", 12.0))
GROQ_FORCE = read_env_bool("GROQ_FORCE", False)
RESUME_CACHE_ENABLED = read_env_bool("RESUME_CACHE_ENABLED", False)
OCR_ENABLED = read_env_bool("OCR_ENABLED", True)
MAX_LLM_TEXT_CHARS = read_env_int("MAX_LLM_TEXT_CHARS", DEFAULT_MAX_LLM_TEXT_CHARS)
MAX_INPUT_SIZE_BYTES = read_env_int("MAX_INPUT_SIZE_BYTES", 10 * 1024 * 1024)
LOG_LEVEL = read_env_value("LOG_LEVEL", read_env_value("RESUME_LOG_LEVEL", "info"))

RESUME_CACHE: Dict[str, Dict[str, Any]] = {}
RESUME_CACHE_MAX = 32


def log_event(message: str) -> None:
    if (LOG_LEVEL or "info").lower() == "none":
        return
    print(f"[resume-extractor] {message}")


def llm_provider_configured() -> bool:
    groq_key = read_env_value("RESUME_EXTRACTOR_GROQ_API_KEY")
    if LLM_PROVIDER == "openai":
        return bool(read_env_value("OPENAI_API_KEY"))
    return bool(groq_key) or bool(read_env_value("OPENAI_API_KEY"))


@app.on_event("startup")
def startup_validation() -> None:
    if LLM_ALWAYS_ON and not llm_provider_configured():
        log_event("startup_warning llm_always_on=true but no LLM provider key is configured; extractor will fall back deterministically.")


def get_cache_key(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


def get_cached_parse(cache_key: str) -> Optional[Dict[str, Any]]:
    if not RESUME_CACHE_ENABLED:
        return None
    return RESUME_CACHE.get(cache_key)


def set_cached_parse(cache_key: str, payload: Dict[str, Any]) -> None:
    if not RESUME_CACHE_ENABLED:
        return
    if len(RESUME_CACHE) >= RESUME_CACHE_MAX:
        RESUME_CACHE.pop(next(iter(RESUME_CACHE)))
    RESUME_CACHE[cache_key] = payload


class RequestMeta(BaseModel):
    request_id: str
    filename: str
    mime_type: str
    file_size_bytes: int
    parsed_at: str


class StatusBlock(BaseModel):
    success: bool
    processing_mode: str
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    confidence_overall: float = 0.0


class RawBlock(BaseModel):
    raw_text: str
    cleaned_text: str
    page_count: int = 1


class CandidateBasics(BaseModel):
    full_name: Optional[str] = None
    current_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None


class SkillsBlock(BaseModel):
    languages: List[str] = Field(default_factory=list)
    frameworks: List[str] = Field(default_factory=list)
    libraries: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    databases: List[str] = Field(default_factory=list)
    cloud: List[str] = Field(default_factory=list)
    ai_ml: List[str] = Field(default_factory=list)
    devops: List[str] = Field(default_factory=list)
    platforms: List[str] = Field(default_factory=list)
    others: List[str] = Field(default_factory=list)
    spoken_languages: List[str] = Field(default_factory=list)


class EducationEntry(BaseModel):
    institution: Optional[str] = None
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    grade: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None


class ExperienceEntry(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currently_working: bool = False
    bullets: List[str] = Field(default_factory=list)
    technologies: List[str] = Field(default_factory=list)


class ProjectEntry(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    links: List[str] = Field(default_factory=list)
    bullets: List[str] = Field(default_factory=list)


class SectionsBlock(BaseModel):
    skills: SkillsBlock
    education: List[EducationEntry] = Field(default_factory=list)
    experience: List[ExperienceEntry] = Field(default_factory=list)
    projects: List[ProjectEntry] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    achievements: List[str] = Field(default_factory=list)
    positions_of_responsibility: List[str] = Field(default_factory=list)
    hackathons: List[str] = Field(default_factory=list)
    publications: List[str] = Field(default_factory=list)
    volunteering: List[str] = Field(default_factory=list)
    extracurricular: List[str] = Field(default_factory=list)


class AtsFields(BaseModel):
    total_experience_months: Optional[int] = None
    inferred_role: Optional[str] = None
    seniority_level: Optional[str] = None
    top_keywords: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    extraction_quality_score: float = 0.0


class ConfidenceBlock(BaseModel):
    candidate_basics: float = 0.0
    skills: float = 0.0
    education: float = 0.0
    experience: float = 0.0
    projects: float = 0.0
    overall: float = 0.0


class DiagnosticsBlock(BaseModel):
    method_used: str
    page_methods: List[Dict[str, str]] = Field(default_factory=list)
    page_decisions: List[Dict[str, Any]] = Field(default_factory=list)
    page_source_summary: Dict[str, int] = Field(default_factory=dict)
    page_count: int = 0
    native_text_quality: Dict[str, Any] = Field(default_factory=dict)
    contamination_score: float = 0.0
    salvage_score: float = 0.0
    extraction_quality_score: float = 0.0
    cleaning_actions: List[str] = Field(default_factory=list)
    ocr_needed: bool = False
    ocr_status: Optional[str] = None
    ocr_attempted: bool = False
    ocr_improved_quality: Optional[bool] = None
    layout_reconstruction_used: bool = False
    final_source: Optional[str] = None
    llm_requested: bool = False
    llm_skipped: bool = False
    llm_attempted: bool = False
    llm_status: Optional[str] = None
    llm_error: Optional[str] = None
    llm_raw_present: Optional[bool] = None
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    request_id: Optional[str] = None
    parser_version: Optional[str] = None
    schema_version: Optional[str] = None


class NormalizedResume(BaseModel):
    text: str
    sections: Dict[str, List[str]] = Field(default_factory=dict)


class ExtractResponse(BaseModel):
    schema_version: str
    parser_version: str
    request: RequestMeta
    status: StatusBlock
    raw: RawBlock
    candidate: CandidateBasics
    sections: SectionsBlock
    ats: AtsFields
    confidence: ConfidenceBlock
    diagnostics: DiagnosticsBlock
    normalized_resume: NormalizedResume


def count_hits(text: str, patterns: List[re.Pattern]) -> int:
    return sum(len(p.findall(text)) for p in patterns)


def contamination_score(text: str) -> float:
    if not text.strip():
        return 100.0
    tokens = re.findall(r"\S+", text)
    internal_hits = count_hits(text, PDF_INTERNAL_PATTERNS)
    internal_ratio = internal_hits / max(len(tokens), 1)
    binary_ratio = len(re.findall(r"[^\x20-\x7E]", text)) / max(len(text), 1)
    score = min(100.0, (internal_ratio * 120.0) + (binary_ratio * 80.0))
    return round(score, 2)


def printable_ratio(text: str) -> float:
    if not text:
        return 0.0
    printable = sum(1 for ch in text if 32 <= ord(ch) <= 126)
    return printable / max(len(text), 1)


def looks_like_pdf_binary(text: str) -> bool:
    if not text:
        return True
    lowered = text.lower()
    marker_hits = sum(1 for marker in PDF_CONTAMINATION_MARKERS if marker.lower() in lowered)
    return marker_hits >= 3 or printable_ratio(text) < 0.7


def is_probable_pdf_bytes(file_bytes: bytes) -> bool:
    return file_bytes[:4] == b"%PDF"


def clean_resume_text(raw: str) -> Tuple[str, List[str]]:
    normalized_raw = normalize_extracted_text(raw)
    lines = normalized_raw.splitlines()
    cleaned_lines = []
    actions: List[str] = []
    removed_lines = 0
    normalized_bullets = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        before = stripped
        stripped = stripped.replace("\uf0b7", "•").replace("\u2023", "•").replace("\u25e6", "•")
        stripped = stripped.replace("â€¢", "•").replace("Â·", "•").replace("·", "•")
        if stripped != before:
            normalized_bullets += 1
        tokens = re.findall(r"\S+", stripped)
        alpha_words = re.findall(r"\b[A-Za-z]{2,}\b", stripped)
        internal_hits = count_hits(stripped, PDF_INTERNAL_PATTERNS)
        internal_ratio = internal_hits / max(len(tokens), 1)
        alpha_ratio = len(alpha_words) / max(len(tokens), 1)
        if internal_ratio > 0.35 and alpha_ratio < 0.4:
            removed_lines += 1
            continue
        if re.search(r"/(Type|Length|Filter|DecodeParms|Creator|Producer|CreationDate)", stripped):
            removed_lines += 1
            continue
        if "linearized" in stripped.lower():
            removed_lines += 1
            continue
        cleaned_lines.append(stripped)
    if removed_lines > 0:
        actions.append("removed_pdf_internal_lines")
    cleaned = "\n".join(cleaned_lines)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"([A-Za-z])-\n(?=[A-Za-z])", r"\1", cleaned)
    cleaned = re.sub(r"\s+\n", "\n", cleaned)
    if normalized_bullets:
        actions.append("normalized_bullets")
    actions.append("normalized_whitespace")
    return cleaned.strip(), actions


def reconstruct_resume_text(cleaned: str) -> str:
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    reconstructed: List[str] = []
    for line in lines:
        is_heading = any(pattern.search(line) for pattern in SECTION_HEADINGS.values())
        if is_heading or line.endswith(":"):
            reconstructed.append(line.upper())
            continue
        if reconstructed and not reconstructed[-1].endswith((".", ":", ";")) and line[0:1].islower():
            reconstructed[-1] = f"{reconstructed[-1]} {line}"
        else:
            reconstructed.append(line)
    return "\n".join(reconstructed)


def try_ocr_image(image: Any) -> Tuple[str, Optional[str]]:
    try:
        from paddleocr import PaddleOCR

        ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        result = ocr.ocr(image, cls=True) or []
        lines: List[str] = []
        for page_result in result:
            for item in page_result or []:
                if len(item) >= 2 and item[1]:
                    text = str(item[1][0]).strip()
                    if text:
                        lines.append(text)
        if lines:
            return "\n".join(lines), "paddleocr"
    except Exception:
        pass

    try:
        import pytesseract

        return pytesseract.image_to_string(image), "tesseract"
    except Exception:
        return "", None


def extract_pdf_text(file_bytes: bytes) -> Tuple[str, int, List[Dict[str, str]]]:
    try:
        import fitz
    except Exception:
        return "", 0, []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:
        fallback_text = file_bytes.decode("utf-8", errors="ignore")
        fallback_quality = compute_text_quality(fallback_text)
        diagnostics = {
            "page_decisions": [
                {
                    "page": 1,
                    "selected_method": "native",
                    "selected_score": fallback_quality["score"],
                    "selected_quality": fallback_quality,
                    "candidates": [],
                    "selected_text": fallback_text,
                    "ocr_needed": False,
                    "ocr_attempted": False,
                    "ocr_improved_quality": None,
                    "layout_reconstruction_used": False,
                }
            ],
            "page_source_summary": {"native": 1},
            "ocr_needed": False,
            "ocr_status": "skipped_unnecessary",
            "ocr_attempted": False,
            "ocr_improved_quality": None,
            "layout_reconstruction_used": False,
        }
        return fallback_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", [
            "pdf_open_failed_text_fallback"
        ], diagnostics
    chunks: List[str] = []
    page_methods: List[Dict[str, str]] = []
    for index, page in enumerate(doc):
        chunks.append(page.get_text("text"))
        page_methods.append({"page": str(index + 1), "method": "pdf-native"})
    return "\n".join(chunks), doc.page_count, page_methods


def extract_pdf_with_page_intelligence(
    file_bytes: bytes,
) -> Tuple[str, int, List[Dict[str, str]], str, List[str], Dict[str, Any]]:
    try:
        import fitz
    except Exception:
        return "", 0, [], "pdf-native", ["pymupdf_unavailable"], {
            "page_decisions": [],
            "page_source_summary": {},
            "ocr_needed": False,
            "ocr_status": "unavailable_preserved_previous",
            "ocr_attempted": False,
            "ocr_improved_quality": None,
            "layout_reconstruction_used": False,
        }
    try:
        from PIL import Image
    except Exception:
        Image = None  # type: ignore[assignment]

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    selected_pages: List[str] = []
    page_methods: List[Dict[str, str]] = []
    page_decisions: List[Dict[str, Any]] = []
    actions: List[str] = []

    for index, page in enumerate(doc, start=1):
        native_text = page.get_text("text") or ""
        block_items = page.get_text("blocks") or []
        sorted_blocks = sorted(block_items, key=lambda item: (item[1], item[0])) if block_items else []
        block_text = "\n".join(
            str(item[4]).strip() for item in sorted_blocks if len(item) > 4 and str(item[4]).strip()
        )
        merged_text = "\n".join(filter(None, [block_text, native_text]))
        candidates: List[Dict[str, Any]] = [
            {"method": "native", "text": native_text, "blocks": []},
        ]
        if block_text.strip():
            candidates.append({"method": "merged", "text": merged_text, "blocks": build_layout_blocks(block_text)})

        native_quality = compute_text_quality(native_text)
        should_try_ocr = (
            native_quality["likely_scanned"]
            or native_quality["human_readable_ratio"] < 0.72
            or native_quality["section_heading_count"] == 0
            or native_quality["pdf_noise_hits"] >= 2
        )

        ocr_provider: Optional[str] = None
        if should_try_ocr and Image is not None:
            pix = page.get_pixmap(dpi=220)
            mode = "RGB" if pix.alpha == 0 else "RGBA"
            image = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
            ocr_text, ocr_provider = try_ocr_image(image)
            if ocr_text.strip():
                candidates.append({"method": "ocr", "text": ocr_text, "blocks": build_layout_blocks(ocr_text)})
                actions.append(f"page_{index}_ocr_candidate")
            else:
                actions.append(f"page_{index}_ocr_unavailable")

        decision = choose_best_page_representation(index, candidates)
        selected_pages.append(decision["selected_text"])
        selected_method = decision.get("selected_method") or "native"
        page_methods.append({"page": str(index), "method": f"pdf-{selected_method}"})
        decision["ocr_provider"] = ocr_provider
        page_decisions.append(decision)

    page_source_summary = summarize_page_sources(page_decisions)
    ocr_needed = any(bool(item.get("ocr_needed")) for item in page_decisions)
    ocr_attempted = any(bool(item.get("ocr_attempted")) for item in page_decisions)
    ocr_improved_quality = (
        any(bool(item.get("ocr_improved_quality")) for item in page_decisions) if ocr_attempted else None
    )
    layout_reconstruction_used = any(
        bool(item.get("layout_reconstruction_used")) for item in page_decisions
    )

    if ocr_attempted and any(item.get("selected_method") == "ocr" for item in page_decisions):
        ocr_status = "used_successfully"
    elif ocr_attempted:
        ocr_status = "attempted_no_gain"
    elif ocr_needed:
        ocr_status = "unavailable_preserved_previous"
    else:
        ocr_status = "skipped_unnecessary"

    dominant_method = max(page_source_summary.items(), key=lambda item: item[1])[0] if page_source_summary else "native"
    document_text = "\n\n".join(page for page in selected_pages if page.strip())
    diagnostics = {
        "page_decisions": page_decisions,
        "page_source_summary": page_source_summary,
        "ocr_needed": ocr_needed,
        "ocr_status": ocr_status,
        "ocr_attempted": ocr_attempted,
        "ocr_improved_quality": ocr_improved_quality,
        "layout_reconstruction_used": layout_reconstruction_used,
    }
    return document_text, doc.page_count, page_methods, f"pdf-{dominant_method}", actions, diagnostics


def extract_docx_text(file_bytes: bytes) -> str:
    try:
        import docx
    except Exception:
        return ""
    doc = docx.Document(io.BytesIO(file_bytes))
    return "\n".join([p.text for p in doc.paragraphs])


def extract_rtf_text(file_bytes: bytes) -> str:
    try:
        from striprtf.striprtf import rtf_to_text
    except Exception:
        return ""
    return rtf_to_text(file_bytes.decode("utf-8", errors="ignore"))


def extract_text_by_type(
    file_bytes: bytes, mime_type: str, filename: str
) -> Tuple[str, int, List[Dict[str, str]], str, List[str], Dict[str, Any]]:
    lower = filename.lower()
    actions: List[str] = []
    document_meta = ingest_document(file_bytes, mime_type, filename)
    is_pdf = mime_type == "application/pdf" or lower.endswith(".pdf") or is_probable_pdf_bytes(file_bytes)
    if is_pdf:
        text, pages, page_methods, method_used, pdf_actions, diagnostics = extract_pdf_with_page_intelligence(
            file_bytes
        )
        return text, pages, page_methods, method_used, actions + pdf_actions, {
            **diagnostics,
            "document": document_meta,
        }
    if lower.endswith(".docx") or "wordprocessingml.document" in mime_type:
        return extract_docx_text(file_bytes), 1, [{"page": "1", "method": "docx"}], "docx", actions, {
            "page_decisions": [],
            "page_source_summary": {"docx": 1},
            "ocr_needed": False,
            "ocr_status": "skipped_unnecessary",
            "ocr_attempted": False,
            "ocr_improved_quality": None,
            "layout_reconstruction_used": False,
            "document": document_meta,
        }
    if lower.endswith(".rtf") or "rtf" in mime_type:
        return extract_rtf_text(file_bytes), 1, [{"page": "1", "method": "rtf"}], "rtf", actions, {
            "page_decisions": [],
            "page_source_summary": {"rtf": 1},
            "ocr_needed": False,
            "ocr_status": "skipped_unnecessary",
            "ocr_attempted": False,
            "ocr_improved_quality": None,
            "layout_reconstruction_used": False,
            "document": document_meta,
        }
    return file_bytes.decode("utf-8", errors="ignore"), 1, [{"page": "1", "method": "text"}], "text", actions, {
        "page_decisions": [],
        "page_source_summary": {"text": 1},
        "ocr_needed": False,
        "ocr_status": "skipped_unnecessary",
        "ocr_attempted": False,
        "ocr_improved_quality": None,
        "layout_reconstruction_used": False,
        "document": document_meta,
    }


def infer_candidate_basics(text: str) -> CandidateBasics:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    email = next(iter(re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I)), None)
    phone = next(iter(re.findall(r"\+?\d[\d\s()+-]{7,}", text)), None)
    linkedin = next(iter(re.findall(r"https?://(www\.)?linkedin\.com/[^\s]+", text, re.I)), None)
    github = next(iter(re.findall(r"https?://(www\.)?github\.com/[^\s]+", text, re.I)), None)
    portfolio = next(iter(re.findall(r"https?://[^\s]+", text, re.I)), None)

    name = None
    for line in lines[:6]:
        if "@" in line or "linkedin" in line.lower() or "github" in line.lower():
            continue
        if 2 <= len(line.split()) <= 5:
            name = line
            break

    summary = None
    for line in lines:
        if (
            len(line.split()) >= 8
            and not re.search(r"\bskills?\b", line, re.I)
            and not looks_like_contact_line(line)
            and not looks_like_location_noise(line)
        ):
            summary = line
            break

    location = None
    for line in lines[:8]:
        if looks_like_location_line(line):
            location = line
            break

    return CandidateBasics(
        full_name=name,
        email=email,
        phone=phone,
        linkedin=linkedin,
        github=github,
        portfolio=portfolio,
        location=location,
        summary=summary,
    )


def normalize_heading_text(text: str) -> str:
    merged = re.sub(r"([A-Za-z])-\s*\n\s*([A-Za-z])", r"\1\2", text)
    merged = merged.replace("\n", " ").strip()
    merged = re.sub(r"[^A-Za-z0-9\s&/+-]", "", merged)
    return re.sub(r"\s+", " ", merged).lower()


def split_sections(text: str) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {key: [] for key in SECTION_SYNONYMS}
    current = "unknown"
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        normalized = normalize_heading_text(stripped)
        if len(stripped) <= 40 and stripped.isupper():
            for key, synonyms in SECTION_SYNONYMS.items():
                if any(normalized == label for label in synonyms):
                    current = key
                    normalized = ""
                    break
        if normalized:
            for key, synonyms in SECTION_SYNONYMS.items():
                if any(normalized.startswith(label) for label in synonyms):
                    current = key
                    normalized = ""
                    break
        if current in sections and normalized:
            sections[current].append(stripped)
    return sections


def classify_skills(tokens: List[str]) -> SkillsBlock:
    catalog = {
        "languages": PROGRAMMING_LANGUAGES,
        "frameworks": {"react", "fastapi", "node.js", "node", "express", "django", "spring", "javalin"},
        "tools": {"git", "linux", "kali linux", "docker", "postman", "power bi", "firebase", "opencv", "yolo"},
        "databases": {"postgresql", "mysql", "mongodb", "supabase", "oracle"},
        "cloud": {"aws", "gcp", "azure", "vercel", "netlify"},
    }
    normalized_to_original: Dict[str, str] = {}
    for token in tokens:
        cleaned = token.strip()
        if cleaned:
            normalized_to_original[cleaned.lower()] = cleaned
    result = SkillsBlock()
    for normalized, original in normalized_to_original.items():
        if normalized in SPOKEN_LANGUAGES:
            result.spoken_languages.append(original)
            continue
        if normalized in SOFT_SKILLS:
            result.others.append(original)
            continue
        if normalized in catalog["languages"]:
            result.languages.append(original)
        elif normalized in catalog["frameworks"]:
            result.frameworks.append(original)
        elif normalized in catalog["tools"]:
            result.tools.append(original)
        elif normalized in catalog["databases"]:
            result.databases.append(original)
        elif normalized in catalog["cloud"]:
            result.cloud.append(original)
        elif len(normalized) > 2 and normalized not in STOPWORDS:
            result.others.append(original)
    return result


def parse_skills_section(lines: List[str]) -> SkillsBlock:
    tokens: List[str] = []
    for line in lines:
        if re.search(r"\bcore competencies\b", line, re.I):
            continue
        parts = re.split(r"[•,|/;]\s*", line)
        for part in parts:
            part = part.strip(" :-")
            if len(part) > 1:
                tokens.append(part)
    return classify_skills(tokens)


def parse_education(lines: List[str]) -> List[EducationEntry]:
    entries: List[EducationEntry] = []
    current: Optional[EducationEntry] = None

    def extract_field_of_study(degree_line: str) -> Optional[str]:
        cleaned = re.sub(r"\b(b\.?sc|bachelor|m\.?sc|master|ph\.?d|mba|b\.?tech|m\.?tech|associate)\b", "", degree_line, flags=re.I)
        cleaned = re.sub(r"\b(class\s*xii|class\s*x)\b", "", cleaned, flags=re.I)
        cleaned = cleaned.strip(" -")
        return cleaned if cleaned else None

    def parse_years(text: str) -> Tuple[Optional[str], Optional[str]]:
        range_match = re.search(
            r"(19|20)\d{2}\s*[–-]\s*(19|20)\d{2}|(19|20)\d{2}\s*[–-]\s*present",
            text,
            re.I,
        )
        if range_match:
            years = re.findall(r"(19|20)\d{2}", text)
            if len(years) >= 2:
                return years[0], years[1]
            if years:
                return years[0], "Present"
        single_year = re.search(r"(19|20)\d{2}", text)
        if single_year:
            return None, single_year.group(0)
        return None, None

    for line in lines:
        if re.search(r"\b(declaration|roles?\s*&?\s*responsibilities)\b", line, re.I):
            break
        if DEGREE_KEYWORDS.search(line):
            if current:
                entries.append(current)
            current = EducationEntry(degree=line)
            current.field_of_study = extract_field_of_study(line)
            continue
        if re.search(r"\b(CGPA|GPA|Grade|Score)\b", line, re.I):
            if current:
                grade_match = re.search(r"(CGPA|GPA|Score)\s*[:\-]?\s*([0-9.]+(\s*/\s*\d+)?)", line, re.I)
                current.grade = grade_match.group(2) if grade_match else line
            continue
        start_year, end_year = parse_years(line)
        if start_year or end_year:
            if current:
                current.start_date = start_year or current.start_date
                current.end_date = end_year or current.end_date
            continue
        if current and not current.institution:
            current.institution = line
        elif current:
            if re.search(r"\brelevant coursework\b", line, re.I):
                current.description = line if not current.description else f"{current.description}\n{line}"
            else:
                current.description = f"{current.description}\n{line}".strip() if current.description else line
    if current:
        entries.append(current)
    return entries


def parse_experience(lines: List[str]) -> List[ExperienceEntry]:
    entries: List[ExperienceEntry] = []
    current: Optional[ExperienceEntry] = None
    for line in lines:
        if re.search(r"\b(projects?|education|certifications|declaration)\b", line, re.I):
            break
        date_range = re.search(r"\b(\w{3,9}\s+\d{4}).*(\w{3,9}\s+\d{4}|Present)\b", line, re.I)
        if date_range:
            if current:
                entries.append(current)
            current = ExperienceEntry(
                start_date=date_range.group(1),
                end_date=date_range.group(2),
                currently_working="present" in date_range.group(2).lower(),
            )
            continue
        if line.startswith(("-", "•", "â€¢", "*")):
            if not current:
                current = ExperienceEntry()
            current.bullets.append(line.lstrip("-•â€¢* ").strip())
            continue
        if current and not current.company:
            current.company = line
        elif current and not current.title:
            current.title = line
        elif current and current.location is None and re.search(r"\b[A-Z][a-z]+,\s?[A-Z]{2}\b", line):
            current.location = line
    if current:
        entries.append(current)
    return entries


def parse_projects(lines: List[str]) -> List[ProjectEntry]:
    entries: List[ProjectEntry] = []
    current: Optional[ProjectEntry] = None
    for line in lines:
        if re.search(r"\bdeclaration\b", line, re.I):
            break
        if re.match(r"^(19|20)\d{2}", line):
            if current:
                current.description = f"{current.description}\n{line}".strip() if current.description else line
            continue
        if line.startswith(("-", "•", "â€¢", "*")):
            if not current:
                current = ProjectEntry()
            current.bullets.append(line.lstrip("-•â€¢* ").strip())
            continue
        if current:
            entries.append(current)
        current = ProjectEntry(name=line)
    if current:
        entries.append(current)
    return entries


def parse_experience_v2(lines: List[str]) -> List[ExperienceEntry]:
    entries: List[ExperienceEntry] = []
    current: Optional[ExperienceEntry] = None
    pending_header: List[str] = []

    def is_date_line(text: str) -> bool:
        return bool(
            re.search(r"(19|20)\d{2}\s*[–-]\s*(19|20)\d{2}|(19|20)\d{2}\s*[–-]\s*present", text, re.I)
            or re.search(r"\b([A-Za-z]{3,9}\s+\d{4}).*(Present|[A-Za-z]{3,9}\s+\d{4})\b", text, re.I)
        )

    def extract_date_range(text: str) -> Tuple[Optional[str], Optional[str]]:
        month_years = re.findall(r"[A-Za-z]{3,9}\s+\d{4}", text)
        if month_years:
            start = month_years[0]
            end = month_years[1] if len(month_years) > 1 else None
            if re.search(r"present", text, re.I):
                end = "Present"
            return start, end
        years = re.findall(r"(19|20)\d{2}", text)
        if years:
            start = years[0]
            end = years[-1] if len(years) > 1 else None
            if re.search(r"present", text, re.I):
                end = "Present"
            return start, end
        return None, None

    def apply_header(entry: ExperienceEntry, header_lines: List[str]) -> None:
        if not header_lines:
            return
        entry.company = header_lines[0] if len(header_lines) > 0 else entry.company
        entry.title = header_lines[1] if len(header_lines) > 1 else entry.title

    for line in lines:
        if re.search(r"\b(projects?|education|certifications|declaration)\b", line, re.I):
            break
        if is_date_line(line):
            if not current:
                current = ExperienceEntry()
                apply_header(current, pending_header)
                pending_header = []
            start_date, end_date = extract_date_range(line)
            if start_date:
                current.start_date = start_date
                current.end_date = end_date
                current.currently_working = bool(end_date and "present" in end_date.lower())
            continue
        if line.startswith(("-", "•", "â€¢", "*")):
            if not current:
                current = ExperienceEntry()
            current.bullets.append(line.lstrip("-•â€¢* ").strip())
            continue
        if not current:
            pending_header.append(line)
        else:
            if not current.company:
                current.company = line
            elif not current.title:
                current.title = line
            elif current.location is None and re.search(r"\b[A-Z][a-z]+,\s?[A-Z]{2}\b", line):
                current.location = line
    if current:
        entries.append(current)
    return entries


def parse_projects_v2(lines: List[str]) -> List[ProjectEntry]:
    entries: List[ProjectEntry] = []
    current: Optional[ProjectEntry] = None

    def is_date_only(text: str) -> bool:
        return bool(re.fullmatch(r"(19|20)\d{2}", text.strip()))

    for line in lines:
        if re.search(r"\bdeclaration\b", line, re.I):
            break
        if line.startswith(("-", "•", "â€¢", "*")):
            if not current:
                current = ProjectEntry()
            current.bullets.append(line.lstrip("-•â€¢* ").strip())
            continue
        if is_date_only(line):
            if current and not current.description:
                current.description = line.strip()
            continue
        if current and current.name and (current.bullets or current.description):
            entries.append(current)
            current = ProjectEntry(name=line)
            continue
        if not current:
            current = ProjectEntry(name=line)
        elif current.name and not current.description:
            current.description = line
        else:
            entries.append(current)
            current = ProjectEntry(name=line)
    if current:
        entries.append(current)
    return entries


def should_use_llm_enhancement(
    sections: SectionsBlock,
    confidence: ConfidenceBlock,
    section_map: Dict[str, List[str]],
) -> bool:
    if GROQ_FORCE:
        return True
    if confidence.overall < 0.85:
        return True

    skills_core_count = sum(
        len(bucket)
        for bucket in [
            sections.skills.languages,
            sections.skills.frameworks,
            sections.skills.tools,
            sections.skills.databases,
            sections.skills.cloud,
        ]
    )
    if skills_core_count == 0:
        return True

    experience_missing = any(
        entry.bullets and not (entry.company or entry.title) for entry in sections.experience
    )
    if experience_missing:
        return True

    fragmented_education = (
        len(sections.education) >= 4
        and sum(1 for entry in sections.education if entry.degree or entry.institution)
        < len(sections.education) * 0.6
    )
    if fragmented_education:
        return True

    projects_bad = any(
        (entry.name and re.search(r"\bdeclaration\b", entry.name, re.I))
        or (entry.name and re.match(r"^(19|20)\d{2}$", entry.name.strip()))
        for entry in sections.projects
    )
    if projects_bad or section_map.get("declaration"):
        return True

    if (
        len(sections.experience) == 0
        and len(sections.projects) == 0
        and len(sections.education) == 0
        and skills_core_count == 0
    ):
        return True

    return False


def build_llm_prompt(cleaned_text: str, sections: Dict[str, Any]) -> str:
    schema = {
        "candidate": {
            "full_name": None,
            "current_title": None,
            "email": None,
            "phone": None,
            "location": None,
            "linkedin": None,
            "github": None,
            "portfolio": None,
            "summary": None,
        },
        "skills": {
            "languages": [],
            "frameworks": [],
            "tools": [],
            "databases": [],
            "cloud": [],
            "others": [],
            "spoken_languages": [],
        },
        "education": [
            {
                "institution": None,
                "degree": None,
                "field_of_study": None,
                "start_date": None,
                "end_date": None,
                "grade": None,
                "location": None,
                "description": None,
            }
        ],
        "experience": [
            {
                "company": None,
                "title": None,
                "location": None,
                "start_date": None,
                "end_date": None,
                "currently_working": False,
                "bullets": [],
                "technologies": [],
            }
        ],
        "projects": [
            {
                "name": None,
                "description": None,
                "technologies": [],
                "links": [],
                "bullets": [],
            }
        ],
        "additional": {
            "certifications": [],
            "achievements": [],
            "hackathons": [],
            "leadership": [],
            "volunteering": [],
            "publications": [],
        },
    }

    return (
        "You are a resume parsing assistant. Return ONLY JSON that matches the schema exactly. "
        "Do not add fields. Do not hallucinate. Use only information present in the text. "
        "Only correct candidate basics, skills classification, education grouping, experience grouping, project grouping, "
        "and additional qualifications. "
        "Do NOT compute total experience months. "
        "Do NOT place spoken languages (English, Hindi, etc.) into programming languages. "
        "Do NOT output date-only project names. "
        "Do NOT hallucinate technologies not present in the text. "
        "Certifications must only include real certifications. "
        "Keep achievements separate from hackathons and leadership.\n\n"
        f"Resume text:\n{cleaned_text}\n\n"
        f"Current parsed sections (may be imperfect):\n{json.dumps(sections, ensure_ascii=False)}\n\n"
        f"JSON schema to follow exactly:\n{json.dumps(schema, ensure_ascii=False)}"
    )


def validate_refined_output(refined: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    required = {"candidate", "skills", "education", "experience", "projects", "additional"}
    if not required.issubset(refined.keys()):
        return None

    if not isinstance(refined.get("candidate"), dict):
        return None
    candidate = refined.get("candidate")
    allowed_candidate_keys = {
        "full_name",
        "current_title",
        "email",
        "phone",
        "location",
        "linkedin",
        "github",
        "portfolio",
        "summary",
    }
    if not set(candidate.keys()).issubset(allowed_candidate_keys):
        return None

    skills = refined.get("skills")
    if not isinstance(skills, dict):
        return None
    for bucket in [
        "languages",
        "frameworks",
        "tools",
        "databases",
        "cloud",
        "others",
        "spoken_languages",
    ]:
        if bucket not in skills or not isinstance(skills[bucket], list):
            return None

    if not is_valid_skills_block(skills):
        return None

    if not isinstance(refined.get("education"), list):
        return None
    if not isinstance(refined.get("experience"), list):
        return None
    if not isinstance(refined.get("projects"), list):
        return None

    allowed_education_keys = {
        "institution",
        "degree",
        "field_of_study",
        "start_date",
        "end_date",
        "grade",
        "location",
        "description",
    }
    allowed_experience_keys = {
        "company",
        "title",
        "location",
        "start_date",
        "end_date",
        "currently_working",
        "bullets",
        "technologies",
    }
    allowed_project_keys = {"name", "description", "technologies", "links", "bullets"}

    for entry in refined.get("education", []):
        if isinstance(entry, dict) and not set(entry.keys()).issubset(allowed_education_keys):
            return None
    for entry in refined.get("experience", []):
        if isinstance(entry, dict) and not set(entry.keys()).issubset(allowed_experience_keys):
            return None
    for entry in refined.get("projects", []):
        if isinstance(entry, dict) and not set(entry.keys()).issubset(allowed_project_keys):
            return None

    education_entries = refined.get("education") or []
    if education_entries and not is_valid_education_list(education_entries):
        return None

    experience_entries = refined.get("experience") or []
    if experience_entries and not is_valid_experience_list(experience_entries):
        return None

    project_entries = refined.get("projects") or []
    if project_entries and not is_valid_project_list(project_entries):
        return None

    additional = refined.get("additional")
    if not isinstance(additional, dict):
        return None
    for bucket in [
        "certifications",
        "achievements",
        "hackathons",
        "leadership",
        "volunteering",
        "publications",
    ]:
        if bucket not in additional or not isinstance(additional[bucket], list):
            return None

    return refined


def parse_llm_json(content: Optional[str]) -> Tuple[Optional[Dict[str, Any]], Optional[str], bool]:
    if content is None:
        return None, "empty_response", False
    raw_present = bool(content.strip())
    if not raw_present:
        return None, "empty_response", False
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
        cleaned = cleaned.rsplit("```", 1)[0].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None, "no_json_object", raw_present
    candidate = cleaned[start : end + 1]
    try:
        parsed = json.loads(candidate)
        return parsed, None, raw_present
    except json.JSONDecodeError as exc:
        return None, f"json_decode_error:{exc.msg}", raw_present


def is_date_only_project(name: Optional[str]) -> bool:
    if not name:
        return True
    cleaned = name.strip()
    if re.fullmatch(r"(19|20)\d{2}", cleaned):
        return True
    if re.fullmatch(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(19|20)\d{2}", cleaned, re.I):
        return True
    return False


def is_valid_skills_block(skills: Dict[str, Any]) -> bool:
    if not isinstance(skills, dict):
        return False
    languages = skills.get("languages", [])
    if languages and all(str(lang).lower() in SPOKEN_LANGUAGES for lang in languages):
        return False
    return True


def is_valid_experience_list(entries: List[Dict[str, Any]]) -> bool:
    if not entries:
        return False
    has_header = False
    for entry in entries:
        if not isinstance(entry, dict):
            return False
        if entry.get("company") or entry.get("title"):
            has_header = True
        if entry.get("bullets") and not (entry.get("company") or entry.get("title")):
            return False
    return has_header


def is_valid_project_list(entries: List[Dict[str, Any]]) -> bool:
    if not entries:
        return False
    for entry in entries:
        if not isinstance(entry, dict):
            return False
        if is_date_only_project(entry.get("name")):
            return False
        if entry.get("name") and re.search(r"\bdeclaration\b", entry.get("name"), re.I):
            return False
    return True


def is_valid_education_list(entries: List[Dict[str, Any]]) -> bool:
    if not entries:
        return False
    for entry in entries:
        if not isinstance(entry, dict):
            return False
        if not (entry.get("degree") or entry.get("institution")):
            return False
    return True


def normalize_refined_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned or cleaned.lower() in {"null", "none", "n/a", "na"}:
        return None
    return cleaned


def is_noisy_summary(text: Optional[str]) -> bool:
    if not text:
        return True
    lowered = text.lower()
    if any(token in lowered for token in ["codechef", "codeforces", "hackerrank", "github", "linkedin"]):
        return True
    if any(token in lowered for token in ["declaration", "curriculum vitae", "resume"]):
        return True
    if PDF_INTERNAL_HINT.search(text) or PDF_METADATA_HINT.search(text):
        return True
    if looks_like_contact_line(text):
        return True
    return len(text.split()) < 4


def looks_like_contact_line(text: Optional[str]) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return bool(
        "@" in text
        or re.search(r"\+?\d[\d\s()+-]{7,}", text)
        or any(token in lowered for token in ["linkedin", "github", "portfolio", "phone:", "email:", "contact"])
    )


def looks_like_location_noise(text: Optional[str]) -> bool:
    if not text:
        return False
    lowered = text.lower()
    location_keywords = [
        "india",
        "hyderabad",
        "bangalore",
        "bengaluru",
        "mumbai",
        "delhi",
        "pune",
        "chennai",
        "telangana",
        "karnataka",
        "remote",
    ]
    skill_noise = {
        "python",
        "java",
        "javascript",
        "typescript",
        "react",
        "node",
        "fastapi",
        "postgresql",
        "mongodb",
        "docker",
        "aws",
    }
    words = [word.strip(" ,.-").lower() for word in text.split() if word.strip(" ,.-")]
    if not words:
        return True
    if any(token in lowered for token in ["skills", "languages:", "frameworks:", "tools:", "databases:"]):
        return True
    if all(word in skill_noise for word in words[: min(len(words), 4)]):
        return True
    return not any(keyword in lowered for keyword in location_keywords) and not bool(
        re.search(r"\b[A-Z][a-z]+,\s*(?:[A-Z][a-z]+|[A-Z]{2,})\b", text)
    )


def looks_like_location_line(text: Optional[str]) -> bool:
    if not text or looks_like_contact_line(text) or looks_like_location_noise(text):
        return False
    return bool(
        re.search(r"\b[A-Z][a-z]+,\s*(?:[A-Z][a-z]+|[A-Z]{2,})\b", text)
        or re.search(r"\b(?:Hyderabad|Bangalore|Bengaluru|Mumbai|Delhi|Pune|Chennai|Telangana|India|Remote)\b", text, re.I)
    )


def outward_llm_status(raw_status: Optional[str], raw_error: Optional[str]) -> str:
    if raw_status == "success":
        return "success"
    if raw_status == "skipped":
        return "skipped"
    if raw_error in {"missing_api_key", "provider_not_configured"}:
        return "not_configured"
    return "error"


def outward_final_source(
    llm_status: str,
    llm_final_source: Optional[str],
    method_used: str,
    ocr_attempted: bool,
    ocr_status: Optional[str],
) -> str:
    if llm_status == "success":
        return "merged" if llm_final_source == "merged" else "merged"
    used_ocr = "ocr" in (method_used or "").lower() or ocr_status == "used_successfully"
    if used_ocr or (ocr_attempted and ocr_status in {"attempted_no_gain", "failed_preserved_previous", "unavailable_preserved_previous"}):
        return "ocr_fallback"
    return "deterministic_only"


def join_compact_parts(parts: List[str], primary_separator: str = " — ") -> Optional[str]:
    normalized_parts = [part.strip() for part in parts if part and part.strip()]
    if not normalized_parts:
        return None
    return primary_separator.join(normalized_parts)


def stringify_stringish_item(
    item: Any,
    preferred_keys: Optional[List[str]] = None,
    section_name: str = "section",
) -> Optional[str]:
    if item is None:
        return None
    if isinstance(item, str):
        normalized = normalize_nullable(item.strip())
        return normalized if normalized else None
    if isinstance(item, (int, float, bool)):
        normalized = normalize_nullable(str(item).strip())
        return normalized if normalized else None
    if isinstance(item, dict):
        keys = preferred_keys or []
        values: Dict[str, str] = {}
        for key, value in item.items():
            normalized_value = normalize_refined_value(value)
            if normalized_value:
                values[str(key)] = normalized_value

        if not values:
            return None

        if section_name == "certifications":
            name = values.get("name") or values.get("title") or values.get("certification")
            issuer = values.get("issuer") or values.get("organization") or values.get("authority")
            date = values.get("date") or values.get("year")
            base = join_compact_parts([name or "", issuer or ""])
            if base and date:
                return f"{base} ({date})"
            return base or date

        if section_name == "volunteering":
            role = values.get("role") or values.get("title") or values.get("position")
            org = values.get("organization") or values.get("name")
            description = values.get("description")
            primary = join_compact_parts([role or "", org or ""])
            return join_compact_parts([primary or "", description or ""])

        ordered_values = [values[key] for key in keys if key in values]
        if ordered_values:
            return join_compact_parts(ordered_values)
        return join_compact_parts(list(values.values()))
    return None


def normalize_stringish_list(
    items: Any,
    preferred_keys: Optional[List[str]] = None,
    section_name: str = "section",
    request_id: Optional[str] = None,
) -> List[str]:
    if items is None:
        return []

    normalized_items: List[str] = []
    seen: set[str] = set()
    raw_items = items if isinstance(items, list) else [items]
    coerced_count = 0

    for item in raw_items:
        was_coerced = not isinstance(item, str)
        normalized = stringify_stringish_item(item, preferred_keys=preferred_keys, section_name=section_name)
        if not normalized:
            continue
        if normalized in seen:
            continue
        if was_coerced:
            coerced_count += 1
        seen.add(normalized)
        normalized_items.append(normalized)

    if coerced_count > 0:
        log_event(
            " ".join(
                [
                    "llm_section_normalized",
                    f"request_id={request_id or 'unknown'}",
                    f"section={section_name}",
                    f"entries={len(normalized_items)}",
                    f"coerced={coerced_count}",
                ]
            )
        )

    return normalized_items


def merge_refined_output(
    candidate: CandidateBasics,
    sections: SectionsBlock,
    refined: Dict[str, Any],
    request_id: Optional[str] = None,
) -> Tuple[CandidateBasics, SectionsBlock, str]:
    base_sections = sections.model_dump()
    refined_candidate = refined.get("candidate", {})
    candidate_dict = candidate.model_dump()
    used_candidate = False

    for field in [
        "full_name",
        "current_title",
        "email",
        "phone",
        "location",
        "linkedin",
        "github",
        "portfolio",
        "summary",
    ]:
        refined_value = normalize_refined_value(refined_candidate.get(field))
        if field == "summary" and is_noisy_summary(refined_value):
            continue
        if refined_value:
            candidate_dict[field] = refined_value
            used_candidate = True

    skills = refined.get("skills")
    used_skills = False
    if (
        skills
        and any(skills.get(bucket) for bucket in skills)
        and is_valid_skills_block(skills)
    ):
        base_sections["skills"] = skills
        used_skills = True

    used_education = False
    if refined.get("education") and is_valid_education_list(refined["education"]):
        base_sections["education"] = refined["education"]
        used_education = True
    used_experience = False
    if refined.get("experience") and is_valid_experience_list(refined["experience"]):
        base_sections["experience"] = refined["experience"]
        used_experience = True
    used_projects = False
    if refined.get("projects") and is_valid_project_list(refined["projects"]):
        base_sections["projects"] = refined["projects"]
        used_projects = True

    additional = refined.get("additional", {})
    used_additional = True
    base_sections["certifications"] = normalize_stringish_list(
        additional.get("certifications", base_sections.get("certifications", [])),
        preferred_keys=["name", "issuer", "date", "description"],
        section_name="certifications",
        request_id=request_id,
    )
    base_sections["achievements"] = normalize_stringish_list(
        additional.get("achievements", base_sections.get("achievements", [])),
        preferred_keys=["name", "title", "award", "description", "project"],
        section_name="achievements",
        request_id=request_id,
    )
    base_sections["hackathons"] = normalize_stringish_list(
        additional.get("hackathons", base_sections.get("hackathons", [])),
        preferred_keys=["name", "award", "project", "description"],
        section_name="hackathons",
        request_id=request_id,
    )
    base_sections["positions_of_responsibility"] = normalize_stringish_list(
        additional.get("leadership", base_sections.get("positions_of_responsibility", [])),
        preferred_keys=["role", "title", "organization", "description"],
        section_name="positions_of_responsibility",
        request_id=request_id,
    )
    base_sections["volunteering"] = normalize_stringish_list(
        additional.get("volunteering", base_sections.get("volunteering", [])),
        preferred_keys=["role", "organization", "description"],
        section_name="volunteering",
        request_id=request_id,
    )
    base_sections["publications"] = normalize_stringish_list(
        additional.get("publications", base_sections.get("publications", [])),
        preferred_keys=["title", "name", "publisher", "date", "description"],
        section_name="publications",
        request_id=request_id,
    )
    base_sections["extracurricular"] = normalize_stringish_list(
        additional.get("extracurricular", base_sections.get("extracurricular", [])),
        preferred_keys=["name", "title", "organization", "description"],
        section_name="extracurricular",
        request_id=request_id,
    )
    refined_applied = all([used_candidate, used_skills, used_education, used_experience, used_projects])
    final_source = "llm" if refined_applied and used_additional else "merged"
    try:
        return CandidateBasics(**candidate_dict), SectionsBlock(**base_sections), final_source
    except ValidationError as error:
        log_event(
            " ".join(
                [
                    "llm_merge_validation_fallback",
                    f"request_id={request_id or 'unknown'}",
                    f"error={str(error).splitlines()[0]}",
                ]
            )
        )
        safe_sections = sections.model_dump()
        for field_name, preferred_keys in [
            ("certifications", ["name", "issuer", "date", "description"]),
            ("achievements", ["name", "title", "award", "description", "project"]),
            ("positions_of_responsibility", ["role", "title", "organization", "description"]),
            ("hackathons", ["name", "award", "project", "description"]),
            ("publications", ["title", "name", "publisher", "date", "description"]),
            ("volunteering", ["role", "organization", "description"]),
            ("extracurricular", ["name", "title", "organization", "description"]),
        ]:
            safe_sections[field_name] = normalize_stringish_list(
                base_sections.get(field_name, safe_sections.get(field_name, [])),
                preferred_keys=preferred_keys,
                section_name=field_name,
                request_id=request_id,
            )
        return CandidateBasics(**candidate_dict), SectionsBlock(**safe_sections), "merged"


def call_llm_refiner(cleaned_text: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    call_llm_refiner.last_error = None
    call_llm_refiner.last_status = None
    call_llm_refiner.last_raw_present = False
    provider = (LLM_PROVIDER or "groq").lower()
    api_key = read_env_value("RESUME_EXTRACTOR_GROQ_API_KEY")
    base_url = RESUME_EXTRACTOR_GROQ_BASE_URL or GROQ_BASE_URL
    model = RESUME_EXTRACTOR_GROQ_MODEL

    if provider == "openai" or (provider != "groq" and not api_key):
        api_key = read_env_value("OPENAI_API_KEY")
        base_url = read_env_value("OPENAI_BASE_URL", OPENAI_BASE_URL)
        model = OPENAI_MODEL

    if not api_key and read_env_value("OPENAI_API_KEY"):
        api_key = read_env_value("OPENAI_API_KEY")
        base_url = read_env_value("OPENAI_BASE_URL", OPENAI_BASE_URL)
        model = OPENAI_MODEL

    if not api_key:
        call_llm_refiner.last_error = "missing_api_key"
        call_llm_refiner.last_status = "error"
        return None

    prompt = build_llm_prompt(cleaned_text, payload)
    request_payload = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": "Return ONLY JSON that matches the schema exactly."},
            {"role": "user", "content": prompt},
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=LLM_TIMEOUT_SECONDS) as client:
            response = client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=request_payload,
            )
        if response.status_code in (401, 403, 429):
            call_llm_refiner.last_error = "rate_limited"
            call_llm_refiner.last_status = "error"
            return None
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        refined, parse_error, raw_present = parse_llm_json(content)
        call_llm_refiner.last_raw_present = raw_present
        if parse_error:
            call_llm_refiner.last_error = parse_error
            call_llm_refiner.last_status = "invalid_json"
            return None
        validated = validate_refined_output(refined or {})
        if not validated:
            call_llm_refiner.last_error = "invalid_schema"
            call_llm_refiner.last_status = "invalid_json"
            return None
        call_llm_refiner.last_status = "success"
        return validated
    except httpx.TimeoutException:
        call_llm_refiner.last_error = "timeout"
        call_llm_refiner.last_status = "timeout"
        return None
    except (json.JSONDecodeError, KeyError, TypeError, httpx.HTTPError):
        call_llm_refiner.last_error = "invalid_json"
        call_llm_refiner.last_status = "error"
        return None


def infer_keywords(text: str, max_count: int = 12) -> List[str]:
    words = re.findall(r"[A-Za-z]{3,}", text.lower())
    counts: Dict[str, int] = {}
    for word in words:
        if word in STOPWORDS:
            continue
        counts[word] = counts.get(word, 0) + 1
    return [w for w, _ in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:max_count]]


def clamp_score(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def parse_month_year(value: Optional[str]) -> Optional[Tuple[int, int]]:
    if not value:
        return None
    normalized = value.strip()
    if re.search(r"present", normalized, re.I):
        now = datetime.now(timezone.utc)
        return now.year, now.month
    month_match = re.search(r"\b([A-Za-z]{3,9})\s+((19|20)\d{2})\b", normalized)
    if month_match:
        month_name = month_match.group(1).lower()[:3]
        month = MONTHS.get(month_name)
        year = int(month_match.group(2))
        if month:
            return year, month
    year_match = re.search(r"(19|20)\d{2}", normalized)
    if year_match:
        return int(year_match.group(0)), 1
    return None


def compute_total_experience_months(experience: List[ExperienceEntry]) -> Optional[int]:
    total = 0
    has_valid = False
    for entry in experience:
        start = parse_month_year(entry.start_date)
        end = parse_month_year(entry.end_date)
        if not start:
            continue
        has_valid = True
        end_date = end or (datetime.now(timezone.utc).year, datetime.now(timezone.utc).month)
        start_months = start[0] * 12 + start[1]
        end_months = end_date[0] * 12 + end_date[1]
        if end_months < start_months:
            continue
        total += end_months - start_months
    if not has_valid:
        return None
    return int(clamp_score(total, 0, 600))


def fix_skill_buckets(skills: SkillsBlock, actions: List[str]) -> SkillsBlock:
    new_languages: List[str] = []
    moved_spoken: List[str] = []
    for lang in skills.languages:
        normalized = lang.strip().lower()
        if normalized in SPOKEN_LANGUAGES:
            moved_spoken.append(lang)
        elif normalized in PROGRAMMING_LANGUAGES:
            new_languages.append(lang)
        else:
            skills.others.append(lang)
    if moved_spoken:
        actions.append("spoken_languages_rebucketed")
        skills.spoken_languages = list(dict.fromkeys(skills.spoken_languages + moved_spoken))
    skills.languages = list(dict.fromkeys(new_languages))
    skills.others = list(dict.fromkeys(skills.others))
    return skills


def normalize_certifications(lines: List[str]) -> List[str]:
    certs: List[str] = []
    for line in lines:
        if re.search(
            r"\b(certified|certification|specialization|certificate|associate|professional certificate)\b",
            line,
            re.I,
        ):
            if re.search(r"\b(hackathon|challenge|codefrenzy|innovathon|webathon)\b", line, re.I):
                continue
            if re.search(r"\b(course|coursework|training)\b", line, re.I):
                continue
            certs.append(line.strip("• ").strip())
    return list(dict.fromkeys(certs))


def recalculate_extraction_quality_score(
    candidate: CandidateBasics,
    sections: SectionsBlock,
    confidence: ConfidenceBlock,
    has_cert_section: bool,
) -> float:
    score = 100.0
    if not candidate.full_name:
        score -= 8
    if not candidate.email:
        score -= 6
    if not candidate.phone:
        score -= 4

    if not any(
        [
            sections.skills.languages,
            sections.skills.frameworks,
            sections.skills.tools,
            sections.skills.databases,
            sections.skills.cloud,
        ]
    ):
        score -= 15

    for entry in sections.education:
        if not entry.degree or not entry.institution:
            score -= 6

    for entry in sections.experience:
        if entry.bullets and not (entry.company or entry.title):
            score -= 8

    for entry in sections.projects:
        if not entry.name or is_date_only_project(entry.name):
            score -= 10
        if not entry.technologies and entry.bullets:
            score -= 4

    if has_cert_section and not sections.certifications:
        score -= 6
    if sections.certifications:
        score += 2

    score += min(5.0, confidence.overall * 5.0)
    return clamp_score(score, 0, 100)


def extract_technologies(text: str) -> List[str]:
    if not text:
        return []
    normalized = text.lower()
    found: List[str] = []
    for key, canonical in TECHNOLOGY_CANONICAL.items():
        if key in normalized:
            found.append(canonical)
    return list(dict.fromkeys(found))


def normalize_nullable(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    lowered = value.strip().lower()
    if lowered in {"null", "none", "n/a", "na"}:
        return None
    return value


def infer_location_from_text(text: str) -> Optional[str]:
    for line in text.splitlines():
        if not looks_like_location_line(line):
            continue
        match = re.search(r"\b([A-Z][a-z]+,\s*(?:[A-Z][a-z]+|[A-Z]{2,}))\b", line)
        if match:
            return match.group(1)
    return None


def infer_role_from_sections(sections: SectionsBlock) -> Optional[str]:
    combined = " ".join(
        filter(
            None,
            [
                " ".join([entry.title or "" for entry in sections.experience]),
                " ".join([entry.description or "" for entry in sections.projects]),
                " ".join([entry.name or "" for entry in sections.projects]),
                " ".join([entry.bullets[0] for entry in sections.projects if entry.bullets]),
            ],
        )
    )
    techs = extract_technologies(combined)
    lowered = " ".join(techs).lower()
    if any(item in lowered for item in ["opencv", "yolo"]):
        return "Computer Vision Developer"
    if any(item in lowered for item in ["fastapi", "postgresql", "supabase", "pypdf"]):
        if any(item in lowered for item in ["react", "node.js"]):
            return "Full Stack Developer"
        return "Backend Developer"
    if any(item in lowered for item in ["react", "node.js"]) and not any(
        item in lowered for item in ["fastapi", "postgresql", "supabase"]
    ):
        return "Frontend Developer"
    if any(item in lowered for item in ["react", "node.js"]) and any(
        item in lowered for item in ["fastapi", "postgresql", "supabase"]
    ):
        return "Full Stack Developer"
    return None


def post_process_candidate(candidate: CandidateBasics, text: str, actions: List[str]) -> CandidateBasics:
    candidate.location = normalize_nullable(candidate.location)
    if candidate.location and not looks_like_location_line(candidate.location):
        candidate.location = None
        actions.append("location_rejected_as_noise")
    if not candidate.location:
        inferred = infer_location_from_text(text)
        if inferred:
            candidate.location = inferred
            actions.append("location_salvaged")
    candidate.full_name = normalize_nullable(candidate.full_name)
    candidate.email = normalize_nullable(candidate.email)
    candidate.phone = normalize_nullable(candidate.phone)
    candidate.linkedin = normalize_nullable(candidate.linkedin)
    candidate.github = normalize_nullable(candidate.github)
    candidate.portfolio = normalize_nullable(candidate.portfolio)
    candidate.summary = normalize_nullable(candidate.summary)
    if candidate.summary and is_noisy_summary(candidate.summary):
        candidate.summary = None
        actions.append("summary_rejected_as_noise")
    return candidate


def post_process_parsed_resume(sections: SectionsBlock, actions: List[str]) -> SectionsBlock:
    sections.skills = fix_skill_buckets(sections.skills, actions)

    project_techs_applied = False
    for project in sections.projects:
        combined = " ".join(filter(None, [project.name, project.description] + project.bullets))
        techs = extract_technologies(combined)
        if techs:
            project.technologies = list(dict.fromkeys(project.technologies + techs))
            project_techs_applied = True
    if project_techs_applied:
        actions.append("project_technologies_inferred")

    experience_techs_applied = False
    for entry in sections.experience:
        combined = " ".join(filter(None, [entry.title or "", entry.company or ""] + entry.bullets))
        techs = extract_technologies(combined)
        if techs:
            entry.technologies = list(dict.fromkeys(entry.technologies + techs))
            experience_techs_applied = True
    if experience_techs_applied:
        actions.append("experience_technologies_inferred")

    for entry in sections.education:
        entry.institution = normalize_nullable(entry.institution)
        entry.degree = normalize_nullable(entry.degree)
        entry.field_of_study = normalize_nullable(entry.field_of_study)
        entry.start_date = normalize_nullable(entry.start_date)
        entry.end_date = normalize_nullable(entry.end_date)
        entry.grade = normalize_nullable(entry.grade)
        entry.location = normalize_nullable(entry.location)
        entry.description = normalize_nullable(entry.description)

    for entry in sections.experience:
        entry.company = normalize_nullable(entry.company)
        entry.title = normalize_nullable(entry.title)
        entry.location = normalize_nullable(entry.location)
        entry.start_date = normalize_nullable(entry.start_date)
        entry.end_date = normalize_nullable(entry.end_date)

    for entry in sections.projects:
        entry.name = normalize_nullable(entry.name)
        entry.description = normalize_nullable(entry.description)

    actions.append("post_processed_v2")
    return sections

def compute_confidence(candidate: CandidateBasics, sections: SectionsBlock) -> ConfidenceBlock:
    basics_score = sum(
        1 for field in [candidate.full_name, candidate.email, candidate.phone, candidate.summary] if field
    ) / 4.0
    skills_score = 1.0 if any(
        [
            sections.skills.languages,
            sections.skills.frameworks,
            sections.skills.tools,
            sections.skills.databases,
            sections.skills.cloud,
            sections.skills.others,
        ]
    ) else 0.2
    education_quality = sum(1 for entry in sections.education if entry.degree and entry.institution)
    education_score = min(1.0, education_quality / max(len(sections.education), 1))
    experience_quality = sum(1 for entry in sections.experience if entry.company or entry.title)
    experience_score = min(1.0, experience_quality / max(len(sections.experience), 1))
    projects_score = min(1.0, len(sections.projects) / 3.0)
    overall = round((basics_score + skills_score + education_score + experience_score + projects_score) / 5.0, 2)
    return ConfidenceBlock(
        candidate_basics=clamp_score(round(basics_score, 2), 0, 1),
        skills=clamp_score(round(skills_score, 2), 0, 1),
        education=clamp_score(round(education_score, 2), 0, 1),
        experience=clamp_score(round(experience_score, 2), 0, 1),
        projects=clamp_score(round(projects_score, 2), 0, 1),
        overall=clamp_score(overall, 0, 1),
    )


def estimate_experience_months(experience: List[ExperienceEntry]) -> Optional[int]:
    return compute_total_experience_months(experience)


def infer_seniority(experience: List[ExperienceEntry]) -> Optional[str]:
    titles = " ".join(filter(None, [entry.title for entry in experience]))
    if re.search(r"\b(staff|principal)\b", titles, re.I):
        return "staff"
    if re.search(r"\b(lead|senior)\b", titles, re.I):
        return "senior"
    if re.search(r"\b(intern|junior)\b", titles, re.I):
        return "junior"
    return None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app_version": APP_VERSION,
        "git_sha": GIT_SHA,
        "schema_version": SCHEMA_VERSION,
        "parser_version": PARSER_VERSION,
        "llm_always_on": LLM_ALWAYS_ON,
        "llm_provider": LLM_PROVIDER,
        "llm_provider_configured": llm_provider_configured(),
        "ocr_enabled": OCR_ENABLED,
        "cache_enabled": RESUME_CACHE_ENABLED,
    }


@app.get("/")
def root():
    return {"message": "resume-extractor is running", "version": APP_VERSION}


@app.post("/extract", response_model=ExtractResponse)
async def extract(
    file: UploadFile = File(...),
    mime_type: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
    request_id: Optional[str] = Form(None),
    force_llm: Optional[bool] = Form(None),
    skip_llm: Optional[bool] = Form(None),
):
    if not file:
        raise HTTPException(status_code=400, detail="Missing file upload.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file upload.")
    if len(data) > MAX_INPUT_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds max size of {MAX_INPUT_SIZE_BYTES} bytes.")

    resolved_filename = filename or file.filename or "resume"
    resolved_mime = mime_type or file.content_type or "application/octet-stream"
    resolved_request_id = request_id or str(uuid.uuid4())
    requested_force_llm = bool(force_llm) if force_llm is not None else True
    requested_skip_llm = bool(skip_llm) if skip_llm is not None else False
    llm_requested = not requested_skip_llm and (requested_force_llm or LLM_ALWAYS_ON)
    llm_skipped = requested_skip_llm
    llm_enabled_for_request = llm_requested and not llm_skipped

    cache_key = get_cache_key(data + f":llm={llm_enabled_for_request}:skip={bool(skip_llm)}".encode("utf-8"))
    cached = get_cached_parse(cache_key)
    if cached:
        log_event("cache hit")
        raw_text = cached["raw_text"]
        cleaned_text = cached["cleaned_text"]
        page_count = cached["page_count"]
        page_methods = cached["page_methods"]
        page_decisions = cached.get("page_decisions", [])
        page_source_summary = cached.get("page_source_summary", {})
        method_used = cached["method_used"]
        contamination = cached["contamination"]
        candidate = CandidateBasics(**cached["candidate"])
        sections = SectionsBlock(**cached["sections"])
        confidence = ConfidenceBlock(**cached["confidence"])
        ats_cached = cached["ats"]
        llm_action = cached.get("llm_action", "llm_cached")
        llm_status = cached.get("llm_status")
        outward_status = outward_llm_status(llm_status, cached.get("llm_error"))
        outward_source = cached.get("final_source") or outward_final_source(
            outward_status,
            None,
            method_used,
            cached.get("ocr_attempted", False),
            cached.get("ocr_status"),
        )
        actions_post: List[str] = ["cache_hit"]
        status = StatusBlock(
            success=True,
            processing_mode=method_used,
            warnings=cached.get("warnings", []),
            errors=cached.get("errors", []),
            confidence_overall=confidence.overall,
        )

        parsed_at = datetime.now(timezone.utc).isoformat()
        return ExtractResponse(
            schema_version=SCHEMA_VERSION,
            parser_version=cached.get("parser_version", PARSER_VERSION),
            request=RequestMeta(
                request_id=resolved_request_id,
                filename=resolved_filename,
                mime_type=resolved_mime,
                file_size_bytes=len(data),
                parsed_at=parsed_at,
            ),
            status=status,
            raw=RawBlock(raw_text=raw_text, cleaned_text=cleaned_text, page_count=page_count),
            candidate=candidate,
            sections=sections,
            ats=AtsFields(
                total_experience_months=ats_cached["total_experience_months"],
                inferred_role=ats_cached["inferred_role"],
                seniority_level=ats_cached["seniority_level"],
                top_keywords=ats_cached["top_keywords"],
                missing_fields=ats_cached["missing_fields"],
                extraction_quality_score=ats_cached["extraction_quality_score"],
            ),
            confidence=confidence,
            diagnostics=DiagnosticsBlock(
                method_used=method_used,
                page_methods=page_methods,
                page_decisions=page_decisions,
                page_source_summary=page_source_summary,
                page_count=page_count,
                native_text_quality=cached.get("native_text_quality", {}),
                contamination_score=contamination,
                salvage_score=round(confidence.overall * 100.0, 2),
                extraction_quality_score=ats_cached["extraction_quality_score"],
                cleaning_actions=cached.get("cleaning_actions", []) + actions_post + [llm_action, "post_processed_v2"],
                ocr_needed=cached.get("ocr_needed", False),
                ocr_status=cached.get("ocr_status"),
                ocr_attempted=cached.get("ocr_attempted", False),
                ocr_improved_quality=cached.get("ocr_improved_quality"),
                layout_reconstruction_used=cached.get("layout_reconstruction_used", False),
                final_source=outward_source,
                llm_requested=cached.get("llm_requested", llm_requested),
                llm_skipped=cached.get("llm_skipped", llm_skipped),
                llm_attempted=cached.get("llm_attempted", llm_requested and outward_status != "skipped"),
                llm_status=outward_status,
                llm_error=cached.get("llm_error"),
                llm_raw_present=cached.get("llm_raw_present"),
                warnings=cached.get("warnings", []),
                errors=cached.get("errors", []),
                request_id=resolved_request_id,
                parser_version=cached.get("parser_version", PARSER_VERSION),
                schema_version=SCHEMA_VERSION,
            ),
            normalized_resume=NormalizedResume(text=cached["normalized_text"], sections=cached["section_map"]),
        )

    extraction_result = extract_text_by_type(data, resolved_mime, resolved_filename)
    if len(extraction_result) == 6:
        raw_text, page_count, page_methods, method_used, extraction_actions, extraction_diagnostics = extraction_result
    else:
        raw_text, page_count, page_methods, method_used, extraction_actions = extraction_result  # type: ignore[misc]
        extraction_diagnostics = {
            "page_decisions": [],
            "page_source_summary": {},
            "ocr_needed": False,
            "ocr_status": None,
            "ocr_attempted": False,
            "ocr_improved_quality": None,
            "layout_reconstruction_used": False,
        }
    cleaned_text, cleaning_actions = clean_resume_text(raw_text)
    reconstructed_text = reconstruct_resume_text(cleaned_text)
    contamination = contamination_score(raw_text)
    native_text_quality = compute_text_quality(cleaned_text)

    warnings: List[str] = []
    errors: List[str] = []
    if not cleaned_text.strip():
        errors.append("No readable text extracted.")
    if looks_like_pdf_binary(raw_text):
        warnings.append("PDF text extraction produced internal tokens; OCR fallback may be required.")
    if contamination > 60:
        warnings.append("Extraction contained noisy PDF internals; cleaned output may be partial.")

    status = StatusBlock(
        success=len(errors) == 0,
        processing_mode=method_used,
        warnings=warnings,
        errors=errors,
        confidence_overall=0.0,
    )

    candidate = infer_candidate_basics(reconstructed_text)
    section_map = split_sections(reconstructed_text)
    skills = parse_skills_section(section_map.get("skills", []))
    education = parse_education(section_map.get("education", []))
    experience = parse_experience_v2(section_map.get("experience", []))
    projects = parse_projects_v2(section_map.get("projects", []))
    hackathons = section_map.get("hackathons", [])
    achievements = [
        line
        for line in section_map.get("achievements", [])
        if not re.search(r"\b(hackathon|competition|contest)\b", line, re.I)
    ]
    certifications = normalize_certifications(
        section_map.get("achievements", []) + section_map.get("certifications", [])
    )
    positions_of_responsibility = (
        section_map.get("positions_of_responsibility", [])
        + section_map.get("roles_responsibilities", [])
    )
    sections = SectionsBlock(
        skills=skills,
        education=education,
        experience=experience,
        projects=projects,
        certifications=certifications,
        achievements=achievements,
        positions_of_responsibility=positions_of_responsibility,
        hackathons=hackathons,
        publications=section_map.get("publications", []),
        volunteering=section_map.get("volunteering", []),
    )

    confidence = compute_confidence(candidate, sections)
    actions_post: List[str] = []

    llm_action = "llm_attempted"
    llm_status: str = "skipped"
    llm_error: Optional[str] = None
    llm_raw_present: Optional[bool] = None
    llm_final_source: Optional[str] = None
    llm_attempted = False
    if cleaned_text.strip() and llm_enabled_for_request:
        llm_attempted = True
        trimmed_text = cleaned_text[:MAX_LLM_TEXT_CHARS]
        refined = call_llm_refiner(
            trimmed_text,
            {
                "candidate": candidate.model_dump(),
                "sections": sections.model_dump(),
            },
        )
        if refined:
            try:
                candidate, sections, llm_final_source = merge_refined_output(
                    candidate,
                    sections,
                    refined,
                    request_id=resolved_request_id,
                )
                llm_action = "llm_enhanced"
                llm_status = "success"
                llm_raw_present = getattr(call_llm_refiner, "last_raw_present", None)
            except ValidationError as merge_error:
                llm_status = "error"
                llm_error = f"merge_validation_error:{merge_error.errors()[0].get('loc')}"
                llm_raw_present = getattr(call_llm_refiner, "last_raw_present", None)
                llm_action = "llm_merge_validation_fallback"
        else:
            last_error = getattr(call_llm_refiner, "last_error", None)
            llm_status = getattr(call_llm_refiner, "last_status", "error")
            llm_error = last_error
            llm_raw_present = getattr(call_llm_refiner, "last_raw_present", None)
            if last_error == "timeout":
                llm_action = "llm_timeout_fallback"
            elif last_error == "rate_limited":
                llm_action = "llm_rate_limited"
            elif last_error == "missing_api_key":
                llm_action = "llm_missing_api_key"
            else:
                llm_action = "llm_invalid_json_fallback"
    else:
        llm_action = "llm_skipped_empty_text" if not cleaned_text.strip() else "llm_skipped_by_request"
        llm_status = "skipped"
    if llm_status == "skipped":
        llm_raw_present = False
    if GROQ_FORCE:
        actions_post.append("llm_forced")

    candidate = post_process_candidate(candidate, reconstructed_text, actions_post)
    sections = post_process_parsed_resume(sections, actions_post)
    if certifications:
        actions_post.append("certifications_normalized")

    confidence = compute_confidence(candidate, sections)
    status.confidence_overall = confidence.overall

    total_experience = compute_total_experience_months(sections.experience)
    inferred_role = infer_role_from_sections(sections) or (sections.experience[0].title if sections.experience else None)
    if inferred_role:
        actions_post.append("role_inferred")
    seniority = infer_seniority(sections.experience)
    top_keywords = infer_keywords(reconstructed_text)
    missing_fields = [
        field
        for field, value in {
            "full_name": candidate.full_name,
            "email": candidate.email,
            "skills": any(
                [
                    sections.skills.languages,
                    sections.skills.frameworks,
                    sections.skills.tools,
                    sections.skills.databases,
                    sections.skills.cloud,
                    sections.skills.others,
                ]
            ),
            "experience": bool(sections.experience),
            "education": bool(sections.education),
        }.items()
        if not value
    ]

    has_cert_section = bool(section_map.get("certifications") or section_map.get("achievements"))
    extraction_quality_score = recalculate_extraction_quality_score(
        candidate, sections, confidence, has_cert_section
    )

    outward_status = outward_llm_status(llm_status, llm_error)
    final_source = outward_final_source(
        outward_status,
        llm_final_source,
        method_used,
        bool(extraction_diagnostics.get("ocr_attempted", False)),
        extraction_diagnostics.get("ocr_status"),
    )

    parser_version = PARSER_VERSION
    if outward_status == "success":
        parser_version = f"{PARSER_VERSION}+llm"

    parsed_at = datetime.now(timezone.utc).isoformat()

    response = ExtractResponse(
        schema_version=SCHEMA_VERSION,
        parser_version=parser_version,
            request=RequestMeta(
            request_id=resolved_request_id,
            filename=resolved_filename,
            mime_type=resolved_mime,
            file_size_bytes=len(data),
            parsed_at=parsed_at,
        ),
        status=status,
        raw=RawBlock(raw_text=raw_text, cleaned_text=cleaned_text, page_count=page_count),
        candidate=candidate,
        sections=sections,
        ats=AtsFields(
            total_experience_months=total_experience,
            inferred_role=inferred_role,
            seniority_level=seniority,
            top_keywords=top_keywords,
            missing_fields=missing_fields,
            extraction_quality_score=round(extraction_quality_score, 2),
        ),
        confidence=confidence,
        diagnostics=DiagnosticsBlock(
            method_used=method_used,
            page_methods=page_methods,
            page_decisions=extraction_diagnostics.get("page_decisions", []),
            page_source_summary=extraction_diagnostics.get("page_source_summary", {}),
            page_count=page_count,
            native_text_quality=native_text_quality,
            contamination_score=contamination,
            salvage_score=round(confidence.overall * 100.0, 2),
            extraction_quality_score=round(extraction_quality_score, 2),
            cleaning_actions=cleaning_actions
            + extraction_actions
            + ["parsed_sections_v2", llm_action]
            + actions_post
            + ["experience_months_recomputed", "ats_score_recalculated", "post_processed_v2"]
            + (["ignored_declaration"] if section_map.get("declaration") else []),
            ocr_needed=bool(extraction_diagnostics.get("ocr_needed", False)),
            ocr_status=extraction_diagnostics.get("ocr_status"),
            ocr_attempted=bool(extraction_diagnostics.get("ocr_attempted", False)),
            ocr_improved_quality=extraction_diagnostics.get("ocr_improved_quality"),
            layout_reconstruction_used=bool(extraction_diagnostics.get("layout_reconstruction_used", False)),
            final_source=final_source,
            llm_requested=llm_requested,
            llm_skipped=llm_skipped,
            llm_attempted=llm_attempted,
            llm_status=outward_status,
            llm_error=llm_error,
            llm_raw_present=llm_raw_present,
            warnings=warnings,
            errors=errors,
            request_id=resolved_request_id,
            parser_version=parser_version,
            schema_version=SCHEMA_VERSION,
        ),
        normalized_resume=NormalizedResume(text=reconstructed_text, sections=section_map),
    )
    set_cached_parse(
        cache_key,
        {
            "raw_text": raw_text,
            "cleaned_text": cleaned_text,
            "page_count": page_count,
            "page_methods": page_methods,
            "page_decisions": extraction_diagnostics.get("page_decisions", []),
            "page_source_summary": extraction_diagnostics.get("page_source_summary", {}),
            "method_used": method_used,
            "contamination": contamination,
            "native_text_quality": native_text_quality,
            "candidate": candidate.model_dump(),
            "sections": sections.model_dump(),
            "confidence": confidence.model_dump(),
            "parser_version": parser_version,
            "ats": {
                "total_experience_months": total_experience,
                "inferred_role": inferred_role,
                "seniority_level": seniority,
                "top_keywords": top_keywords,
                "missing_fields": missing_fields,
                "extraction_quality_score": round(extraction_quality_score, 2),
            },
            "llm_action": llm_action,
            "llm_requested": llm_requested,
            "llm_skipped": llm_skipped,
            "llm_attempted": llm_attempted,
            "llm_status": llm_status,
            "llm_error": llm_error,
            "llm_raw_present": llm_raw_present,
            "final_source": final_source,
            "ocr_needed": bool(extraction_diagnostics.get("ocr_needed", False)),
            "ocr_status": extraction_diagnostics.get("ocr_status"),
            "ocr_attempted": bool(extraction_diagnostics.get("ocr_attempted", False)),
            "ocr_improved_quality": extraction_diagnostics.get("ocr_improved_quality"),
            "layout_reconstruction_used": bool(extraction_diagnostics.get("layout_reconstruction_used", False)),
            "cleaning_actions": cleaning_actions
            + extraction_actions
            + ["parsed_sections_v2", llm_action]
            + actions_post
            + ["experience_months_recomputed", "ats_score_recalculated", "post_processed_v2"],
            "normalized_text": reconstructed_text,
            "section_map": section_map,
            "warnings": warnings,
            "errors": errors,
        },
    )
    log_event(
        " ".join(
            [
                f"llm_requested={llm_requested}",
                f"llm_attempted={llm_attempted}",
                f"llm_status={outward_status}",
                f"final_source={final_source}",
                f"ocr_status={extraction_diagnostics.get('ocr_status') or 'none'}",
                f"page_sources={json.dumps(extraction_diagnostics.get('page_source_summary', {}), sort_keys=True)}",
                f"llm_error={llm_error or 'none'}",
            ]
        )
    )
    return response
