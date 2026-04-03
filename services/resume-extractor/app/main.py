from __future__ import annotations

import io
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

app = FastAPI(title="Credvia Resume Extractor", version="0.2.0")

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

DEGREE_KEYWORDS = re.compile(
    r"\b(b\.?sc|bachelor|m\.?sc|master|ph\.?d|mba|b\.?tech|m\.?tech|associate)\b",
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
    tools: List[str] = Field(default_factory=list)
    databases: List[str] = Field(default_factory=list)
    cloud: List[str] = Field(default_factory=list)
    others: List[str] = Field(default_factory=list)


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
    publications: List[str] = Field(default_factory=list)
    volunteering: List[str] = Field(default_factory=list)


class AtsFields(BaseModel):
    total_experience_months: int = 0
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
    contamination_score: float = 0.0
    salvage_score: float = 0.0
    cleaning_actions: List[str] = Field(default_factory=list)


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


def clean_resume_text(raw: str) -> Tuple[str, List[str]]:
    lines = raw.splitlines()
    cleaned_lines = []
    actions: List[str] = []
    removed_lines = 0
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
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


def extract_pdf_text(file_bytes: bytes) -> Tuple[str, int, List[Dict[str, str]]]:
    try:
        import fitz
    except Exception:
        return "", 0, []
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    chunks: List[str] = []
    page_methods: List[Dict[str, str]] = []
    for index, page in enumerate(doc):
        chunks.append(page.get_text("text"))
        page_methods.append({"page": str(index + 1), "method": "pdf-native"})
    return "\n".join(chunks), doc.page_count, page_methods


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
) -> Tuple[str, int, List[Dict[str, str]], str]:
    lower = filename.lower()
    if mime_type == "application/pdf" or lower.endswith(".pdf"):
        text, pages, page_methods = extract_pdf_text(file_bytes)
        return text, pages, page_methods, "pdf-native"
    if lower.endswith(".docx") or "wordprocessingml.document" in mime_type:
        return extract_docx_text(file_bytes), 1, [{"page": "1", "method": "docx"}], "docx"
    if lower.endswith(".rtf") or "rtf" in mime_type:
        return extract_rtf_text(file_bytes), 1, [{"page": "1", "method": "rtf"}], "rtf"
    return file_bytes.decode("utf-8", errors="ignore"), 1, [{"page": "1", "method": "text"}], "text"


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
        if len(line.split()) >= 8 and not re.search(r"\bskills?\b", line, re.I):
            summary = line
            break

    location = None
    for line in lines[:8]:
        if re.search(r"\b[A-Z][a-z]+,\s?[A-Z]{2}\b", line):
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


def split_sections(text: str) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {key: [] for key in SECTION_HEADINGS}
    current = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        heading = next((key for key, pattern in SECTION_HEADINGS.items() if pattern.search(stripped)), None)
        if heading:
            current = heading
            continue
        if current:
            sections[current].append(stripped)
    return sections


def infer_skills(text: str, skills_section: List[str]) -> SkillsBlock:
    skills_blob = " ".join(skills_section) if skills_section else text
    tokens = re.split(r"[,/|•·\u2022]\s*", skills_blob)
    tokens = [t.strip(" -:").lower() for t in tokens if len(t.strip()) > 1]
    catalog = {
        "languages": {"python", "java", "javascript", "typescript", "go", "c++", "c#", "ruby"},
        "frameworks": {"react", "next.js", "fastapi", "django", "flask", "express", "spring"},
        "tools": {"git", "docker", "kubernetes", "terraform", "figma"},
        "databases": {"postgresql", "mysql", "mongodb", "redis", "sqlite"},
        "cloud": {"aws", "gcp", "azure", "lambda"},
    }
    result = SkillsBlock()
    for token in tokens:
        if token in catalog["languages"]:
            result.languages.append(token)
        elif token in catalog["frameworks"]:
            result.frameworks.append(token)
        elif token in catalog["tools"]:
            result.tools.append(token)
        elif token in catalog["databases"]:
            result.databases.append(token)
        elif token in catalog["cloud"]:
            result.cloud.append(token)
        elif len(token) > 2 and token not in STOPWORDS:
            result.others.append(token)
    return result


def parse_education(lines: List[str]) -> List[EducationEntry]:
    entries: List[EducationEntry] = []
    for line in lines:
        degree = None
        match = DEGREE_KEYWORDS.search(line)
        if match:
            degree = match.group(0)
        years = re.findall(r"(19|20)\d{2}", line)
        entry = EducationEntry(
            institution=line if not degree else None,
            degree=degree,
            end_date=years[-1] if years else None,
            description=line,
        )
        entries.append(entry)
    return entries


def parse_experience(lines: List[str]) -> List[ExperienceEntry]:
    entries: List[ExperienceEntry] = []
    current: Optional[ExperienceEntry] = None
    for line in lines:
        date_range = re.search(r"\b(\w{3,9}\s+\d{4}).*(\w{3,9}\s+\d{4}|Present)\b", line, re.I)
        if date_range:
            if current:
                entries.append(current)
            current = ExperienceEntry(
                title=line,
                start_date=date_range.group(1),
                end_date=date_range.group(2),
                currently_working="present" in date_range.group(2).lower(),
            )
            continue
        if line.startswith(("-", "•", "*")):
            if not current:
                current = ExperienceEntry()
            current.bullets.append(line.lstrip("-•* ").strip())
        elif current and not current.company:
            current.company = line
        elif current and not current.title:
            current.title = line
    if current:
        entries.append(current)
    return entries


def parse_projects(lines: List[str]) -> List[ProjectEntry]:
    entries: List[ProjectEntry] = []
    current: Optional[ProjectEntry] = None
    for line in lines:
        if line.startswith(("-", "•", "*")):
            if not current:
                current = ProjectEntry()
            current.bullets.append(line.lstrip("-•* ").strip())
            continue
        if current:
            entries.append(current)
        current = ProjectEntry(name=line)
    if current:
        entries.append(current)
    return entries


def infer_keywords(text: str, max_count: int = 12) -> List[str]:
    words = re.findall(r"[A-Za-z]{3,}", text.lower())
    counts: Dict[str, int] = {}
    for word in words:
        if word in STOPWORDS:
            continue
        counts[word] = counts.get(word, 0) + 1
    return [w for w, _ in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:max_count]]


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
    education_score = min(1.0, len(sections.education) / 2.0)
    experience_score = min(1.0, len(sections.experience) / 2.0)
    projects_score = min(1.0, len(sections.projects) / 2.0)
    overall = round((basics_score + skills_score + education_score + experience_score + projects_score) / 5.0, 2)
    return ConfidenceBlock(
        candidate_basics=round(basics_score, 2),
        skills=round(skills_score, 2),
        education=round(education_score, 2),
        experience=round(experience_score, 2),
        projects=round(projects_score, 2),
        overall=overall,
    )


def estimate_experience_months(experience: List[ExperienceEntry]) -> int:
    total = 0
    current_year = datetime.now(timezone.utc).year
    for entry in experience:
        years = re.findall(r"(19|20)\d{2}", " ".join(filter(None, [entry.start_date, entry.end_date])))
        if len(years) >= 2:
            total += (int(years[1]) - int(years[0])) * 12
        elif len(years) == 1:
            total += max(0, current_year - int(years[0])) * 12
    return max(total, 0)


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
    return {"status": "ok"}


@app.post("/extract", response_model=ExtractResponse)
async def extract(
    file: UploadFile = File(...),
    mime_type: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
):
    if not file:
        raise HTTPException(status_code=400, detail="Missing file upload.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    resolved_filename = filename or file.filename or "resume"
    resolved_mime = mime_type or file.content_type or "application/octet-stream"

    raw_text, page_count, page_methods, method_used = extract_text_by_type(
        data, resolved_mime, resolved_filename
    )
    cleaned_text, cleaning_actions = clean_resume_text(raw_text)
    reconstructed_text = reconstruct_resume_text(cleaned_text)
    contamination = contamination_score(raw_text)

    warnings: List[str] = []
    errors: List[str] = []
    if not cleaned_text.strip():
        errors.append("No readable text extracted.")
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
    sections = SectionsBlock(
        skills=infer_skills(reconstructed_text, section_map.get("skills", [])),
        education=parse_education(section_map.get("education", [])),
        experience=parse_experience(section_map.get("experience", [])),
        projects=parse_projects(section_map.get("projects", [])),
        certifications=section_map.get("certifications", []),
        achievements=section_map.get("achievements", []),
        positions_of_responsibility=section_map.get("positions_of_responsibility", []),
        publications=section_map.get("publications", []),
        volunteering=section_map.get("volunteering", []),
    )

    confidence = compute_confidence(candidate, sections)
    status.confidence_overall = confidence.overall

    total_experience = estimate_experience_months(sections.experience)
    inferred_role = sections.experience[0].title if sections.experience else None
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

    extraction_quality_score = max(0.0, 100.0 - contamination + (confidence.overall * 20))

    parsed_at = datetime.now(timezone.utc).isoformat()

    return ExtractResponse(
        schema_version=SCHEMA_VERSION,
        parser_version=PARSER_VERSION,
        request=RequestMeta(
            request_id=str(uuid.uuid4()),
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
            contamination_score=contamination,
            salvage_score=round(confidence.overall * 100.0, 2),
            cleaning_actions=cleaning_actions,
        ),
        normalized_resume=NormalizedResume(text=reconstructed_text, sections=section_map),
    )
