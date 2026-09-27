import type { AdminRole } from './db/schema';

// Quem pode o quê no painel (docs/06-api-e-eventos.md, coluna Papel).
const RULES = {
  'dashboard:read': ['owner', 'operator', 'finance'],
  'lives:write': ['owner', 'operator'],
  'products:write': ['owner', 'operator'],
  'orders:read': ['owner', 'operator', 'finance'],
  'orders:status': ['owner', 'finance'],
  'orders:export': ['owner', 'finance'],
  'companies:read': ['owner', 'operator', 'finance'],
  'brands:read': ['owner', 'operator', 'finance'],
  'brands:write': ['owner'],
  'settings:write': ['owner'],
  'team:write': ['owner'],
  'support:write': ['owner', 'operator', 'finance'],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof RULES;

export function can(role: AdminRole, permission: Permission): boolean {
  return (RULES[permission] as readonly AdminRole[]).includes(role);
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'Dona',
  operator: 'Central da live',
  finance: 'Só pedidos',
};

// Texto no card do usuário da sidebar.
export const ROLE_TITLE: Record<AdminRole, string> = {
  owner: 'Administradora',
  operator: 'Operação',
  finance: 'Financeiro',
};
