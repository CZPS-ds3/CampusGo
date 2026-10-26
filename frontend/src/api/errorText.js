import { copy } from '../i18n.js';

/** Text to show a person for any error thrown by the API layer. Never exposes technical details. */
export function errorText(error) {
  if (error?.code === 'NETWORK') return copy.errors.network;
  if (error?.code === 'RATE_LIMITED') return error.message;
  return error?.message && error.status ? error.message : copy.errors.generic;
}
