# Pinpoint Backend

Node.js, Express and MongoDB API for Pinpoint.

## Run locally

1. Install Node.js 20 or later.
2. From this folder, run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a MongoDB Atlas connection string in `MONGODB_URI`.
5. Set `JWT_SECRET` to a random secret of at least 32 characters.
6. Run `npm start`.

The API listens on the port supplied by the hosting platform, or port 5000 locally.

## Deploy to Render

The repository includes a root-level `render.yaml` Blueprint. In Render, create a new Blueprint deployment and select this repository. Render will use the `backend` folder as the service root.

Set the secret environment variable `MONGODB_URI` in Render to your MongoDB Atlas connection string. The Blueprint generates `JWT_SECRET` automatically. Do not commit real credentials to GitHub.

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

Authenticated routes require `Authorization: Bearer <token>`. Location and offer records are scoped to their owner.
