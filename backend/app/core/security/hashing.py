"""
hashing.py - Password Hashing with Argon2id
---------------------------------------------
Argon2id is the strongest password hashing algorithm available.
It is memory-hard which means even with powerful computers
it takes too long to crack passwords.
Used by: 1Password, Bitwarden, and top security companies.

How it works:
- User enters password "hello123"
- Argon2id converts it to "$argon2id$v=19$m=65536..."
- We store the hash, never the real password
- When user logs in, we verify hash matches
- Even if database is stolen, passwords are safe
"""

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
import structlog

logger = structlog.get_logger(__name__)

# Configure Argon2id with strong settings
# time_cost=3 means 3 iterations
# memory_cost=65536 means 64MB of memory used
# parallelism=1 means 1 thread
# These settings make brute force attacks extremely slow
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """
    Converts plain password to secure hash.
    
    Example:
        hash_password("hello123")
        Returns: "$argon2id$v=19$m=65536,t=3,p=1$..."
    
    The hash is different every time even for same password.
    This prevents rainbow table attacks.
    """
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Checks if plain password matches the stored hash.
    
    Returns True if password is correct.
    Returns False if password is wrong.
    Never raises an exception to the caller.
    """
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        # Password does not match - normal case
        return False
    except (VerificationError, InvalidHashError) as e:
        logger.error("Password verification error", error=str(e))
        return False


def needs_rehash(hashed_password: str) -> bool:
    """
    Checks if password hash needs to be upgraded.
    If we increase security settings in future,
    old hashes will be automatically upgraded on next login.
    """
    return ph.check_needs_rehash(hashed_password)
