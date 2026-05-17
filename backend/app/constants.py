"""
constants.py - Fixed Values Used Across FlowDesk
--------------------------------------------------
These are numbers and strings that never change.
Instead of writing "50" everywhere in the code,
we write FREE_TIER_SNIPPET_LIMIT and change it in one place if needed.
"""

# --- Free Tier Limits ---
FREE_TIER_SNIPPET_LIMIT = 50        # Max snippets for free users
FREE_TIER_NOTE_LIMIT = 10           # Max notes for free users
FREE_TIER_PROJECT_LIMIT = 3         # Max projects for free users
FREE_TIER_AI_MESSAGES_PER_DAY = 20  # Max AI messages per day for free users
FREE_TIER_README_PER_MONTH = 3      # Max README generations per month

# --- Pro Tier Price ---
PRO_TIER_PRICE_USD = 6.00           # $6 per month

# --- Security Constants ---
MAX_FAILED_LOGIN_ATTEMPTS = 5       # Lock account after this many failures
ACCOUNT_LOCK_DURATION_MINUTES = 15  # How long account stays locked
PASSWORD_MIN_LENGTH = 8             # Minimum password length
LOGIN_RATE_LIMIT = "10/minute"      # Max login attempts per IP per minute

# --- Token Expiry ---
ACCESS_TOKEN_EXPIRE_MINUTES = 15    # Access token lives 15 minutes
REFRESH_TOKEN_EXPIRE_DAYS = 30      # Refresh token lives 30 days
EMAIL_VERIFY_TOKEN_EXPIRE_HOURS = 24
PASSWORD_RESET_TOKEN_EXPIRE_HOURS = 1

# --- Pagination ---
DEFAULT_PAGE_SIZE = 20              # Items per page by default
MAX_PAGE_SIZE = 100                 # Maximum items per page

# --- Search ---
MAX_SEARCH_RESULTS = 50             # Maximum search results returned
SEARCH_MIN_QUERY_LENGTH = 2         # Minimum characters to trigger search

# --- File Limits ---
MAX_AVATAR_SIZE_MB = 2              # Maximum profile picture size
MAX_SNIPPET_SIZE_KB = 500           # Maximum code snippet size

# --- AI Constants ---
AI_MAX_CONTEXT_MESSAGES = 10        # Last N messages sent to AI for context
AI_MAX_TOKENS = 2000                # Maximum tokens per AI response

# --- Soft Delete ---
TRASH_RETENTION_DAYS = 30           # Days before soft-deleted items purged

# --- Audit Log ---
RAW_LOG_RETENTION_DAYS = 30         # Raw logs deleted after 30 days
AGGREGATED_LOG_RETENTION_DAYS = 90  # Aggregated analytics kept 90 days
