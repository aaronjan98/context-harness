"""Parser and normalizer for Obsidian latex-suite shortcut files."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re


DEFAULT_LATEX_SUITE_PATH = (
    "~/Repositories/self-hosted/zettelkasten/Documents/shortcuts.json"
)


@dataclass(frozen=True)
class LatexSuiteSnippet:
    """A CodeMirror-friendly representation of one latex-suite snippet."""

    trigger: str
    replacement: str
    options: str
    priority: int
    regex: bool
    description: str | None = None

    def model_dump(self) -> dict[str, object]:
        """Return a JSON-serializable payload."""
        payload: dict[str, object] = {
            "trigger": self.trigger,
            "replacement": self.replacement,
            "options": self.options,
            "priority": self.priority,
            "regex": self.regex,
        }
        if self.description:
            payload["description"] = self.description
        return payload


@dataclass(frozen=True)
class LatexSuiteParseResult:
    """Parsed snippets plus parser diagnostics."""

    path: str
    snippets: list[LatexSuiteSnippet]
    unsupported_count: int
    unsupported_reasons: list[str]

    def model_dump(self) -> dict[str, object]:
        """Return a JSON-serializable payload."""
        return {
            "path": self.path,
            "snippets": [snippet.model_dump() for snippet in self.snippets],
            "unsupported_count": self.unsupported_count,
            "unsupported_reasons": self.unsupported_reasons,
        }


def load_latex_suite_snippets(path: str | None = None) -> LatexSuiteParseResult:
    """Load and normalize a latex-suite shortcuts file."""
    source_path = Path(path or DEFAULT_LATEX_SUITE_PATH).expanduser()
    text = source_path.read_text(encoding="utf-8")
    snippets, unsupported_reasons = parse_latex_suite_shortcuts(text)
    return LatexSuiteParseResult(
        path=str(source_path),
        snippets=snippets,
        unsupported_count=len(unsupported_reasons),
        unsupported_reasons=unsupported_reasons[:20],
    )


def parse_latex_suite_shortcuts(
    text: str,
) -> tuple[list[LatexSuiteSnippet], list[str]]:
    """Parse the JS-like latex-suite shortcut array.

    The file is intentionally not treated as JSON: Obsidian latex-suite allows
    comments, regex literals, function replacements, and unquoted object keys.
    This parser extracts the data fields Context Forge can execute safely.
    """
    snippets: list[LatexSuiteSnippet] = []
    unsupported: list[str] = []

    for object_text in iter_top_level_objects(text):
        parsed = parse_shortcut_object(object_text)
        if isinstance(parsed, LatexSuiteSnippet):
            snippets.append(parsed)
        elif parsed:
            unsupported.append(parsed)

    snippets.sort(
        key=lambda snippet: (
            snippet.priority,
            len(snippet.trigger),
        ),
        reverse=True,
    )
    return snippets, unsupported


def iter_top_level_objects(text: str) -> list[str]:
    """Return object literal substrings from the top-level shortcuts array."""
    objects: list[str] = []
    depth = 0
    start: int | None = None
    state = "code"
    quote = ""
    escaped = False
    regex_class = False
    previous_significant = ""

    index = 0
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""

        if state == "line-comment":
            if char == "\n":
                state = "code"
            index += 1
            continue

        if state == "block-comment":
            if char == "*" and next_char == "/":
                state = "code"
                index += 2
                continue
            index += 1
            continue

        if state == "string":
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                state = "code"
            index += 1
            continue

        if state == "regex":
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "[":
                regex_class = True
            elif char == "]":
                regex_class = False
            elif char == "/" and not regex_class:
                state = "code"
            index += 1
            continue

        if char == "/" and next_char == "/":
            state = "line-comment"
            index += 2
            continue
        if char == "/" and next_char == "*":
            state = "block-comment"
            index += 2
            continue
        if char in ("'", '"', "`"):
            state = "string"
            quote = char
            escaped = False
            index += 1
            continue
        if char == "/" and previous_significant in {":", "(", ",", "["}:
            state = "regex"
            escaped = False
            regex_class = False
            index += 1
            continue

        if char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start is not None:
                objects.append(text[start : index + 1])
                start = None

        if not char.isspace():
            previous_significant = char
        index += 1

    return objects


def parse_shortcut_object(object_text: str) -> LatexSuiteSnippet | str | None:
    """Parse one shortcut object literal."""
    trigger_value = parse_field(object_text, "trigger")
    replacement_value = parse_field(object_text, "replacement")
    options_value = parse_field(object_text, "options")
    if not trigger_value or not replacement_value or not options_value:
        return "unsupported snippet with missing trigger, replacement, or options"

    trigger_kind, trigger = trigger_value
    replacement_kind, replacement = replacement_value
    options_kind, options = options_value
    if replacement_kind == "function":
        return f"unsupported function replacement for trigger {trigger!r}"
    if replacement_kind != "string" or options_kind != "string":
        return f"unsupported non-string replacement/options for trigger {trigger!r}"
    if trigger_kind not in {"string", "regex"}:
        return f"unsupported trigger for snippet with options {options!r}"

    description_value = parse_field(object_text, "description")
    priority_value = parse_field(object_text, "priority")
    description = (
        description_value[1]
        if description_value and description_value[0] == "string"
        else None
    )
    priority = 0
    if priority_value and priority_value[0] == "number":
        priority = int(priority_value[1])

    return LatexSuiteSnippet(
        trigger=trigger,
        replacement=replacement,
        options=options,
        priority=priority,
        regex=trigger_kind == "regex" or "r" in options,
        description=description,
    )


def parse_field(object_text: str, field_name: str) -> tuple[str, str] | None:
    """Parse a named object field and return (kind, value)."""
    match = re.search(rf"\b{re.escape(field_name)}\s*:", object_text)
    if not match:
        return None
    index = match.end()
    while index < len(object_text) and object_text[index].isspace():
        index += 1
    if index >= len(object_text):
        return None

    char = object_text[index]
    if char in {'"', "'"}:
        value, _ = parse_js_string(object_text, index)
        return ("string", value)
    if char == "/":
        value, _ = parse_js_regex(object_text, index)
        return ("regex", value)
    if object_text.startswith("function", index) or object_text.startswith("(", index):
        return ("function", "")

    number_match = re.match(r"-?\d+", object_text[index:])
    if number_match:
        return ("number", number_match.group(0))

    return None


def parse_js_string(text: str, start: int) -> tuple[str, int]:
    """Parse a single- or double-quoted JavaScript string."""
    quote = text[start]
    chars: list[str] = []
    index = start + 1
    while index < len(text):
        char = text[index]
        if char == quote:
            return ("".join(chars), index + 1)
        if char == "\\":
            index += 1
            if index >= len(text):
                break
            escaped = text[index]
            chars.append(
                {
                    "n": "\n",
                    "r": "\r",
                    "t": "\t",
                    "b": "\b",
                    "f": "\f",
                    "v": "\v",
                    "0": "\0",
                }.get(escaped, escaped)
            )
        else:
            chars.append(char)
        index += 1
    raise ValueError("Unterminated JavaScript string")


def parse_js_regex(text: str, start: int) -> tuple[str, int]:
    """Parse a JavaScript regex literal and return its pattern."""
    chars: list[str] = []
    escaped = False
    regex_class = False
    index = start + 1
    while index < len(text):
        char = text[index]
        if escaped:
            chars.append("\\" + char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == "[":
            regex_class = True
            chars.append(char)
        elif char == "]":
            regex_class = False
            chars.append(char)
        elif char == "/" and not regex_class:
            index += 1
            while index < len(text) and text[index].isalpha():
                index += 1
            return ("".join(chars), index)
        else:
            chars.append(char)
        index += 1
    raise ValueError("Unterminated JavaScript regex literal")
