from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
import structlog

logger = structlog.get_logger(__name__)

# Argon2's memory cost makes offline password guessing substantially more expensive.
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Converts plain password to secure hash."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Checks if plain password matches the stored hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
    except (VerificationError, InvalidHashError) as e:
        logger.error("Password verification error", error=str(e))
        return False


def needs_rehash(hashed_password: str) -> bool:
    """Checks if password hash needs to be upgraded."""
    return ph.check_needs_rehash(hashed_password)
