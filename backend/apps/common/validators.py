import re
from typing import Optional
from rest_framework import serializers


INDIAN_MOBILE_REGEX = r'^[6-9][0-9]{9}$'
INDIAN_PHONE_ERROR_MESSAGE = "Enter a valid 10-digit mobile number starting with 6–9"


def normalize_indian_phone(value: Optional[str], required: bool = True) -> str:
    """
    Validates and normalizes Indian mobile numbers according to statutory standards.
    Regex: ^[6-9][0-9]{9}$
    Permitted prefixes: +91, 91 (12 digits), 0 (11 digits).
    Preserves non-Indian E.164 international numbers if provided.
    Raises serializers.ValidationError with field-specific message if invalid.
    """
    if value is None:
        if required:
            raise serializers.ValidationError(INDIAN_PHONE_ERROR_MESSAGE)
        return ""

    raw = str(value).strip()
    if not raw:
        if required:
            raise serializers.ValidationError(INDIAN_PHONE_ERROR_MESSAGE)
        return ""

    # Reject if alphabetic or invalid special characters exist
    if not re.match(r'^[+0-9\s\-()]+$', raw):
        raise serializers.ValidationError(INDIAN_PHONE_ERROR_MESSAGE)

    # Strip formatting: spaces, hyphens, parentheses
    cleaned = re.sub(r'[\s\-()]+', '', raw)

    # Check for international prefix (starts with +)
    if cleaned.startswith('+'):
        if cleaned.startswith('+91'):
            national = cleaned[3:]
        else:
            # Preserve valid non-Indian E.164 international phone numbers (+ followed by 7-15 digits)
            if re.match(r'^\+[1-9]\d{6,14}$', cleaned):
                return cleaned
            raise serializers.ValidationError(INDIAN_PHONE_ERROR_MESSAGE)
    elif cleaned.startswith('91') and len(cleaned) == 12:
        national = cleaned[2:]
    elif cleaned.startswith('0') and len(cleaned) == 11:
        national = cleaned[1:]
    else:
        national = cleaned

    # National Indian mobile number must strictly be 10 digits starting with 6, 7, 8 or 9
    if not re.match(INDIAN_MOBILE_REGEX, national):
        raise serializers.ValidationError(INDIAN_PHONE_ERROR_MESSAGE)

    return f"+91{national}"


def is_valid_indian_phone(value: Optional[str]) -> bool:
    """
    Boolean validation helper without raising exceptions.
    """
    if not value:
        return False
    try:
        normalize_indian_phone(value, required=True)
        return True
    except serializers.ValidationError:
        return False


def validate_indian_phone(value: Optional[str]) -> str:
    """
    Convenience method for DRF Serializer validate_phone fields.
    """
    return normalize_indian_phone(value, required=True)
