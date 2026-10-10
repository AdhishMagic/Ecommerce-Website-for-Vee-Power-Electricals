from django.core.checks import Error, Warning, register, Tags
from django.conf import settings


@register(Tags.security)
def check_razorpay_configuration(app_configs, **kwargs):
    """
    Validate Razorpay gateway configuration for deployment and production safety.
    """
    errors = []
    key_id = getattr(settings, 'RAZORPAY_KEY_ID', '')
    key_secret = getattr(settings, 'RAZORPAY_KEY_SECRET', '')
    webhook_secret = getattr(settings, 'RAZORPAY_WEBHOOK_SECRET', '')
    debug = getattr(settings, 'DEBUG', True)

    if not debug:
        # Production checks
        if key_id.startswith('rzp_live_'):
            if not key_secret or 'mock' in key_secret.lower():
                errors.append(
                    Error(
                        "RAZORPAY_KEY_ID is set to live credentials (rzp_live_*), but RAZORPAY_KEY_SECRET is missing or using a mock secret.",
                        hint="Configure RAZORPAY_KEY_SECRET with your live secret key from Razorpay Merchant Dashboard.",
                        id="finance.E001",
                    )
                )
            if not webhook_secret or 'mock' in webhook_secret.lower():
                errors.append(
                    Error(
                        "RAZORPAY_KEY_ID is set to live credentials, but RAZORPAY_WEBHOOK_SECRET is missing or using a mock secret.",
                        hint="Configure RAZORPAY_WEBHOOK_SECRET with your live webhook secret from Razorpay Merchant Dashboard.",
                        id="finance.E002",
                    )
                )
        elif key_id == 'rzp_test_mock_veepower_key' or not key_id:
            errors.append(
                Warning(
                    "Production is running with mock Razorpay test credentials. Customer online checkout will run in offline sandbox mode.",
                    hint="Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET when activating payments.",
                    id="finance.W001",
                )
            )

    return errors
