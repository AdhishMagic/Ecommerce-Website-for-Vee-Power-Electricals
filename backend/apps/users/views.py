from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .models import User
from .serializers import UserSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    email = request.data.get('email')
    if not email:
        return Response({'message': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    user, created = User.objects.get_or_create(
        email=email,
        defaults={'username': email.split('@')[0], 'first_name': 'Customer'}
    )
    serializer = UserSerializer(user)
    return Response({
        'user': serializer.data,
        'token': f'token_{user.id}'
    })

@api_view(['GET'])
@permission_classes([AllowAny])
def me_view(request):
    return Response({
        'id': 'u001',
        'name': 'Vee Customer',
        'email': 'customer@veepower.com',
        'phone': '9876543210',
        'role': 'customer'
    })
