export const HELPER_EMAIL_STORAGE_KEY = "helper_email";

function normalizeEmail(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function getSavedHelperEmail() {
  try {
    return normalizeEmail(window.localStorage.getItem(HELPER_EMAIL_STORAGE_KEY) ?? "");
  } catch (_error) {
    return "";
  }
}

export function saveHelperEmail(helperEmail) {
  const normalizedEmail = normalizeEmail(helperEmail);

  if (!normalizedEmail) {
    return "";
  }

  window.localStorage.setItem(HELPER_EMAIL_STORAGE_KEY, normalizedEmail);
  return normalizedEmail;
}

export function clearSavedHelperEmail() {
  window.localStorage.removeItem(HELPER_EMAIL_STORAGE_KEY);
}

export function buildSchedulePageUrl(pathname, helperEmail) {
  if (!helperEmail) {
    return pathname;
  }

  const url = new URL(pathname, window.location.origin);
  url.searchParams.set("helper_email", helperEmail);

  return `${url.pathname}${url.search}`;
}
