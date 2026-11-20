import { API_BASE_URL } from "./config";

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  register: (details) => request("/auth/register", { method: "POST", body: details }),
  login: (details) => request("/auth/login", { method: "POST", body: details }),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
  me: (token) => request("/auth/me", { token }),
  getLocations: (token) => request("/locations", { token }),
  getCircles: (token) => request("/circles", { token }),
  createCircle: (token, details) => request("/circles", { method: "POST", token, body: details }),
  joinCircle: (token, inviteCode) => request("/circles/join", { method: "POST", token, body: { inviteCode } }),
  inviteCircle: (token, id, email) => request(`/circles/${id}/invite`, { method: "POST", token, body: { email } }),
  getCircleRequests: (token, id) => request(`/circles/${id}/requests`, { token }),
  reviewCircleRequest: (token, id, userId, status) => request(`/circles/${id}/requests/${userId}`, { method: "PATCH", token, body: { status } }),
  getCategories: (token) => request("/categories", { token }),
  createCategory: (token, details) => request("/categories", { method: "POST", token, body: details }),
  getNearbyLocations: (token, latitude, longitude, maxDistance = 5000) => request("/locations/nearby?latitude=" + latitude + "&longitude=" + longitude + "&maxDistance=" + maxDistance, { token }),
  createLocation: (token, details) => request("/locations", { method: "POST", token, body: details }),
  getLocation: (token, id) => request(`/locations/${id}`, { token }),
  updateLocation: (token, id, details) => request(`/locations/${id}`, { method: "PUT", token, body: details }),
  deleteLocation: (token, id) => request(`/locations/${id}`, { method: "DELETE", token }),
  deleteAccount: (token) => request("/auth/account", { method: "DELETE", token })
};
