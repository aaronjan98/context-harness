"""Tests for latex-suite shortcut parsing and normalization."""

from pathlib import Path

from server.latex_suite import parse_latex_suite_shortcuts


def test_parse_text_autosnippets_and_regex_triggers() -> None:
    snippets, unsupported = parse_latex_suite_shortcuts(
        r"""
        [
          // text-mode autosnippets
          {trigger: "mk", replacement: "$$0$", options: "tA"},
          {trigger: "dm", replacement: "$$\n$0\n$$", options: "tAw"},
          {trigger: /([A-Za-z])(\d)/, replacement: "[[0]]_{[[1]]}", options: "rmA", priority: -1},
        ]
        """
    )

    by_trigger = {snippet.trigger: snippet for snippet in snippets}

    assert unsupported == []
    assert by_trigger["mk"].replacement == "$$0$"
    assert by_trigger["mk"].options == "tA"
    assert not by_trigger["mk"].regex
    assert by_trigger["dm"].replacement == "$$\n$0\n$$"
    assert by_trigger["dm"].options == "tAw"
    assert by_trigger[r"([A-Za-z])(\d)"].regex
    assert by_trigger[r"([A-Za-z])(\d)"].priority == -1


def test_parse_skips_function_replacements_with_diagnostic() -> None:
    snippets, unsupported = parse_latex_suite_shortcuts(
        r"""
        [
          {trigger: "mk", replacement: "$$0$", options: "tA"},
          {trigger: /iden(\d)/, replacement: (match) => {
            return "\\begin{bmatrix}$0\\end{bmatrix}";
          }, options: "mA"},
        ]
        """
    )

    assert [snippet.trigger for snippet in snippets] == ["mk"]
    assert unsupported == ["unsupported function replacement for trigger 'iden(\\\\d)'"]


def test_snippets_endpoint_loads_requested_file(client, tmp_path: Path) -> None:
    shortcut_file = tmp_path / "shortcuts.json"
    shortcut_file.write_text(
        r"""
        [
          {trigger: "mk", replacement: "$$0$", options: "tA"},
          {trigger: "dm", replacement: "$$\n$0\n$$", options: "tAw"},
        ]
        """,
        encoding="utf-8",
    )

    response = client.get(
        "/api/latex-suite/snippets",
        params={"path": str(shortcut_file)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["path"] == str(shortcut_file)
    assert payload["unsupported_count"] == 0
    assert {snippet["trigger"] for snippet in payload["snippets"]} == {"mk", "dm"}


def test_snippets_endpoint_returns_404_for_missing_file(client, tmp_path: Path) -> None:
    response = client.get(
        "/api/latex-suite/snippets",
        params={"path": str(tmp_path / "missing.json")},
    )

    assert response.status_code == 404
    assert response.json()["detail"].startswith("LaTeX Suite shortcut file not found:")
