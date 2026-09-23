# Vee Electricals — Authentication & Access Control Requirements (Phase 1)

## 1. Authentication Architecture Overview

* **Mechanism**: JSON Web Tokens (JWT) / DRF Token Authentication.
* **Token Transport**: Standard HTTP Header `Authorization: Bearer <access_token>`.
* **Frontend Storage**:
  * Persistent token stored in `localStorage` (`auth_token`).
  * Session credentials stored in `sessionStorage` (`vp_token`, `vp_user`, `vp_role`).
* **Session Lifecycle**:
  * Access Token: 60 minutes expiry.
  * Refresh Token: 7 to 14 days expiry with sliding window renewal.

---

## 2. User Entity & Identity Specification

* **Model**: Custom Django User extending `AbstractUser` and inheriting `TimeStampedModel`.
* **Username / Login Identifier**: `email` (Case-insensitive unique).
* **Identity Fields**:
  * `id` (`BIGINT UNSIGNED AUTO_INCREMENT`)
  * `email` (`VARCHAR(255)`, UNIQUE, NOT NULL)
  * `username` (`VARCHAR(150)`, UNIQUE, NOT NULL - defaulted to email prefix if not supplied)
  * `first_name` (`VARCHAR(150)`, NOT NULL)
  * `last_name` (`VARCHAR(150)`, DEFAULT '')
  * `phone` (`VARCHAR(20)`, NULL)
  * `role` (`ENUM('customer', 'admin')`, DEFAULT `'customer'`)
  * `is_admin` (`TINYINT(1)`, DEFAULT 0)
  * `is_active` (`TINYINT(1)`, DEFAULT 1)
  * `is_staff` (`TINYINT(1)`, DEFAULT 0)

---

## 3. Authentication Operations & Workflows

### 3.1 Login (`POST /api/v1/auth/login/`)
* **Request Payload**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123"
  }
  ```
* **Validation Rules**:
  * `email`: Required, valid email format regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
  * `password`: Required, non-empty.
* **Success Response (`200 OK`)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "Rajesh Kumar",
      "phone": "+91 9876543210",
      "role": "customer",
      "is_admin": false
    }
  }
  ```
* **Failure Responses**:
  * `400 Bad Request`: Missing email or password.
  * `401 Unauthorized`: "Invalid email or password".
  * `403 Forbidden`: "Account has been deactivated. Contact support."

### 3.2 Registration (`POST /api/v1/auth/register/`)
* **Request Payload**:
  ```json
  {
    "name": "Rajesh Kumar",
    "email": "rajesh@example.com",
    "password": "SecurePassword123",
    "phone": "+91 9876543210"
  }
  ```
* **Validation Rules**:
  * `name`: Required, min 2 characters.
  * `email`: Required, valid email, must not already exist in database (`unique`).
  * `password`: Required, min 6 characters (UI requirement; recommended >= 8 characters with alphanumeric check).
  * `phone`: Optional at registration, validated if provided.
* **Success Response (`201 Created`)**: Returns user data and JWT token or confirmation message.

### 3.3 Current User Session (`GET /api/v1/auth/me/`)
* **Header**: `Authorization: Bearer <token>`
* **Success Response (`200 OK`)**: Returns profile object of the currently authenticated token subject.
* **Failure Response (`401 Unauthorized`)**: Token expired or invalid.

### 3.4 Forgot & Reset Password
* **Forgot Password (`POST /api/v1/auth/forgot-password/`)**:
  * Request: `{"email": "user@example.com"}`
  * Logic: Generates a cryptographically secure, time-limited token (15–30 min validity) and emails a reset link.
  * Response: Always returns `200 OK` ("If an account exists with this email, a reset link has been sent") to prevent user enumeration.
* **Reset Password (`POST /api/v1/auth/reset-password/`)**:
  * Request: `{"token": "...", "new_password": "..."}`
  * Logic: Validates reset token, updates password hash, invalidates all prior sessions.

---

## 4. Role-Based Access Control (RBAC) & Endpoint Permissions

| Route / API Group | Description | Allowed Roles | DRF Permission Class |
|---|---|---|---|
| `GET /api/v1/products/**` | Browse & search product catalog | Public / Anyone | `AllowAny` |
| `GET /api/v1/categories/**` | Browse categories & hero promos | Public / Anyone | `AllowAny` |
| `GET /api/v1/brands/**` | View brand directory | Public / Anyone | `AllowAny` |
| `POST /api/v1/inquiries/` | Submit contact form | Public / Anyone | `AllowAny` |
| `POST /api/v1/auth/login/` | Authenticate credentials | Public / Anyone | `AllowAny` |
| `POST /api/v1/auth/register/` | Create account | Public / Anyone | `AllowAny` |
| `POST /api/v1/auth/forgot-password/` | Initiate password reset | Public / Anyone | `AllowAny` |
| `GET /api/v1/auth/me/` | Current user profile | Customer, Admin | `IsAuthenticated` |
| `POST /api/v1/orders/` | Place order / checkout | Customer, Admin | `IsAuthenticated` |
| `GET /api/v1/orders/my-orders/` | Customer's own order history | Customer, Admin | `IsAuthenticated` (Filtered to `user_id == request.user.id`) |
| `GET/POST/PUT/DELETE /api/v1/users/addresses/**` | Manage personal address book | Customer, Admin | `IsAuthenticated` (Filtered to `user_id == request.user.id`) |
| `GET/PATCH /api/v1/orders/**` (Admin) | Manage all orders & fulfillments | Admin Only | `IsAdminUser` (`is_staff or is_admin`) |
| `POST/PUT/PATCH/DELETE /api/v1/products/**` | Product catalog administration | Admin Only | `IsAdminUser` |
| `POST /api/v1/products/import-csv/` | Bulk product spreadsheet import | Admin Only | `IsAdminUser` |
| `GET/POST /api/v1/inventory/**` | Stock adjustments & ledger | Admin Only | `IsAdminUser` |
| `GET/POST/PUT/DELETE /api/v1/categories/**` | Category & hero discount management| Admin Only | `IsAdminUser` |
| `GET/POST/PUT/DELETE /api/v1/clients/**` | B2B Corporate buyers & credit limits | Admin Only | `IsAdminUser` |
| `GET/POST/PUT/DELETE /api/v1/quotations/**` | Commercial estimates & proposals | Admin Only | `IsAdminUser` |
| `GET/POST/PATCH /api/v1/invoices/**` | GST tax invoicing ledger | Admin Only | `IsAdminUser` |
| `GET/POST/PUT/DELETE /api/v1/expenses/**` | Operating expense tracker | Admin Only | `IsAdminUser` |
| `GET /api/v1/analytics/**` | Product and financial analytics | Admin Only | `IsAdminUser` |
| `GET/POST/PUT/DELETE /api/v1/shipping-rules/**`| Delivery cost configuration | Admin Only | `IsAdminUser` |

---

## 5. Security & Protection Checklist
1. **Password Hashing**: Django default Argon2 / PBKDF2 with SHA256; plain text passwords never stored.
2. **CORS Configuration**: Restrict allowed origins to frontend URL (`http://localhost:5173` in development, production domain in production).
3. **Rate Limiting**: Apply DRF throttling on `/auth/login/` (e.g. 5 attempts/minute) to mitigate brute-force password guessing.
4. **Data Isolation**: Customer endpoints MUST filter records by `request.user.id` to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.
