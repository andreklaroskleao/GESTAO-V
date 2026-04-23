export const ROLES = ['Administrador', 'Gerente', 'Operador'];

export const ACCESS_LEVELS = ['master', 'admin', 'manager', 'operator'];

export const AREAS = [
  'Geral',
  'Vendas',
  'Estoque',
  'Financeiro',
  'Clientes',
  'Fornecedores',
  'Compras',
  'Entregas',
  'Relatórios',
  'Usuários',
  'Configurações'
];

export const paymentMethods = [
  'Dinheiro',
  'Pix',
  'Cartão de Débito',
  'Cartão de Crédito',
  'Boleto',
  'Transferência'
];

export const deliveryStatuses = [
  'Pendente',
  'Em preparo',
  'Saiu para entrega',
  'Entregue',
  'Cancelada'
];

const MODULE_OPTIONS = [
  'dashboard',
  'sales',
  'products',
  'reports',
  'deliveries',
  'clients',
  'suppliers',
  'purchases',
  'payables',
  'users',
  'settings'
];

export function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value ?? '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDate(value) {
  if (!value) return '-';

  if (value?.toDate && typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('pt-BR');
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR');
  }

  return String(value);
}

export function formatDateTime(value) {
  if (!value) return '-';

  if (value?.toDate && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString('pt-BR');
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('pt-BR');
  }

  return String(value);
}

export function timestampFromDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function canImportBackup(user) {
  return String(user?.accessLevel || '') === 'master';
}

export function isAdmin(user) {
  const level = String(user?.accessLevel || '');
  return user?.active !== false && user?.deleted !== true && (level === 'master' || level === 'admin');
}

export function canAssignAccessLevel(currentUser, targetAccessLevel) {
  const actorLevel = String(currentUser?.accessLevel || '');
  const targetLevel = String(targetAccessLevel || '');

  if (actorLevel === 'master') {
    return true;
  }

  if (actorLevel === 'admin') {
    return ['manager', 'operator'].includes(targetLevel);
  }

  return false;
}

export function canEditTargetUser(currentUser, targetUser) {
  const actorLevel = String(currentUser?.accessLevel || '');
  const targetLevel = String(targetUser?.accessLevel || '');

  if (actorLevel === 'master') {
    return true;
  }

  if (actorLevel === 'admin') {
    return targetLevel !== 'master' && targetLevel !== 'admin';
  }

  return false;
}

export function canInactivateTargetUser(currentUser, targetUser) {
  return canEditTargetUser(currentUser, targetUser);
}

export function ensurePermissionsByRole(role, accessLevel) {
  const normalizedLevel = String(accessLevel || 'operator');
  const normalizedRole = String(role || '').toLowerCase();

  if (normalizedLevel === 'master') {
    return [...MODULE_OPTIONS];
  }

  if (normalizedLevel === 'admin') {
    return [
      'dashboard',
      'sales',
      'products',
      'reports',
      'deliveries',
      'clients',
      'suppliers',
      'purchases',
      'payables',
      'users',
      'settings'
    ];
  }

  if (normalizedLevel === 'manager') {
    return [
      'dashboard',
      'sales',
      'products',
      'reports',
      'deliveries',
      'clients',
      'suppliers',
      'purchases',
      'payables',
      'settings'
    ];
  }

  if (normalizedRole.includes('finance')) {
    return ['dashboard', 'reports', 'clients', 'payables'];
  }

  if (normalizedRole.includes('estoque')) {
    return ['dashboard', 'products', 'suppliers', 'purchases'];
  }

  return ['dashboard', 'sales', 'products', 'deliveries', 'clients'];
}

export function hasPermission(user, area) {
  if (!user || user.active === false || user.deleted === true) {
    return false;
  }

  if (String(user.accessLevel || '') === 'master') {
    return true;
  }

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes(area);
}