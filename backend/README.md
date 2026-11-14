# Pinpoint Backend

Node.js, Express and MongoDB API for Pinpoint, including a browser-based administrator console.

## Run locally

1. Install Node.js 20 or later.
2. From this folder, run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a MongoDB Atlas connection string in `MONGODB_URI`.
5. Set `JWT_SECRET` to a random secret of at least 32 characters.
6. Set `ADMIN_EMAIL` to the email address of your Pinpoint account. Register that account in the mobile app first if it does not exist yet.
7. Run `npm start`.

The API listens on the port supplied by the hosting platform, or port 5000 locally.

## Administrator console

Open `/admin` on the deployed backend, for example `https://your-api-host/admin`.

To enable the first administrator:
1. Create a normal Pinpoint account using the email address you intend to use as the admin.
2. In the Render service environment, set `ADMIN_EMAIL` to that exact email address (lowercase is fine).
3. Deploy/restart the backend. On startup, the matching account is promoted to the admin role. If the account is created later, its first successful login after registration is promoted.
4. Sign in at `/admin` using the same email and password.

The admin UI does not have a separate hard-coded password. Every management endpoint checks the user's admin role in MongoDB. Do not put an admin password or database secret in the frontend or GitHub. Keep at least one active admin account. Administrators can manage users, review and publish locations, add public places, manage categories, and manage offers. Deleting a location also deletes its attached offers.

## Deploy to Render

The repository includes a root-level `render.yaml` Blueprint. In Render, create a new Blueprint deployment and select this repository. Render will use the `backend` folder as the service root.

Set `MONGODB_URI`, `JWT_SECRET` and `ADMIN_EMAIL` in the Render service environment. The Blueprint generates `JWT_SECRET` automatically. For an existing manually-created Render Web Service, add `ADMIN_EMAIL` under Environment and redeploy. Do not commit real credentials to GitHub.

For initial Atlas connectivity testing, Atlas Network Access must allow the Render service to reach the cluster. Prefer a restricted IP range or a private networking option when available; use a broad allow-list only temporarily if needed.

## Health check

- `GET /api/v1/health`

## API routes

All routes use the `/api/v1` prefix.

### Authentication
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)

### Locations
- `POST /locations`
- `GET /locations`
- `GET /locations/nearby`
- `GET /locations/:id`
- `PUT /locations/:id`
- `DELETE /locations/:id`
- `PATCH /locations/:id/sharing`

### Categories
- `GET /categories`
- `POST /categories`
- `PUT /categories/:id`
- `DELETE /categories/:id`

### Offers
- `POST /offers`
- `GET /offers/location/:locationId`
- `PUT /offers/:id`
- `DELETE /offers/:id`

### Administrator (admin role required)
- `GET /admin/overview`
- `GET /admin/users`, `PATCH /admin/users/:id`
- `GET /admin/locations`, `POST /admin/locations`, `PUT /admin/locations/:id`, `DELETE /admin/locations/:id`
- `GET /admin/categories`, `POST /admin/categories`, `PUT /admin/categories/:id`, `DELETE /admin/categories/:id`
- `GET /admin/offers`, `POST /admin/offers`, `PUT /admin/offers/:id`, `DELETE /admin/offers/:id`

Authenticated routes require `Authorization: Bearer <token>`. Regular user location and offer records remain owner-scoped; administrator routes are protected by a server-side role check.
