from django.apps import AppConfig


class AdminSettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.admin_settings'
    # An explicit label keeps the app identifier unambiguous next to
    # django.conf.settings and the config.settings package.
    label = 'admin_settings'
    verbose_name = 'Administrative Settings & Session Governance'
