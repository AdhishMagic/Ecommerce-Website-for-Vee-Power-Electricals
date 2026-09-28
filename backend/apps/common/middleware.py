import logging
import re
import threading
import uuid
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

_thread_locals = threading.local()

SAFE_REQUEST_ID_REGEX = re.compile(r'^[a-zA-Z0-9_\-]{8,64}$')


def get_current_request_id() -> str:
    """
    Returns the current request ID stored in thread-local context, or '-' if none.
    """
    return getattr(_thread_locals, 'request_id', None) or '-'


def set_current_request_id(request_id: str) -> None:
    """
    Stores the given request ID in thread-local context.
    """
    _thread_locals.request_id = request_id


def clear_current_request_id() -> None:
    """
    Clears the request ID from thread-local context.
    """
    if hasattr(_thread_locals, 'request_id'):
        del _thread_locals.request_id


class RequestIdFilter(logging.Filter):
    """
    Django logging filter that injects the current correlation request ID into log records.
    """
    def filter(self, record):
        record.request_id = get_current_request_id()
        return True


class RequestIdMiddleware(MiddlewareMixin):
    """
    Middleware that captures or generates a correlation Request ID for each incoming HTTP request.
    - Inspects incoming 'X-Request-ID' header.
    - If valid and safe, retains it; otherwise generates a unique 'req_<uuid16>' identifier.
    - Attaches the ID to request.id, thread-local storage, and response headers.
    """
    def process_request(self, request):
        incoming_id = request.headers.get('X-Request-ID') or request.META.get('HTTP_X_REQUEST_ID')
        if incoming_id and SAFE_REQUEST_ID_REGEX.match(incoming_id):
            request_id = incoming_id
        else:
            request_id = f"req_{uuid.uuid4().hex[:16]}"

        request.id = request_id
        set_current_request_id(request_id)

    def process_response(self, request, response):
        request_id = getattr(request, 'id', None) or get_current_request_id()
        if request_id and request_id != '-':
            response['X-Request-ID'] = request_id
        clear_current_request_id()
        return response

    def process_exception(self, request, exception):
        # Ensure thread local is preserved during exception processing in views
        request_id = getattr(request, 'id', None) or get_current_request_id()
        if request_id and request_id != '-':
            set_current_request_id(request_id)
        return None
