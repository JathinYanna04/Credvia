from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
from typing import Any, Dict

import pytest


EXTRACTOR_SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(EXTRACTOR_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(EXTRACTOR_SERVICE_ROOT))


@pytest.fixture
def deterministic_payload() -> Dict[str, Any]:
    return {
        "candidate": {
            "full_name": "Jane Builder",
            "current_title": "Software Engineer",
            "email": "jane@example.com",
            "phone": "+1 555 000 1111",
            "location": "Bangalore, India",
            "linkedin": "https://linkedin.com/in/jane",
            "github": "https://github.com/jane",
            "portfolio": "https://jane.dev",
            "summary": "Backend engineer focused on reliable systems.",
        },
        "skills": {
            "languages": ["Python", "TypeScript"],
            "frameworks": ["FastAPI", "React"],
            "tools": ["Docker"],
            "databases": ["PostgreSQL"],
            "cloud": ["AWS"],
            "others": ["System design"],
            "spoken_languages": ["English", "Hindi"],
        },
        "education": [
            {
                "institution": "ABC University",
                "degree": "B.Tech Computer Science",
                "field_of_study": "Computer Science",
                "start_date": "2018",
                "end_date": "2022",
                "grade": "8.9",
                "location": "Bangalore, India",
                "description": "Relevant coursework in DBMS and distributed systems.",
            }
        ],
        "experience": [
            {
                "company": "Credvia",
                "title": "Software Engineer",
                "location": "Bangalore",
                "start_date": "2023-01",
                "end_date": "Present",
                "currently_working": True,
                "bullets": [
                    "Built backend pipelines for resume analysis.",
                    "Improved extraction reliability.",
                ],
                "technologies": ["FastAPI", "PostgreSQL"],
            }
        ],
        "projects": [
            {
                "name": "Resume Intelligence",
                "description": "ATS extraction and scoring platform",
                "technologies": ["FastAPI", "React", "Docker"],
                "links": ["https://example.com/project"],
                "bullets": ["Implemented LLM refinement pipeline."],
            }
        ],
        "additional": {
            "certifications": ["AWS Certified Cloud Practitioner"],
            "achievements": ["Won internal engineering award"],
            "hackathons": ["Hackathon 2024 Finalist"],
            "leadership": ["Engineering guild lead"],
            "volunteering": ["STEM mentor"],
            "publications": ["Designing robust extraction systems"],
        },
    }


@pytest.fixture
def valid_llm_output(deterministic_payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = deepcopy(deterministic_payload)
    payload["candidate"]["summary"] = "Reliable backend engineer building ATS-grade data pipelines."
    payload["candidate"]["current_title"] = "Senior Backend Engineer"
    payload["experience"][0]["title"] = "Senior Backend Engineer"
    payload["projects"][0]["name"] = "Credvia Resume Engine"
    return payload


@pytest.fixture
def partial_llm_output(deterministic_payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = deepcopy(deterministic_payload)
    payload["candidate"]["summary"] = "Senior engineer focused on robust parsing and quality."
    payload["experience"] = []
    payload["education"] = []
    payload["projects"] = []
    return payload


@pytest.fixture
def invalid_llm_outputs(valid_llm_output: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    missing_required = deepcopy(valid_llm_output)
    missing_required.pop("skills", None)

    malformed_skills = deepcopy(valid_llm_output)
    malformed_skills["skills"] = {"languages": "Python"}  # wrong type

    date_only_project_year = deepcopy(valid_llm_output)
    date_only_project_year["projects"][0]["name"] = "2023"

    date_only_project_month_year = deepcopy(valid_llm_output)
    date_only_project_month_year["projects"][0]["name"] = "Jan 2024"

    spoken_as_programming = deepcopy(valid_llm_output)
    spoken_as_programming["skills"]["languages"] = ["English", "Hindi"]

    with_hallucinated_schema = deepcopy(valid_llm_output)
    with_hallucinated_schema["experience"] = [{"role_title": "Bad key", "company": "Credvia"}]

    return {
        "missing_required": missing_required,
        "malformed_skills": malformed_skills,
        "date_only_project_year": date_only_project_year,
        "date_only_project_month_year": date_only_project_month_year,
        "spoken_as_programming": spoken_as_programming,
        "with_hallucinated_schema": with_hallucinated_schema,
    }


@pytest.fixture
def noisy_resume_text() -> str:
    return (
        "xref stream endstream /Type /Catalog random tokens "
        "Skills Python FastAPI React PostgreSQL "
        "Experience Built backend APIs and pipelines."
    )


@pytest.fixture
def only_skills_resume_text() -> str:
    return "TECHNICAL SKILLS\nPython\nFastAPI\nPostgreSQL\nDocker\nEnglish\nHindi\n"


@pytest.fixture
def only_experience_resume_text() -> str:
    return (
        "EXPERIENCE\nCredvia\nSoftware Engineer\n2023 - Present\n"
        "Built extraction systems using FastAPI and PostgreSQL.\n"
    )
