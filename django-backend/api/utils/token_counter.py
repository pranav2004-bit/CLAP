"""
Token Counter — pre-flight token estimation for OpenAI quota management.

Uses tiktoken (OpenAI's tokenizer) when available for accurate counts.
Falls back to a conservative character-ratio estimate so quota tracking
still works even if tiktoken is not installed.

gpt-4o-mini uses the cl100k_base tokenizer (same as GPT-4 family).

Why estimate before the call?
──────────────────────────────
OpenAI's TPM/TPD limits count BOTH prompt + completion tokens.  We must
estimate total usage upfront to check whether we have quota before we
send the request, then correct with the actual `response.usage` afterwards.

Estimation strategy
───────────────────
  input_tokens  = actual token count of messages (tiktoken / char fallback)
  output_tokens = ESTIMATED_OUTPUT_TOKENS (conservative constant; we
                  over-estimate rather than under-estimate)
  total         = (input_tokens + output_tokens) × TOKEN_SAFETY_MULTIPLIER

The safety multiplier adds 15 % on top to account for:
  - Tokeniser inaccuracies
  - OpenAI counting overhead tokens (tool-call wrappers, etc.)
  - Variability in completion length
"""

import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Conservative fallback: 1 token ≈ 4 characters (English prose average).
# Using 3 chars/token here for safety (slightly over-estimates).
CHARS_PER_TOKEN_FALLBACK = 3

# Expected output size for our JSON evaluation responses.
# Writing/Speaking evaluations return a JSON with score + detailed breakdown.
# 500 tokens ≈ 400-600 words of JSON, which is generous for the expected output.
ESTIMATED_OUTPUT_TOKENS = 500

# Safety multiplier applied to the total estimate.
# 1.15 = 15 % headroom above the tiktoken count.
TOKEN_SAFETY_MULTIPLIER = 1.15

# Per-message overhead in the gpt-4o-mini chat format (primer + role + wrappers).
# See: https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
MESSAGE_OVERHEAD_TOKENS = 4   # per message
REPLY_PRIMING_TOKENS    = 3   # every reply begins with <|start|>assistant<|message|>

# ── Tiktoken lazy loader ──────────────────────────────────────────────────────

_encoding_cache = {}


def _get_encoding(encoding_name: str = 'cl100k_base'):
    """
    Return a tiktoken Encoding, cached after the first load.
    Returns None if tiktoken is not installed.
    """
    if encoding_name in _encoding_cache:
        return _encoding_cache[encoding_name]

    try:
        import tiktoken  # noqa: F401 — soft dependency
        enc = tiktoken.get_encoding(encoding_name)
        _encoding_cache[encoding_name] = enc
        logger.debug('tiktoken_loaded encoding=%s', encoding_name)
        return enc
    except ImportError:
        logger.info(
            'tiktoken_not_installed falling_back_to_char_ratio '
            'install_hint="pip install tiktoken"'
        )
        _encoding_cache[encoding_name] = None
        return None
    except Exception as exc:
        logger.warning('tiktoken_load_error encoding=%s error=%s', encoding_name, exc)
        _encoding_cache[encoding_name] = None
        return None


# ── Core counting functions ───────────────────────────────────────────────────

def count_text_tokens(text: str) -> int:
    """
    Count tokens in a plain text string.
    Uses tiktoken if available; falls back to character-ratio estimate.
    """
    if not text:
        return 0

    enc = _get_encoding()
    if enc is not None:
        try:
            return len(enc.encode(text, disallowed_special=()))
        except Exception as exc:
            logger.debug('tiktoken_encode_error error=%s', exc)

    # Fallback: character-based estimate (conservative)
    return max(1, math.ceil(len(text) / CHARS_PER_TOKEN_FALLBACK))


def count_messages_tokens(messages: List[Dict]) -> int:
    """
    Count the total token cost of a list of OpenAI chat messages.

    Includes per-message structural overhead tokens (role, wrapping, priming)
    as per OpenAI's token counting reference implementation.
    """
    total = REPLY_PRIMING_TOKENS  # every reply is primed

    for msg in messages:
        total += MESSAGE_OVERHEAD_TOKENS
        for _key, value in msg.items():
            total += count_text_tokens(str(value) if value is not None else '')

    return total


def estimate_request_tokens(
    messages: List[Dict],
    estimated_output_tokens: int = ESTIMATED_OUTPUT_TOKENS,
) -> int:
    """
    Estimate the total token cost (input + output) for a chat request.

    This is used BEFORE the API call for quota pre-flight checks.
    The estimate is intentionally conservative (over-estimates) to prevent
    TPM/TPD overruns.

    Args:
        messages: List of OpenAI chat message dicts.
        estimated_output_tokens: Expected completion size (default 500).

    Returns:
        Estimated total token count (prompt + completion), with safety margin.
    """
    import math as _math
    input_tokens = count_messages_tokens(messages)
    raw_total = input_tokens + estimated_output_tokens
    return int(_math.ceil(raw_total * TOKEN_SAFETY_MULTIPLIER))


def estimate_simple_tokens(system_prompt: str, user_prompt: str) -> int:
    """
    Convenience wrapper: estimate tokens for a simple two-message exchange.
    """
    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user',   'content': user_prompt},
    ]
    return estimate_request_tokens(messages)


# ── import fix for fallback math usage ────────────────────────────────────────
import math  # noqa: E402 — needed by count_text_tokens fallback above
