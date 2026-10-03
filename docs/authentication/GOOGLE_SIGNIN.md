# Google Sign-In (OIDC) — Setup & Behavior

This document describes the controlled post-freeze Google Sign-In capability.
Google is used **strictly as an external identity provider**. The application's
authoritative customer account and all business data remain in Django + MySQL.
No Firebase, Google Drive, Google Sheets, or any other Google data store is used.

> Baseline: frozen app `v1.0.0-frozen` (`ed40091`). This feature is delivered as a
> separate post-freeze change commit and does not move the frozen tag.

## 1. Google Cloud project requirement

1. Create (or reuse) a Google Cloud project in the Google Cloud Console.
2. Configure the **OAuth consent screen** (External, single app).
   - User type: External is sufficient for a public storefront.
   - Publishing status: *Testing* accepts only listed test users; switch to
     *In production* before go-live.
3. Create credentials → **OAuth client ID** → Application type **Web application**.
4. Record the generated **Client ID**. This value is public and is the only
   Google credential the application needs for the ID-token flow. **A client
   secret is not required by this implementation and must never be placed in the
   frontend.**

## 2. Authorized origins and redirect URIs

Google Identity Services uses a popup flow; the browser posts the credential
back to the page, so no server-side redirect URI is required by this
implementation.

| Setting | Development | Production |
|---|---|---|
| Authorized JavaScript origins | `http://localhost:5173`, `http://127.0.0.1:5173` | the finalized HTTPS production origin(s), e.g. `https://veepower.in` |
| Authorized redirect URIs | not required (popup mode) | not required (popup mode) |

**Production requires the finalized production domain.** Do not use wildcard
origins. Register the exact origin(s) after the production domain is approved.

## 3. Required scopes

The implementation requests only the minimum OIDC identity scopes:

```
openid
email
profile
```

Google Drive, Gmail, Calendar, Contacts, Workspace, and Cloud scopes are **not**
requested. Access tokens are not retained by the application; only the Google
ID token is verified (server-side) and then discarded.

## 4. Environment variables

| Variable | Scope | Purpose | Secret? |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | backend | OAuth 2.0 Web client ID used to validate the ID token audience | No (public) |
| `GOOGLE_TOKENINFO_URL` | backend (optional) | Override the ID-token verification endpoint; defaults to `https://oauth2.googleapis.com/tokeninfo` | No |
| `VITE_GOOGLE_CLIENT_ID` | frontend build | Client ID used by Google Identity Services to render the button | No (public) |

Placeholders live in `.env.example`, `backend/.env.example`, and
`frontend/.env.example`. With `VITE_GOOGLE_CLIENT_ID` unset, the frontend renders
a disabled "Continue with Google" control and email/password login remains the
only active path.

Never commit a client secret, production OAuth credentials, access tokens, or
refresh tokens.

## 5. Data ownership model

```
User (MySQL: users)
  ↓ 1 — N
SocialAccount (MySQL: social_accounts)
  ↓
Google identity (external, verified per request)
```

- Google identity records are stored **in MySQL** (`social_accounts`).
- `provider_subject` is Google's stable `sub` claim and is the identity key.
  Email is stored for reference only and is never the provider primary key.
- `UNIQUE (provider, provider_subject)` prevents one Google identity from being
  linked to more than one local account.
- Customer orders, invoices, addresses, payments, and credit data never leave
  MySQL.

## 6. Backend flow

`POST /api/v1/auth/google/` with `{ "credential": "<google-id-token>" }`:

1. `verify_google_id_token` calls Google's tokeninfo endpoint (server-side,
   5 s timeout) to validate signature, issuer, and expiry, then re-validates
   locally: `aud == GOOGLE_CLIENT_ID`, `iss ∈ {accounts.google.com, https://accounts.google.com}`,
   a non-empty `sub`, and `email_verified == true`.
2. `sign_in_with_google` resolves the identity to exactly one local `User`.
3. The endpoint returns the **same JWT shape** as `/auth/login/` plus
   `provider`, `is_new_user`, and `linked_existing_account` flags.

### Account-matching policy

| Situation | Behavior |
|---|---|
| Existing `SocialAccount(provider, provider_subject)` | Authenticate the linked user (no new account). |
| No link, but verified canonical email matches a local account | **Link** the Google identity to that existing account. No duplicate user is created; no business record is moved. |
| No link and no email match | **Create** a new local customer `User` + `SocialAccount`. |
| Google email differs from the local account email | Treated as a **separate identity** — never merged, never overwritten. |
| Duplicate `(provider, provider_subject)` | Impossible at the DB level (UNIQUE constraint); concurrent races resolve to the existing link. |

Email matching uses one canonical policy shared with email/password auth: trim
surrounding whitespace and lower-case. Provider-specific transformations
(removing Gmail dots or `+` tags) are deliberately **not** applied.

### Account-linking safety

- Only a **verified** Google email may link. Unverified emails are rejected.
- The frontend is never trusted for `email`, `name`, or `picture`; all identity
  data originates from the validated Google credential.
- An existing local account is only linked when the verified canonical email
  matches exactly; other addresses remain separate accounts.
- Inactive/disabled accounts are rejected.
- Existing authentication strength is not weakened.

## 7. Audit logging

Append-only `identity_audit_logs` records `GOOGLE_LOGIN`, `GOOGLE_REGISTER`,
`GOOGLE_LINK`, `LINK_REJECTED`, `DUPLICATE_IDENTITY`, and `LINK_CONFLICT`
events with the affected local user, provider, subject, email, and IP.

Audit records **never** contain authorization codes, access tokens, refresh
tokens, client secrets, or passwords.

## 8. Error handling

All failures use the application's canonical error envelope
(`{ success, error: { code, message, details, request_id }, ... }`). Machine
codes include `INVALID_GOOGLE_TOKEN`, `GOOGLE_EMAIL_UNVERIFIED`,
`GOOGLE_SIGNIN_NOT_CONFIGURED`, `GOOGLE_PROVIDER_UNAVAILABLE`,
`ACCOUNT_INACTIVE`, `ACCOUNT_LINK_CONFLICT`, and `DUPLICATE_GOOGLE_IDENTITY`.
Technical OAuth details are never surfaced to users; OAuth cancellation or
popup dismissal simply leaves the user on the login form.

## 9. Frontend

- The existing Login page gains a "Continue with Google" control beneath the
  email/password form, separated by an "or" divider. The page is not redesigned.
- The control is rendered by Google Identity Services ("Continue with Google",
  outline theme) and returns an opaque ID token to the backend. No client secret
  is present in the React bundle.
- When the returned account was linked to an existing local account, the UI
  shows "Signed in with Google using your existing account."
- Internal provider identifiers are never displayed.
- Email/password login and registration are unchanged and remain fully
  supported. There is no second registration system; Google converges into the
  same `User`/customer model.

## 10. Production safety

- Do **not** configure production Google OAuth until the production domain is
  finalized and registered as an authorized origin. Use development OAuth
  credentials locally.
- The production origin must exactly match the approved origin. Wildcard
  origins are not used.
- Production readiness of Google OAuth is **not** claimed by this change; it
  requires the production domain plus a production OAuth client, which do not
  yet exist.
