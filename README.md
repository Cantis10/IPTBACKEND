# Fresh of Verdant backend

The Express API uses the `TURSO_LINK`, `TURSO_TOKEN`, and `JWT_SECRET`
environment variables. Set `CORS_ORIGINS` to a comma-separated list of
frontend origins when they differ from the local Ionic and Angular defaults.
Credentialed requests use an HTTP-only `auth` cookie.

## API

- `POST /api/register` and `POST /api/login` create and authenticate accounts.
- `GET /api/isLoggedIn` returns the authenticated account.
- `GET /api/fetchProducts` returns active products.
- `GET /api/cart` returns the signed-in account and its cart.
- `POST /api/cart` adds a product (`product_id`, optional `quantity`).
- `PUT /api/cart/:productId` sets a cart item's quantity.
- `DELETE /api/cart/:productId` removes a cart item.

Passwords registered through the API are stored as salted scrypt hashes.