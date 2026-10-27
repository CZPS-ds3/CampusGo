import { t } from '../i18n.js';

/** Text to show a person for any error thrown by the API layer. Never exposes technical details. */
export function errorText(error) {
  if (error?.code === 'NETWORK') {
    return t('The server cannot be reached. Check your connection and try again.');
  }
  return error?.message && error.status
    ? error.message
    : t('Something went wrong. Please try again.');
}
