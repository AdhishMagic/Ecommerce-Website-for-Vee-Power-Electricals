# Customer Address APIs

Base URL: `/api/v1/addresses/`

Access to addresses is strictly authenticated (`IsAuthenticated`). All operations are owner-scoped to `request.user`. A customer cannot access, modify, or delete another customer's address records.

## 1. List Addresses
- **Endpoint**: `GET /api/v1/addresses/`
- **Auth**: Customer or Admin.
- **Behavior**:
  - Customers strictly see their own addresses.
  - Ordered by `['-is_default', '-id']`.
  - Admins can optionally filter by `user_id` query param.

## 2. Create Address
- **Endpoint**: `POST /api/v1/addresses/`
- **Auth**: Customer (`IsAuthenticated`).
- **Request Body**:
  ```json
  {
      "recipient_name": "Anand Kumar",
      "phone": "+919876543210",
      "address_line1": "123 Cross Cut Road",
      "address_line2": "Gandhipuram",
      "landmark": "Near Bus Stand",
      "city": "Coimbatore",
      "state": "Tamil Nadu",
      "pincode": "641012",
      "address_type": "home",
      "is_default": true
  }
  ```
- **Validation**:
  - `pincode`: Validates standard 6-digit Indian postal code format (`^[1-9][0-9]{5}$`).
  - Automatically bound to `request.user`.
  - If `is_default=True`, clears default flag from user's other addresses.

## 3. Retrieve / Update / Delete Address
- **Endpoints**:
  - `GET /api/v1/addresses/{id}/`
  - `PUT /api/v1/addresses/{id}/`
  - `PATCH /api/v1/addresses/{id}/`
  - `DELETE /api/v1/addresses/{id}/`
- **Ownership Security**: Returns `404 Not Found` if the address does not belong to `request.user`.

## 4. Set Default Address
- **Endpoint**: `POST /api/v1/addresses/{id}/set-default/`
- **Auth**: Customer (`IsAuthenticated`).
- **Description**: Atomically marks the given address as default and clears the default status from all other addresses of the user.
- **Response**: HTTP 200 with updated address representation.
