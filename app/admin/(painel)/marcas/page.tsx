import { requireAdminPage } from '@/lib/auth';
import { listBrandCards } from '@/lib/brands';
import { can } from '@/lib/permissions';
import { BrandsView } from './BrandsView';

export default async function MarcasPage() {
  const admin = await requireAdminPage('brands:read');
  const brands = await listBrandCards();
  return <BrandsView brands={brands} canWrite={can(admin.role, 'brands:write')} canCreateLive={can(admin.role, 'lives:write')} />;
}
