import { t } from '../../i18n.js';

/** Date and time in the language the visitor chose. */
export function formatDateTime(iso) {
  if (!iso) return '–';
  const lang = document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB';
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export const STATUS_TONE = { active: 'ok', blocked: 'red', archived: 'mute', deleted: 'mute' };

export function statusLabel(status) {
  switch (status) {
    case 'active':
      return t('Active');
    case 'blocked':
      return t('Blocked');
    case 'archived':
      return t('Archived');
    case 'deleted':
      return t('Deleted');
    default:
      return status;
  }
}

/** Plain-language name of an activity log entry. */
export function eventLabel(type) {
  switch (type) {
    case 'login':
      return t('Logged in');
    case 'logout':
      return t('Logged out');
    case 'forced_logout':
      return t('Logged out by an admin');
    case 'account_created':
      return t('Account created by an admin');
    case 'account_edited':
      return t('Account edited by an admin');
    case 'account_deleted':
    case 'account_deleted_by_admin':
      return t('Account deleted by an admin');
    case 'account_deleted_by_student':
      return t('Account deleted by the student');
    case 'account_erased':
      return t('Account erased for good');
    case 'account_restored':
      return t('Account restored by an admin');
    case 'added_to_team':
      return t('Added to a team by an admin');
    case 'passed':
      return t('Quest passed');
    case 'points_reset':
      return t('Points reset');
    case 'status_active':
      return t('Account activated');
    case 'status_blocked':
      return t('Account blocked');
    case 'status_archived':
      return t('Account archived');
    case 'reported':
      return t('Account reported');
    case 'report_cleared':
      return t('Report cleared');
    case 'removed_from_team':
      return t('Removed from team by an admin');
    default:
      return type;
  }
}

export function attemptLabel(status) {
  return status === 'passed' ? t('Passed') : status === 'failed' ? t('Failed') : t('Running');
}
