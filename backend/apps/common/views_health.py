import time
from django.db import connection
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Production health check endpoint verifying process liveness and dependency readiness.
    Query parameters:
      ?probe=liveness   -> Returns 200 if application process is responding.
      ?probe=readiness  -> Verifies application and database connectivity (default).
    """
    probe_type = request.query_params.get('probe', 'readiness').lower()

    if probe_type == 'liveness':
        return JsonResponse({
            'status': 'healthy',
            'probe': 'liveness',
            'services': {
                'application': 'up',
            },
            'timestamp': int(time.time()),
        }, status=status.HTTP_200_OK)

    # Readiness probe: verify active database connection
    db_status = 'disconnected'
    is_healthy = False
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
            if row and row[0] == 1:
                db_status = 'connected'
                is_healthy = True
    except Exception:
        db_status = 'disconnected'
        is_healthy = False

    response_data = {
        'status': 'healthy' if is_healthy else 'unhealthy',
        'probe': 'readiness',
        'services': {
            'application': 'up',
            'database': db_status,
        },
        'timestamp': int(time.time()),
    }

    status_code = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JsonResponse(response_data, status=status_code)
