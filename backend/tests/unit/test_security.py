from uuid import uuid4

from app.core.security.hashing import hash_password, verify_password
from app.core.security.jwt import (
    create_access_token,
    create_refresh_token,
    extract_token_from_header,
    hash_token,
    verify_access_token,
)


def test_password_hash_round_trip():
    encoded = hash_password("StrongPass1!")

    assert encoded != "StrongPass1!"
    assert verify_password("StrongPass1!", encoded)
    assert not verify_password("WrongPass1!", encoded)


def test_access_token_round_trip():
    user_id = str(uuid4())
    token = create_access_token(user_id, "developer@example.com", "free")
    payload = verify_access_token(token)

    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["email"] == "developer@example.com"
    assert payload["type"] == "access"


def test_refresh_tokens_are_stored_as_hashes():
    raw_token, token_hash = create_refresh_token()

    assert raw_token != token_hash
    assert hash_token(raw_token) == token_hash
    assert extract_token_from_header(f"Bearer {raw_token}") == raw_token
