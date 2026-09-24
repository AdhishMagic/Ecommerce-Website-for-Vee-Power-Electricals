import re
from rest_framework import serializers
from .models import CustomerAddress, AddressType


class CustomerAddressSerializer(serializers.ModelSerializer):
    """
    Serializer for customer shipping and billing addresses.
    Always binds to the authenticated request.user.
    """
    class Meta:
        model = CustomerAddress
        fields = [
            'id', 'recipient_name', 'phone', 'address_line1',
            'address_line2', 'landmark', 'city', 'state', 'pincode',
            'address_type', 'is_default', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_pincode(self, value):
        cleaned = value.strip()
        if not re.match(r'^[1-9][0-9]{5}$', cleaned):
            raise serializers.ValidationError("PIN code must be a valid 6-digit Indian postal code.")
        return cleaned

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
