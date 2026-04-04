from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from app import main
from app.page_intelligence import build_layout_blocks, choose_best_page_representation, compute_text_quality


def _assert_structured_contract(payload: Dict[str, Any]) -> None:
    assert "candidate" in payload
    assert "sections" in payload
    assert "diagnostics" in payload

    sections = payload["sections"]
    assert sections.get("skills") is not None
    assert sections.get("experience") is not None
    assert sections.get("projects") is not None
    assert sections.get("education") is not None
    additional = {
        "certifications": sections.get("certifications"),
        "achievements": sections.get("achievements"),
        "hackathons": sections.get("hackathons"),
        "leadership": sections.get("positions_of_responsibility"),
        "volunteering": sections.get("volunteering"),
        "publications": sections.get("publications"),
    }
    for _, value in additional.items():
        assert value is not None


def _upload(client: TestClient, content: bytes = b"%PDF-fake") -> Dict[str, Any]:
    response = client.post(
        "/extract",
        files={"file": ("resume.pdf", content, "application/pdf")},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def disable_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "RESUME_CACHE_ENABLED", False)


class TestValidation:
    def test_accepts_valid_refined_output(self, valid_llm_output: Dict[str, Any]) -> None:
        refined = main.validate_refined_output(deepcopy(valid_llm_output))
        assert refined is not None
        assert refined["candidate"]["full_name"] == "Jane Builder"
        assert refined["projects"][0]["name"] == "Credvia Resume Engine"

    @pytest.mark.parametrize(
        "key",
        [
            "missing_required",
            "malformed_skills",
            "date_only_project_year",
            "date_only_project_month_year",
            "spoken_as_programming",
            "with_hallucinated_schema",
        ],
    )
    def test_rejects_invalid_refined_shapes(
        self,
        invalid_llm_outputs: Dict[str, Dict[str, Any]],
        key: str,
    ) -> None:
        assert main.validate_refined_output(deepcopy(invalid_llm_outputs[key])) is None

    @pytest.mark.parametrize(
        "content,expected_error",
        [
            ("", "empty_response"),
            ("```json\nnot-json\n```", "no_json_object"),
            ('{"candidate":', "no_json_object"),
        ],
    )
    def test_parse_llm_json_handles_invalid_json(
        self, content: str, expected_error: str
    ) -> None:
        parsed, error, _ = main.parse_llm_json(content)
        assert parsed is None
        assert error is not None
        assert error.startswith(expected_error)


class TestMerge:
    def test_full_valid_llm_output_sets_source_llm(
        self,
        deterministic_payload: Dict[str, Any],
        valid_llm_output: Dict[str, Any],
    ) -> None:
        candidate = main.CandidateBasics(**deterministic_payload["candidate"])
        sections = main.SectionsBlock(
            skills=main.SkillsBlock(**deterministic_payload["skills"]),
            education=[main.EducationEntry(**entry) for entry in deterministic_payload["education"]],
            experience=[main.ExperienceEntry(**entry) for entry in deterministic_payload["experience"]],
            projects=[main.ProjectEntry(**entry) for entry in deterministic_payload["projects"]],
            certifications=deterministic_payload["additional"]["certifications"],
            achievements=deterministic_payload["additional"]["achievements"],
            positions_of_responsibility=deterministic_payload["additional"]["leadership"],
            hackathons=deterministic_payload["additional"]["hackathons"],
            volunteering=deterministic_payload["additional"]["volunteering"],
            publications=deterministic_payload["additional"]["publications"],
        )

        merged_candidate, merged_sections, source = main.merge_refined_output(
            candidate, sections, deepcopy(valid_llm_output)
        )

        assert source == "llm"
        assert merged_candidate.current_title == "Senior Backend Engineer"
        assert merged_candidate.summary == "Reliable backend engineer building ATS-grade data pipelines."
        assert merged_sections.projects[0].name == "Credvia Resume Engine"

    def test_partial_llm_output_sets_source_merged(
        self,
        deterministic_payload: Dict[str, Any],
        partial_llm_output: Dict[str, Any],
    ) -> None:
        candidate = main.CandidateBasics(**deterministic_payload["candidate"])
        sections = main.SectionsBlock(
            skills=main.SkillsBlock(**deterministic_payload["skills"]),
            education=[main.EducationEntry(**entry) for entry in deterministic_payload["education"]],
            experience=[main.ExperienceEntry(**entry) for entry in deterministic_payload["experience"]],
            projects=[main.ProjectEntry(**entry) for entry in deterministic_payload["projects"]],
            certifications=deterministic_payload["additional"]["certifications"],
            achievements=deterministic_payload["additional"]["achievements"],
            positions_of_responsibility=deterministic_payload["additional"]["leadership"],
            hackathons=deterministic_payload["additional"]["hackathons"],
            volunteering=deterministic_payload["additional"]["volunteering"],
            publications=deterministic_payload["additional"]["publications"],
        )

        merged_candidate, merged_sections, source = main.merge_refined_output(
            candidate, sections, deepcopy(partial_llm_output)
        )

        assert source == "merged"
        assert merged_candidate.summary == "Senior engineer focused on robust parsing and quality."
        assert len(merged_sections.experience) == 1
        assert len(merged_sections.projects) == 1
        assert len(merged_sections.education) == 1

    def test_merge_overrides_only_specific_field(self, deterministic_payload: Dict[str, Any]) -> None:
        refined = deepcopy(deterministic_payload)
        refined["candidate"]["summary"] = "Improved summary from LLM."
        refined["candidate"]["current_title"] = None
        refined["skills"] = deterministic_payload["skills"]

        candidate = main.CandidateBasics(**deterministic_payload["candidate"])
        sections = main.SectionsBlock(
            skills=main.SkillsBlock(**deterministic_payload["skills"]),
            education=[main.EducationEntry(**entry) for entry in deterministic_payload["education"]],
            experience=[main.ExperienceEntry(**entry) for entry in deterministic_payload["experience"]],
            projects=[main.ProjectEntry(**entry) for entry in deterministic_payload["projects"]],
            certifications=deterministic_payload["additional"]["certifications"],
            achievements=deterministic_payload["additional"]["achievements"],
            positions_of_responsibility=deterministic_payload["additional"]["leadership"],
            hackathons=deterministic_payload["additional"]["hackathons"],
            volunteering=deterministic_payload["additional"]["volunteering"],
            publications=deterministic_payload["additional"]["publications"],
        )

        merged_candidate, merged_sections, source = main.merge_refined_output(candidate, sections, refined)

        assert source in {"llm", "merged"}
        assert merged_candidate.summary == "Improved summary from LLM."
        assert merged_candidate.current_title == "Software Engineer"
        assert merged_sections.experience[0].company == "Credvia"

    def test_noisy_summary_is_not_applied(self, deterministic_payload: Dict[str, Any]) -> None:
        refined = deepcopy(deterministic_payload)
        refined["candidate"]["summary"] = "CodeChef profile: xyz. LinkedIn github declaration"

        candidate = main.CandidateBasics(**deterministic_payload["candidate"])
        sections = main.SectionsBlock(
            skills=main.SkillsBlock(**deterministic_payload["skills"]),
            education=[main.EducationEntry(**entry) for entry in deterministic_payload["education"]],
            experience=[main.ExperienceEntry(**entry) for entry in deterministic_payload["experience"]],
            projects=[main.ProjectEntry(**entry) for entry in deterministic_payload["projects"]],
            certifications=deterministic_payload["additional"]["certifications"],
            achievements=deterministic_payload["additional"]["achievements"],
            positions_of_responsibility=deterministic_payload["additional"]["leadership"],
            hackathons=deterministic_payload["additional"]["hackathons"],
            volunteering=deterministic_payload["additional"]["volunteering"],
            publications=deterministic_payload["additional"]["publications"],
        )

        merged_candidate, _, _ = main.merge_refined_output(candidate, sections, refined)
        assert merged_candidate.summary == "Backend engineer focused on reliable systems."


class TestFallback:
    @pytest.fixture(autouse=True)
    def deterministic_extract_mocks(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sample_text = (
            "JANE BUILDER\nSoftware Engineer\njane@example.com\n+1 555 000 1111\n"
            "Bangalore, India\nSKILLS\nPython\nFastAPI\nPostgreSQL\nEnglish\nHindi\n"
            "EXPERIENCE\nCredvia\nSoftware Engineer\n2023 - Present\n"
            "Built ATS-grade extraction workflows.\nPROJECTS\nResume Engine\n"
            "Built robust parsing and scoring pipelines.\nEDUCATION\nB.Tech CSE\nABC University\n2018 - 2022\n"
        )

        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return sample_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)

    def test_timeout_fallback_sets_diagnostics(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_llm(_cleaned: str, _payload: Dict[str, Any]) -> None:
            fake_llm.last_error = "timeout"
            fake_llm.last_status = "timeout"
            fake_llm.last_raw_present = True
            return None

        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client)

        assert payload["diagnostics"]["llm_status"] == "timeout"
        assert payload["diagnostics"]["final_source"] == "heuristic_fallback"
        _assert_structured_contract(payload)

    def test_extract_route_preserves_page_intelligence_diagnostics(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sample_text = (
            "JANE BUILDER\njane@example.com\n+1 555 000 1111\n"
            "SKILLS\nPython\nFastAPI\nPROJECTS\nResume Engine\n"
        )

        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return (
                sample_text,
                2,
                [{"page": "1", "method": "pdf-native"}, {"page": "2", "method": "pdf-ocr"}],
                "pdf-native",
                ["page_2_ocr_candidate"],
                {
                    "page_decisions": [
                        {"page": 1, "selected_method": "native"},
                        {"page": 2, "selected_method": "ocr"},
                    ],
                    "page_source_summary": {"native": 1, "ocr": 1},
                    "ocr_needed": True,
                    "ocr_status": "used_successfully",
                    "ocr_attempted": True,
                    "ocr_improved_quality": True,
                    "layout_reconstruction_used": True,
                },
            )

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)
        monkeypatch.setattr(main, "call_llm_refiner", lambda *_args, **_kwargs: None)
        payload = _upload(client)

        assert payload["diagnostics"]["page_count"] == 2
        assert payload["diagnostics"]["page_source_summary"] == {"native": 1, "ocr": 1}
        assert payload["diagnostics"]["ocr_status"] == "used_successfully"
        assert payload["diagnostics"]["layout_reconstruction_used"] is True
        _assert_structured_contract(payload)

    def test_invalid_json_fallback_sets_diagnostics(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_llm(_cleaned: str, _payload: Dict[str, Any]) -> None:
            fake_llm.last_error = "json_decode_error"
            fake_llm.last_status = "invalid_json"
            fake_llm.last_raw_present = True
            return None

        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client)

        assert payload["diagnostics"]["llm_status"] == "invalid_json"
        assert payload["diagnostics"]["final_source"] == "heuristic_fallback"
        _assert_structured_contract(payload)

    def test_schema_mismatch_fallback_sets_diagnostics(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_llm(_cleaned: str, _payload: Dict[str, Any]) -> None:
            fake_llm.last_error = "invalid_schema"
            fake_llm.last_status = "invalid_json"
            fake_llm.last_raw_present = True
            return None

        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client)

        assert payload["diagnostics"]["llm_status"] == "invalid_json"
        assert payload["diagnostics"]["llm_error"] == "invalid_schema"
        assert payload["diagnostics"]["final_source"] == "heuristic_fallback"
        _assert_structured_contract(payload)

    def test_missing_api_key_fallback_non_crashing(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_llm(_cleaned: str, _payload: Dict[str, Any]) -> None:
            fake_llm.last_error = "missing_api_key"
            fake_llm.last_status = "error"
            fake_llm.last_raw_present = False
            return None

        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client)

        assert payload["status"]["success"] is True
        assert payload["diagnostics"]["llm_status"] == "error"
        assert payload["diagnostics"]["llm_error"] == "missing_api_key"
        assert payload["diagnostics"]["final_source"] == "heuristic_fallback"
        _assert_structured_contract(payload)


class TestEdgeCases:
    @pytest.fixture(autouse=True)
    def deterministic_extract_mocks(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sample_text = (
            "JANE BUILDER\nSoftware Engineer\njane@example.com\n+1 555 000 1111\n"
            "Bangalore, India\nSKILLS\nPython\nFastAPI\nPostgreSQL\nEnglish\nHindi\n"
            "EXPERIENCE\nCredvia\nSoftware Engineer\n2023 - Present\n"
            "Built ATS-grade extraction workflows.\nPROJECTS\nResume Engine\n"
            "Built robust parsing and scoring pipelines.\nEDUCATION\nB.Tech CSE\nABC University\n2018 - 2022\n"
        )

        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return sample_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)

    def test_empty_resume_text_skips_llm(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return "", 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)
        payload = _upload(client, b"%PDF-empty")

        assert payload["diagnostics"]["llm_status"] == "skipped"
        assert payload["diagnostics"]["final_source"] == "heuristic_fallback"
        _assert_structured_contract(payload)


class TestPageIntelligence:
    def test_prefers_native_when_text_is_strong(self) -> None:
        native = "JANE BUILDER\njane@example.com\n+1 555 000 1111\nSKILLS\nPython\nFastAPI"
        ocr = "JANE BUI1DER\njane@example.com\n+1 555 000 1111\nSK1LLS\nPython\nFastAPI"

        decision = choose_best_page_representation(
            1,
            [
                {"method": "native", "text": native},
                {"method": "ocr", "text": ocr},
            ],
        )

        assert decision["selected_method"] == "native"
        assert decision["ocr_attempted"] is True

    def test_prefers_ocr_when_native_is_noisy(self) -> None:
        native = "xref stream endstream /Type /Catalog random obj obj obj"
        ocr = "Vaishali Ragi\nvaishali.ragi66@gmail.com\nSKILLS\nPython\nJava"

        decision = choose_best_page_representation(
            1,
            [
                {"method": "native", "text": native},
                {"method": "ocr", "text": ocr},
            ],
        )

        assert decision["selected_method"] == "ocr"
        assert decision["ocr_needed"] is True
        assert decision["ocr_improved_quality"] is True

    def test_builds_layout_blocks_for_headings_and_bullets(self) -> None:
        text = "SKILLS\nPython\nFastAPI\n\nPROJECTS\n- Resume Engine\n- ATS Dashboard"
        blocks = build_layout_blocks(text)
        assert len(blocks) >= 2
        assert any(block["kind"] == "section" for block in blocks)
        assert compute_text_quality(text)["section_heading_count"] >= 2

    def test_ocr_garbage_like_text_still_returns_contract(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
        noisy_resume_text: str,
    ) -> None:
        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return noisy_resume_text, 1, [{"page": "1", "method": "pdf-ocr"}], "pdf-ocr", ["pdf_ocr_fallback_used"]

        def fake_llm(_cleaned: str, _payload: Dict[str, Any]) -> None:
            fake_llm.last_error = "invalid_json"
            fake_llm.last_status = "invalid_json"
            fake_llm.last_raw_present = True
            return None

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)
        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client, b"%PDF-garbage")

        assert "status" in payload
        assert payload["diagnostics"]["final_source"] == "heuristic_fallback"
        _assert_structured_contract(payload)

    def test_resume_with_only_skills_is_supported(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
        only_skills_resume_text: str,
    ) -> None:
        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return only_skills_resume_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)
        payload = _upload(client, b"%PDF-skills-only")

        assert payload["sections"]["skills"] is not None
        _assert_structured_contract(payload)

    def test_resume_with_only_experience_is_supported(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
        only_experience_resume_text: str,
    ) -> None:
        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return (
                only_experience_resume_text,
                1,
                [{"page": "1", "method": "pdf-native"}],
                "pdf-native",
                [],
            )

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)
        payload = _upload(client, b"%PDF-exp-only")

        assert payload["sections"]["experience"] is not None
        _assert_structured_contract(payload)

    def test_duplicate_llm_entries_do_not_crash(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sample_text = (
            "JANE BUILDER\nSoftware Engineer\njane@example.com\n+1 555 000 1111\n"
            "SKILLS\nPython\nTypeScript\nPROJECTS\nResume Engine\n"
        )

        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return sample_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)

        def fake_llm(_cleaned: str, payload: Dict[str, Any]) -> Dict[str, Any]:
            base = {
                "candidate": payload["candidate"],
                "skills": {
                    **payload["sections"]["skills"],
                    "languages": ["Python", "Python", "TypeScript"],
                },
                "education": payload["sections"]["education"],
                "experience": payload["sections"]["experience"],
                "projects": payload["sections"]["projects"],
                "additional": {
                    "certifications": ["AWS CCP", "AWS CCP"],
                    "achievements": [],
                    "hackathons": [],
                    "leadership": [],
                    "volunteering": [],
                    "publications": [],
                },
            }
            fake_llm.last_error = None
            fake_llm.last_status = "success"
            fake_llm.last_raw_present = True
            return base

        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client, b"%PDF-dupes")

        assert payload["status"]["success"] is True
        assert payload["diagnostics"]["llm_status"] == "success"
        _assert_structured_contract(payload)

    def test_very_long_summary_is_non_failing(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        long_summary = " ".join(["reliable"] * 1500)

        sample_text = (
            "JANE BUILDER\nSoftware Engineer\njane@example.com\n+1 555 000 1111\n"
            "SKILLS\nPython\nTypeScript\nPROJECTS\nResume Engine\n"
        )

        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return sample_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)

        def fake_llm(_cleaned: str, payload: Dict[str, Any]) -> Dict[str, Any]:
            result = {
                "candidate": {
                    **payload["candidate"],
                    "summary": long_summary,
                },
                "skills": payload["sections"]["skills"],
                "education": payload["sections"]["education"],
                "experience": payload["sections"]["experience"],
                "projects": payload["sections"]["projects"],
                "additional": {
                    "certifications": [],
                    "achievements": [],
                    "hackathons": [],
                    "leadership": [],
                    "volunteering": [],
                    "publications": [],
                },
            }
            fake_llm.last_error = None
            fake_llm.last_status = "success"
            fake_llm.last_raw_present = True
            return result

        monkeypatch.setattr(main, "call_llm_refiner", fake_llm)
        payload = _upload(client, b"%PDF-long-summary")

        assert payload["status"]["success"] is True
        assert isinstance(payload["candidate"]["summary"], str)
        _assert_structured_contract(payload)

    def test_mixed_languages_are_bucketed_without_crash(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        mixed_text = (
            "SKILLS\nPython\nJavaScript\nEnglish\nHindi\nFastAPI\nPostgreSQL\n"
            "EXPERIENCE\nCredvia\nSoftware Engineer\n2023 - Present\nBuilt APIs.\n"
        )

        def fake_extract(*_args: Any, **_kwargs: Any) -> Any:
            return mixed_text, 1, [{"page": "1", "method": "pdf-native"}], "pdf-native", []

        monkeypatch.setattr(main, "extract_text_by_type", fake_extract)
        payload = _upload(client, b"%PDF-mixed")

        assert payload["sections"]["skills"] is not None
        assert isinstance(payload["sections"]["skills"]["languages"], list)
        assert isinstance(payload["sections"]["skills"]["spoken_languages"], list)
        _assert_structured_contract(payload)
