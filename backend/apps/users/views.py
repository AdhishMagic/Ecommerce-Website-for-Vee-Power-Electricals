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
    password = request.data.get('password')
    if not email:
        return Response({'message': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    user = User.objects.filter(email=email).first()
    if user:
        if user.has_usable_password():
            if not password or not user.check_password(password):
                return Response({'message': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)
    else:
        if password:
            user = User(
                email=email,
                username=email.split('@')[0],
                first_name='Customer'
            )
            user.set_password(password)
            user.save()
        else:
            user = User.objects.create(
                email=email,
                username=email.split('@')[0],
                first_name='Customer'
            )

    serializer = UserSerializer(user)
    user_data = serializer.data
    user_data['name'] = user.get_full_name() or user.first_name or user.username
    user_data['role'] = 'admin' if (user.is_admin or user.is_staff or user.is_superuser) else 'customer'
    return Response({
        'user': user_data,
        'token': f'token_{user.id}'
    })

@api_view(['GET'])
@permission_classes([AllowAny])
def me_view(request):
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer token_'):
        user_id = auth_header.split('Bearer token_')[-1]
        try:
            user = User.objects.get(id=user_id)
            user_data = UserSerializer(user).data
            user_data['name'] = user.get_full_name() or user.first_name or user.username
            user_data['role'] = 'admin' if (user.is_admin or user.is_staff or user.is_superuser) else 'customer'
            return Response(user_data)
        except (User.DoesNotExist, ValueError):
            pass

    return Response({
        'id': 'u001',
        'name': 'Vee Customer',
        'email': 'customer@veepower.com',
        'phone': '9876543210',
        'role': 'customer'
    })
