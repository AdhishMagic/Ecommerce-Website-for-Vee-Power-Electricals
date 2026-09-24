# Vee Power Electricals — Backend (Django 5.2 + MySQL 8.0)

Production-grade backend foundation for Vee Power Electricals E-Commerce Platform.

---

## 1. System Technology Requirements

| Component | Technology | Version |
|---|---|---|
| **Runtime** | Python | `3.12+` (Container: `3.12.14`) |
| **Framework** | Django | `5.2.x` (LTS/Current: `5.2.17`) |
| **Database** | MySQL (InnoDB engine, utf8mb4) | `8.0+` |
| **Database Driver**| PyMySQL (configured as MySQLdb) | `1.2.3+` |
| **Architecture** | Docker Compose Multi-Container Stack | Docker Engine 24+ |

---

## 2. Project Architecture & App Organization

The backend is organized into 7 domain-specific Django applications adhering strictly to the reconciled 28 canonical entities blueprint:

```text
backend/
├── config/                     # Project configuration & settings
│   ├── settings/
│   │   ├── base.py             # Common settings, INSTALLED_APPS, middleware, database config
│   │   ├── development.py      # Local development overrides
│   │   └── production.py       # Production hardening settings
│   ├── asgi.py
│   ├── urls.py
│   └── wsgi.py
│
├── apps/
│   ├── common/                 # Reusable TimeStampedModel & shared utilities
│   ├── users/                  # [2 Models] User (Unified role), CustomerAddress (Single-default)
│   ├── commercial_config/      # [6 Models] TaxConfiguration, DeliveryConfiguration, DistanceSlab,
│   │                           #            ShippingRule, OrderDiscount, CompanyStoreConfiguration
│   ├── products/               # [6 Models] Category, Subcategory, Brand, Product, ProductImage, ProductSpecification
│   ├── inventory/              # [1 Model]  StockTransaction (Protected, immutable ledger)
│   ├── orders/                 # [3 Models] Order (10-state FSM, dual storage), OrderItem, OrderStatusHistory
│   ├── finance/                # [8 Models] Client, Quotation, QuotationItem, Invoice (1:N capable, acyclic),
│   │                           #            InvoiceItem, PaymentTransaction, Expense, PayoutSettlement
│   └── core/                   # [2 Models] AdminConfigAuditLog, ContactInquiry
│       └── management/commands/# seed_development_data.py (Idempotent seed engine)
│
├── tests/                      # Model & integrity test suite (17 focused unit tests)
│   ├── __init__.py
│   └── test_phase3_models.py
│
├── requirements.txt            # Python dependencies
├── Dockerfile                  # Production-ready backend container definition
└── README.md                   # This documentation
```

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Key environment configuration options:

```dotenv
# Django Core Settings
SECRET_KEY=development-secret-key-change-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,backend

# Development Database (MySQL 8.0)
DB_NAME=veepower_db
DB_USER=veepower
DB_PASSWORD=root
DB_HOST=mysql
DB_PORT=3306

# Superuser Initial Seed Credentials
DJANGO_SUPERUSER_EMAIL=admin@veepower.in
DJANGO_SUPERUSER_PASSWORD=AdminPass123!
```

---

## 4. Installation & Setup

### 4.1 Running via Docker (Recommended)

1. Build and start containers from root directory:
   ```bash
   docker compose up -d --build
   ```
2. Verify container statuses:
   ```bash
   docker ps
   ```

### 4.2 Database Migrations

Apply all initial migrations to create all 28 canonical domain tables:
```bash
docker exec veepower_backend python manage.py migrate
```

Verify migration status:
```bash
docker exec veepower_backend python manage.py showmigrations
```

### 4.3 Seeding Safe Development Baseline Data

Populate the database with safe, idempotent development baseline fixtures:
```bash
docker exec veepower_backend python manage.py seed_development_data
```

*Note: This command is 100% idempotent and can be safely executed multiple times without creating duplicates.*

### 4.4 Running Model & Database Integrity Tests

Execute the Phase 3 test suite:
```bash
docker exec veepower_backend python manage.py test tests
```

---

## 5. Phase 3 Scope & Boundaries

### 5.1 What IS Implemented in Phase 3
- [x] Custom unified `User` model with email-based identity and automatic `is_staff` synchronization for admin roles.
- [x] All **28 Canonical Entities** implemented as Django models with full schema parity against Phase 2/2.1 design documents.
- [x] Clean, acyclic migration DAG (exactly 1 initial migration per domain app; zero cross-app circular dependencies).
- [x] Generated virtual column and database-level constraints for safe single-default customer address enforcement (`CustomerAddress.default_user_id`).
- [x] Financial snapshot JSON + structured `DECIMAL` dual-storage pattern for orders and invoices.
- [x] Canonical 10-state Order fulfillment FSM with `chk_order_status` database constraint.
- [x] Strictly unidirectional, acyclic Quotation ↔ Invoice relationship (`Invoice.quotation_id -> Quotation.id`, zero `converted_invoice_id` column).
- [x] Protected stock ledger history (`StockTransaction.product` `ON DELETE PROTECT`).
- [x] Idempotent custom management command `seed_development_data` covering all 28 models.
- [x] 17 focused unit tests covering model constraints, unique indexes, relationships, and delete protections.

### 5.2 What IS NOT Implemented in Phase 3 (Strictly Out of Scope)
- ❌ REST API endpoints, ViewSets, and URL routers.
- ❌ Django REST Framework serializers.
- ❌ JWT authentication flows (login, register, token refresh, password reset APIs).
- ❌ Payment gateway integration (Razorpay webhooks, signature verification).
- ❌ Business services (checkout calculation service, quotation conversion workflow, stock deduction transactions).
- ❌ Frontend integration or any React/TypeScript code modifications.
- ❌ Production deployment scripts and cloud infrastructure.

*These features belong to subsequent development phases (Phase 4: Authentication & RBAC, Phase 5: Catalog & Admin APIs, Phase 6: Orders & Checkout Engine).*
