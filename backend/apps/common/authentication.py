import logging
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed

logger = logging.getLogger(__name__)


class SafeJWTAuthentication(JWTAuthentication):
    """
    JWT authentication class that gracefully handles invalid or expired tokens
    without abruptly failing unauthenticated/public endpoints.

    In standard SimpleJWT, if an Authorization: Bearer <token> header is present
    and the token is expired/invalid, an InvalidToken exception is raised immediately
    during authentication, which aborts the request with 401 Unauthorized before
    permission classes (such as AllowAny) can be evaluated.

    With SafeJWTAuthentication:
    - If the token is valid, it authenticates the user as normal.
    - If the token is invalid, expired, or malformed, it logs a warning and returns None.
      Returning None causes DRF to treat the caller as AnonymousUser.
      * If the endpoint requires authentication (e.g. IsAuthenticated, IsAdminUser),
        DRF's permission class raises NotAuthenticated/PermissionDenied (401/403) as expected.
      * If the endpoint allows public access (AllowAny), the request succeeds normally.
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            return None

        raw_token = self.get_raw_token(header)
        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except (InvalidToken, AuthenticationFailed) as exc:
            logger.debug("SafeJWTAuthentication: token invalid or expired (%s). Treating as AnonymousUser.", exc)
            return None
