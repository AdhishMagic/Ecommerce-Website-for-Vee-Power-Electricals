# Vee Electricals — Authentication & RBAC Architecture Specification (Phase 4)

## 1. Authentication Architecture Overview

* **Mechanism**: JSON Web Tokens (JWT) using `djangorestframework-simplejwt`.
* **Signing Algorithm**: Single symmetric algorithm: **HS256** (HMAC using SHA-256).
* **JWT Secret Management**: Read securely from environment variable `JWT_SECRET_KEY` (falls back to Django `SECRET_KEY`). Secrets are never hardcoded in source.
* **Token Transport**: Standard HTTP Authorization Header: `Authorization: Bearer <access_token>`.
* **Token Lifetimes & Rotation Policy**:
  * **Access Token**: `30 minutes` (`timedelta(minutes=30)`).
  * **Refresh Token**: `7 days` (`timedelta(days=7)`).
  * **Token Rotation**: `ROTATE_REFRESH_TOKENS = True` (Every token refresh generates a fresh access token AND a fresh refresh token).
  * **Token Blacklist**: `BLACKLIST_AFTER_ROTATION = True` (Rotated refresh tokens and logged-out tokens are immediately added to the blacklist table, preventing token replay attacks).
* **User Identity Model**: Unified `User` model (`apps.users.models.User`, `AbstractUser`, `TimeStampedModel`) on MySQL table `users`.
* **Login Identifier**: Case-insensitive unique `email`.
* **Password Hashing**: Django native cryptographic password hasher (`PBKDF2-SHA256`). Plaintext passwords are never stored or returned.

---

## 2. Authentication API Endpoints (`/api/v1/auth/`)

| Method | Endpoint | Auth Required | Permissions | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register/` | No | `AllowAny` | Register new customer account |
| `POST` | `/api/v1/auth/login/` | No | `AllowAny` | Authenticate customer/staff and issue JWT tokens |
| `POST` | `/api/v1/auth/token/refresh/` | No | `AllowAny` | Submit refresh token; issues new access + refresh pair and blacklists old refresh |
| `POST` | `/api/v1/auth/logout/` | No | `AllowAny` | Invalidate/blacklist refresh token |
| `GET` | `/api/v1/auth/me/` | Yes | `IsAuthenticated` | Retrieve safe current user profile |
| `PUT` | `/api/v1/auth/me/` | Yes | `IsAuthenticated` | Update allowed personal fields (`first_name`, `last_name`, `phone`) |
| `PATCH` | `/api/v1/auth/me/` | Yes | `IsAuthenticated` | Partial update allowed personal fields |
| `POST` | `/api/v1/auth/password-reset/` | No | `AllowAny` | Request password reset email OR confirm reset |
| `POST` | `/api/v1/auth/password-reset/confirm/`| No | `AllowAny` | Confirm password reset using `uidb64`, `token`, and `new_password` |

---

## 3. Endpoint Specifications

### 3.1 Registration (`POST /api/v1/auth/register/`)
* **Request Body**:
  ```json
  {
    "email": "customer@example.com",
    "password": "SecurePassword123!",
    "first_name": "Ramesh",
    "last_name": "Kumar",
    "phone": "+919876543210"
  }
  ```
* **Validation**:
  * `email`: Required, valid email format, unique (case-insensitive).
  * `password`: Required, validated via `django.contrib.auth.password_validation.validate_password`.
  * `first_name`, `last_name`: Required, non-empty.
  * Role escalation protection: Any client-provided `role`, `is_staff`, or `is_superuser` is strictly ignored; user is unconditionally created as `role='customer'`, `is_staff=False`, `is_superuser=False`, `is_active=True`.
* **Response (`201 Created`)**:
  ```json
  {
    "message": "User registered successfully.",
    "user": {
      "id": 1,
      "email": "customer@example.com",
      "username": "customer@example.com",
      "first_name": "Ramesh",
      "last_name": "Kumar",
      "phone": "+919876543210",
      "role": "customer",
      "is_active": true,
      "is_staff": false,
      "is_superuser": false,
      "created_at": "2026-09-24T13:00:00Z",
      "updated_at": "2026-09-24T13:00:00Z"
    },
    "access": "eyJhbGciOiJIUzI1NiIsIn...",
    "refresh": "eyJhbGciOiJIUzI1NiIsIn...",
    "tokens": {
      "access": "eyJhbGciOiJIUzI1NiIsIn...",
      "refresh": "eyJhbGciOiJIUzI1NiIsIn..."
    }
  }
  ```

### 3.2 Login (`POST /api/v1/auth/login/`)
* **Request Body**:
  ```json
  {
    "email": "customer@example.com",
    "password": "SecurePassword123!"
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "message": "Login successful.",
    "user": { ... },
    "access": "eyJhbGciOiJIUzI1NiIsIn...",
    "refresh": "eyJhbGciOiJIUzI1NiIsIn...",
    "tokens": {
      "access": "eyJhbGciOiJIUzI1NiIsIn...",
      "refresh": "eyJhbGciOiJIUzI1NiIsIn..."
    }
  }
  ```
* **Error Handling**:
  * Invalid credentials: Returns `401 Unauthorized` (`{"detail": "Invalid email or password."}`). Does NOT leak whether email exists.
  * Disabled account: Returns `401 Unauthorized` (`{"detail": "Account is disabled or inactive."}`).

### 3.3 Token Refresh (`POST /api/v1/auth/token/refresh/`)
* **Request Body**:
  ```json
  {
    "refresh": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsIn...",
    "refresh": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
* **Rotation & Invalidation**:
  * A new access token and fresh refresh token are returned.
  * The old refresh token is blacklisted. Reusing an old refresh token returns `401 Unauthorized`.

### 3.4 Logout (`POST /api/v1/auth/logout/`)
* **Request Body**:
  ```json
  {
    "refresh": "eyJhbGciOiJIUzI1NiIsIn..."
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "message": "Successfully logged out. Token has been invalidated."
  }
  ```
* **Errors**:
  * Missing token: `400 Bad Request` (`{"detail": "Refresh token is required."}`).
  * Already blacklisted / malformed token: `400 Bad Request` (`{"detail": "Token is blacklisted"}`).

### 3.5 Current User Profile (`GET /api/v1/auth/me/`)
* **Header**: `Authorization: Bearer <access_token>`
* **Response (`200 OK`)**: Safe user profile without password or hash.
* **Unauthenticated (`401 Unauthorized`)**: Missing or invalid token.

### 3.6 Profile Self-Service Update (`PUT / PATCH /api/v1/auth/me/`)
* **Header**: `Authorization: Bearer <access_token>`
* **Allowed Fields**: `first_name`, `last_name`, `phone`.
* **Privilege Escalation Protection**: Sending `role`, `is_staff`, `is_superuser`, `email`, or `password` causes immediate `400 Bad Request` rejection (`"Modifying restricted security fields is not permitted."`).

### 3.7 Password Reset
* **Request Reset (`POST /api/v1/auth/password-reset/`)**:
  * Request Body: `{"email": "customer@example.com"}`
  * Behavior: If user exists and is active, generates Django cryptographic reset token (`default_token_generator`) and emails instructions.
  * Response: Always returns `200 OK` (`"If an account with this email exists, password reset instructions have been sent."`) to prevent user enumeration.
* **Confirm Reset (`POST /api/v1/auth/password-reset/confirm/` or unified `/password-reset/`)**:
  * Request Body:
    ```json
    {
      "uidb64": "MTg",
      "token": "d2y...-...",
      "new_password": "NewSecurePassword123!"
    }
    ```
  * Invalidation: Changing password updates password hash, cryptographically invalidating the token immediately. Tokens cannot be reused.

---

## 4. Role-Based Access Control (RBAC) System

Implemented in `apps.users.permissions`:

### 4.1 Permission Classes
1. **`IsCustomer`**:
   * Evaluates: `request.user.is_authenticated and request.user.role == 'customer' and not request.user.is_staff and not request.user.is_superuser`
   * Restricts endpoints exclusively to customer users.
2. **`IsAdminUser`**:
   * Evaluates: `request.user.is_authenticated and (request.user.role == 'admin' or request.user.is_staff or request.user.is_superuser)`
   * Grants access to administrative operations and staff members.
3. **`IsStaffOrReadOnly`**:
   * Evaluates: `request.method in SAFE_METHODS` (GET, HEAD, OPTIONS) for authenticated users; write methods require `is_staff` or `role == 'admin'`.
4. **`IsSuperAdminUser`**:
   * Evaluates: `request.user.is_authenticated and request.user.is_superuser`.
5. **`IsOwnerOrAdmin`**:
   * Object-level permission ensuring users can only read/edit their own resources unless they have administrative privileges.

### 4.2 Server-Side Security Enforcement
* Frontend route hiding is treated purely as UI ergonomics. All authorization is strictly enforced on the server.
* Customers cannot change their role, elevate to staff, or access administrative APIs.
* Role values supplied by clients in request payloads are rejected or ignored.
