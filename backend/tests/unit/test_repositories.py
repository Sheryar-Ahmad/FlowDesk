from uuid import UUID, uuid4

import pytest

from app.repositories.base import coerce_uuid


def test_coerce_uuid_accepts_uuid_and_string_values():
    value = uuid4()

    assert coerce_uuid(value) is value
    assert coerce_uuid(str(value)) == value


def test_coerce_uuid_rejects_invalid_identifiers():
    with pytest.raises(ValueError):
        coerce_uuid("not-a-uuid")
