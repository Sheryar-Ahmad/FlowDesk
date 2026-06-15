import pytest
from pydantic import ValidationError

from app.api.v1.auth.schemas import RegisterRequest


def test_registration_normalizes_name_and_email():
    request = RegisterRequest(
        display_name="  Flow Developer  ",
        email="Developer@Example.com",
        password="StrongPass1!",
    )

    assert request.display_name == "Flow Developer"
    assert request.email == "Developer@example.com"


@pytest.mark.parametrize(
    "password",
    [
        "short1!",
        "lowercase1!",
        "UPPERCASE1!",
        "NoNumber!",
        "NoSpecial1",
    ],
)
def test_registration_rejects_weak_passwords(password):
    with pytest.raises(ValidationError):
        RegisterRequest(
            display_name="Developer",
            email="developer@example.com",
            password=password,
        )
