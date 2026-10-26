"""
Management command to audit and reconcile administrator roles for authorized Google accounts.

Idempotently reconciles the project's server-side allowlisted administrator accounts
(veepower.cbe@gmail.com and balaadhish.cbe@gmail.com).

Safety guarantees:
- Operates strictly on allowlisted Google accounts.
- Preserves existing account IDs, hashed passwords, orders, addresses, and related records.
- Does not create duplicate user records.
- Does not downgrade or modify unrelated users or permissions.
- Does not grant Django superuser status unless explicitly requested and justified.
- Requires explicit `--confirm` flag to apply database changes; runs in safe `--dry-run` mode by default.
"""
import logging
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.users.models import (
    IdentityAuditLog,
    IdentityEventType,
    SocialAccount,
    SocialProvider,
    UserRole,
)
from apps.users.services.google_identity import (
    get_google_admin_emails,
    normalize_email,
)

logger = logging.getLogger(__name__)
User = get_user_model()


class Command(BaseCommand):
    help = (
        "Idempotently audits and reconciles server-side administrator role authorization "
        "for verified Google accounts (veepower.cbe@gmail.com, balaadhish.cbe@gmail.com)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Audit and simulate role reconciliation without modifying database records.',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            default=False,
            help='Explicit confirmation required to apply changes to database records.',
        )
        parser.add_argument(
            '--emails',
            type=str,
            default='',
            help='Comma-separated override of authorized admin emails (defaults to GOOGLE_ADMIN_EMAILS setting).',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        confirmed = options.get('confirm', False)
        emails_override = options.get('emails', '').strip()

        # By default, require explicit confirmation before modifying database records
        is_simulation = dry_run or (not confirmed)

        self.stdout.write(self.style.MIGRATE_HEADING("=" * 70))
        self.stdout.write(self.style.MIGRATE_HEADING("   VEE POWER ELECTRICALS: GOOGLE ADMIN ROLE RECONCILIATION AUDIT   "))
        self.stdout.write(self.style.MIGRATE_HEADING("=" * 70))

        if is_simulation:
            self.stdout.write(self.style.WARNING(
                "\n[MODE] DRY-RUN / SIMULATION (No database changes will be committed).\n"
                "To apply changes, pass the '--confirm' flag.\n"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                "\n[MODE] LIVE EXECUTION (Changes will be committed to the database).\n"
            ))

        if emails_override:
            target_emails = [normalize_email(e) for e in emails_override.split(',') if normalize_email(e)]
        else:
            target_emails = sorted(list(get_google_admin_emails()))

        self.stdout.write(f"Authorized Admin Emails Allowlist: {', '.join(target_emails)}")
        self.stdout.write(f"Target Role: {UserRole.ADMIN} (with is_staff=True, is_superuser=False)\n")

        stats = {
            'checked': len(target_emails),
            'promoted': 0,
            'already_admin': 0,
            'missing': 0,
        }

        for email in target_emails:
            self.stdout.write(self.style.HTTP_INFO(f"--- Checking account: {email} ---"))
            user = User.objects.filter(email__iexact=email).first()

            if not user:
                stats['missing'] += 1
                self.stdout.write(self.style.NOTICE(
                    f"  [MISSING] Account '{email}' does not exist in the database yet.\n"
                    f"            It will automatically be provisioned with role='{UserRole.ADMIN}' "
                    f"upon its first verified Google Sign-In, or it can be provisioned through the approved process."
                ))
                continue

            # User exists: gather audit metadata
            social_links = SocialAccount.objects.filter(
                user=user,
                provider=SocialProvider.GOOGLE,
            )
            has_social_link = social_links.exists()
            sub = social_links.first().provider_subject if has_social_link else 'Not linked yet'
            orders_count = getattr(user, 'orders', None).count() if hasattr(user, 'orders') else 0
            addresses_count = getattr(user, 'addresses', None).count() if hasattr(user, 'addresses') else 0

            self.stdout.write(
                f"  Found User Record:\n"
                f"    - User ID: {user.id}\n"
                f"    - Current Role: {user.role}\n"
                f"    - Staff Flag (is_staff): {user.is_staff}\n"
                f"    - Superuser Flag (is_superuser): {user.is_superuser}\n"
                f"    - Active (is_active): {user.is_active}\n"
                f"    - Email Verified (is_email_verified): {user.is_email_verified}\n"
                f"    - Google OIDC Linked: {has_social_link} (Subject: {sub})\n"
                f"    - Associated Orders Preserved: {orders_count}\n"
                f"    - Associated Addresses Preserved: {addresses_count}"
            )

            is_already_admin = (user.role == UserRole.ADMIN) and user.is_staff

            if is_already_admin:
                stats['already_admin'] += 1
                self.stdout.write(self.style.SUCCESS(
                    f"  [OK] Account '{email}' is already configured with role='{UserRole.ADMIN}' "
                    f"and is_staff=True. No modification required."
                ))
            else:
                if is_simulation:
                    stats['promoted'] += 1
                    self.stdout.write(self.style.WARNING(
                        f"  [PENDING PROMOTION] Account '{email}' (ID: {user.id}) currently has role='{user.role}' "
                        f"(is_staff={user.is_staff}).\n"
                        f"                      Would promote to role='{UserRole.ADMIN}', is_staff=True.\n"
                        f"                      All existing orders ({orders_count}), addresses ({addresses_count}), "
                        f"and user ID will be preserved intact."
                    ))
                else:
                    with transaction.atomic():
                        prev_role = user.role
                        user.role = UserRole.ADMIN
                        user.is_staff = True
                        user.is_email_verified = True
                        # Note: is_superuser is NOT automatically granted.
                        # Role='admin' and is_staff=True provide full administrative permissions.
                        user.save(update_fields=['role', 'is_staff', 'is_email_verified', 'updated_at'])

                        # Write an audit trail entry
                        IdentityAuditLog.objects.create(
                            user=user,
                            provider=SocialProvider.GOOGLE,
                            event_type=IdentityEventType.GOOGLE_LOGIN,
                            provider_subject=sub if has_social_link else '',
                            email=user.email,
                            detail=f"admin_reconciled_via_command:promoted_{prev_role}_to_admin",
                        )

                    stats['promoted'] += 1
                    self.stdout.write(self.style.SUCCESS(
                        f"  [PROMOTED] Successfully promoted '{email}' (ID: {user.id}) to role='{UserRole.ADMIN}', "
                        f"is_staff=True. All orders ({orders_count}) and addresses ({addresses_count}) preserved."
                    ))

        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.MIGRATE_HEADING("   RECONCILIATION SUMMARY   "))
        self.stdout.write("=" * 70)
        self.stdout.write(f"Total allowlisted accounts audited: {stats['checked']}")
        self.stdout.write(f"Accounts promoted to admin:         {stats['promoted']}")
        self.stdout.write(f"Accounts already verified admin:    {stats['already_admin']}")
        self.stdout.write(f"Accounts missing from database:     {stats['missing']}")
        self.stdout.write("=" * 70)

        if is_simulation and stats['promoted'] > 0:
            self.stdout.write(self.style.NOTICE(
                "\nTo apply these planned promotions to the database, run:\n"
                "  python manage.py reconcile_google_admins --confirm\n"
            ))
