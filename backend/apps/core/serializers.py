from rest_framework import serializers
from .models import ContactInquiry, InquiryStatus


class ContactInquiryPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactInquiry
        fields = ['id', 'name', 'email', 'phone', 'subject', 'message', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Name cannot be blank.")
        return value.strip()

    def validate_phone(self, value):
        if not value.strip():
            raise serializers.ValidationError("Phone number is required.")
        return value.strip()

    def validate_subject(self, value):
        if not value.strip():
            raise serializers.ValidationError("Subject cannot be blank.")
        return value.strip()

    def validate_message(self, value):
        if not value.strip():
            raise serializers.ValidationError("Message cannot be blank.")
        return value.strip()


class ContactInquiryAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactInquiry
        fields = [
            'id', 'name', 'email', 'phone', 'subject', 'message',
            'status', 'admin_notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'name', 'email', 'phone', 'subject', 'message', 'created_at', 'updated_at']

    def validate_status(self, value):
        valid = [s.value for s in InquiryStatus]
        if value not in valid:
            raise serializers.ValidationError(f"Invalid status. Must be one of {valid}.")
        return value
