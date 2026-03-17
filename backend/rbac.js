const VALID_ROLES = new Set(['user', 'operator', 'admin']);
const INTERNAL_ROLES = new Set(['operator', 'admin']);

function parseEnvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseUserIds(value) {
  return new Set(parseEnvList(value).map((item) => item.replace(/\s+/g, '')));
}

function parseUserEmails(value) {
  return new Set(parseEnvList(value).map((item) => item.toLowerCase()));
}

function getConfiguredRoleSets() {
  return {
    adminIds: parseUserIds(process.env.ADMIN_USER_IDS),
    adminEmails: parseUserEmails(process.env.ADMIN_USER_EMAILS),
    operatorIds: parseUserIds(process.env.OPERATOR_USER_IDS),
    operatorEmails: parseUserEmails(process.env.OPERATOR_USER_EMAILS)
  };
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  return VALID_ROLES.has(value) ? value : null;
}

export function resolveUserRole(user = {}) {
  const explicitRole = normalizeRole(user.role || user.tipo_role || user.user_role);
  if (explicitRole) {
    return explicitRole;
  }

  const configured = getConfiguredRoleSets();
  const userId = user.id !== undefined && user.id !== null ? String(user.id) : '';
  const userEmail = String(user.email || '').toLowerCase();

  if (
    (userId && configured.adminIds.has(userId)) ||
    (userEmail && configured.adminEmails.has(userEmail))
  ) {
    return 'admin';
  }

  if (
    (userId && configured.operatorIds.has(userId)) ||
    (userEmail && configured.operatorEmails.has(userEmail))
  ) {
    return 'operator';
  }

  return 'user';
}

export function hasRole(userRole, allowedRoles = []) {
  const normalized = normalizeRole(userRole) || 'user';
  const allowed = new Set(allowedRoles.map((role) => normalizeRole(role)).filter(Boolean));
  return allowed.has(normalized);
}

export function isInternalRole(userRole) {
  const normalized = normalizeRole(userRole) || 'user';
  return INTERNAL_ROLES.has(normalized);
}
