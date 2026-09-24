from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Standardizes error responses across all APIs:
    {
        "detail": "...",
        "errors": { ... }
    }
    Prevents leakage of raw database exceptions or internal stack traces.
    """
    response = exception_handler(exc, context)

    if response is not None:
        data = response.data
        detail = "An error occurred while processing your request."
        errors = {}

        if isinstance(data, dict):
            if 'detail' in data:
                detail = str(data['detail'])
                # remaining fields are field errors
                errors = {k: v for k, v in data.items() if k != 'detail'}
            else:
                detail = "Validation failed."
                errors = data
        elif isinstance(data, list):
            detail = str(data[0]) if data else "An error occurred."
            errors = {'non_field_errors': data}
        else:
            detail = str(data)

        out_data = {
            'detail': detail,
            'errors': errors if isinstance(errors, dict) else {'non_field_errors': errors}
        }
        if isinstance(errors, dict):
            # Include direct field keys for standard client & test compatibility
            for k, v in errors.items():
                if k not in out_data:
                    out_data[k] = v

        response.data = out_data

    return response
