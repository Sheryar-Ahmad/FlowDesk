import pytest
from pydantic import ValidationError

from app.api.v1.snippets.schemas import SnippetCreate


def test_snippet_input_is_normalized():
    snippet = SnippetCreate(
        title="  Useful helper  ",
        code="print('hello')",
        language="PYTHON",
        tags=[" Python ", "python", "invalid tag!"],
    )

    assert snippet.title == "Useful helper"
    assert snippet.language == "python"
    assert snippet.tags == ["python"]


def test_unknown_language_uses_other():
    snippet = SnippetCreate(
        title="Example",
        code="example",
        language="not-a-language",
    )

    assert snippet.language == "other"


@pytest.mark.parametrize("title", ["", "<script>alert(1)</script>", "x" * 201])
def test_snippet_rejects_invalid_titles(title):
    with pytest.raises(ValidationError):
        SnippetCreate(title=title, code="example", language="python")
