import { getAdmin } from './auth';
import { apiError } from './api';
import { can, type Permission } from './permissions';
import type { AdminUser } from './db/schema';

/** Para route handlers do admin: devolve o usuário ou uma resposta 401/403 pronta. */
export async function requireAdminApi(permission: Permission): Promise<AdminUser | Response> {
  const admin = await getAdmin();
  if (!admin) return apiError('unauthorized', 'Faça login para continuar.', 401);
  if (!can(admin.role, permission)) return apiError('forbidden', 'Seu papel não tem acesso a esta ação.', 403);
  return admin;
}
