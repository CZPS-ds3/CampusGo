// One API object for the whole app. VITE_USE_MOCKS=true swaps in the in-browser mock (no backend needed).
import { createMockApi } from './mock.js';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onUnauthorized = () => {};
/** The session provider registers a callback that runs whenever the server answers 401. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(method, path, { body, form } = {}) {
  const init = { method, credentials: 'include', headers: {} };
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(BASE + path, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'The server cannot be reached.');
  }
  if (response.status === 204) return null;
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const { code = 'SERVER_ERROR', message = 'Something went wrong.', ...rest } = data?.error ?? {};
    const error = new ApiError(response.status, code, message, rest);
    if (response.status === 401 && code === 'UNAUTHENTICATED') onUnauthorized(error);
    throw error;
  }
  return data;
}

const post = (path, body) => request('POST', path, { body: body ?? {} });
const patch = (path, body) => request('PATCH', path, { body });
const query = (params) => {
  const text = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== ''),
  ).toString();
  return text ? `?${text}` : '';
};

const realApi = {
  requestOtp: (email) => post('/auth/request-otp', { email }),
  verify: (payload) => post('/auth/verify', payload),
  logout: () => post('/auth/logout'),
  devLastOtp: (email) => request('GET', `/dev/last-otp?email=${encodeURIComponent(email)}`),
  me: () => request('GET', '/me'),
  deleteAccount: () => request('DELETE', '/me'),
  uploadPicture: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/me/picture', { form });
  },
  setAvatarPreset: (preset) => post('/me/avatar-preset', { preset }),
  consent: () => post('/me/location-consent'),
  checkpoints: () => request('GET', '/checkpoints'),
  // One reading; the server decides and, when inside, unlocks the quiz (returns { status, attempt }).
  verifyLocation: (id, { latitude, longitude, accuracy, ageMs }) =>
    post(`/checkpoints/${id}/verify`, { lat: latitude, lng: longitude, accuracy, ageMs }),
  activeAttempt: () => request('GET', '/attempts/active'),
  attempt: (id) => request('GET', `/attempts/${id}`),
  answer: (id, optionId, questionNumber) =>
    post(`/attempts/${id}/answers`, { optionId, questionNumber }),
  acceptHard: (id) => post(`/attempts/${id}/hard`),
  result: (id) => request('GET', `/attempts/${id}/result`),
  myTeam: () => request('GET', '/teams/me'),
  createTeam: (name) => post('/teams', { name }),
  uploadTeamPicture: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/teams/me/picture', { form });
  },
  invite: (email) => post('/teams/me/invitations', { email }),
  invitations: () => request('GET', '/invitations'),
  acceptInvitation: (id) => post(`/invitations/${id}/accept`),
  rejectInvitation: (id) => post(`/invitations/${id}/reject`),
  soloBoard: () => request('GET', '/leaderboards/solo'),
  teamBoard: () => request('GET', '/leaderboards/team'),
  admin: {
    overview: () => request('GET', '/admin/overview'),
    users: (params) => request('GET', `/admin/users${query(params)}`),
    user: (id) => request('GET', `/admin/users/${id}`),
    createUser: (body) => post('/admin/users', body),
    updateUser: (id, body) => patch(`/admin/users/${id}`, body),
    setStatus: (id, status, reason) => post(`/admin/users/${id}/status`, { status, reason }),
    report: (id, reason) => post(`/admin/users/${id}/report`, { reason }),
    clearReport: (id) => request('DELETE', `/admin/users/${id}/report`),
    forceLogout: (id) => post(`/admin/users/${id}/logout`),
    deleteUser: (id) => request('DELETE', `/admin/users/${id}`),
    teams: () => request('GET', '/admin/teams'),
    renameTeam: (id, name) => patch(`/admin/teams/${id}`, { name }),
    removeMember: (teamId, studentId) =>
      request('DELETE', `/admin/teams/${teamId}/members/${studentId}`),
    deleteTeam: (id) => request('DELETE', `/admin/teams/${id}`),
    names: () => request('GET', '/admin/names'),
    addTerm: (term, mode) => post('/admin/names', { term, mode }),
    removeTerm: (term) => request('DELETE', `/admin/names/${encodeURIComponent(term)}`),
    testName: (text) => post('/admin/names/test', { text }),
  },
};

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
export const api = USE_MOCKS ? createMockApi(ApiError, () => onUnauthorized) : realApi;
