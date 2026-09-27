import { requireAdminPage } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { LiveForm } from '../LiveForm';
import { brandsWithProducts, localParts } from '../data';

export default async function NovaLivePage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  await requireAdminPage('lives:write');
  const [{ brands, productsByBrand }, settings, { marca }] = await Promise.all([brandsWithProducts(), getSettings(), searchParams]);
  const tomorrow = new Date(Date.now() + 86400_000);
  const { date } = localParts(tomorrow);
  const brandId = brands.find((b) => b.id === marca)?.id ?? brands[0]?.id ?? '';
  return (
    <LiveForm
      liveId={null}
      status={null}
      slug={null}
      appUrl={process.env.APP_URL || 'http://localhost:3000'}
      brands={brands}
      productsByBrand={productsByBrand}
      initial={{
        name: '',
        brandId,
        date,
        time: '10:00',
        format: 'horizontal',
        mode: 'auto',
        videoDelayS: settings.defaultVideoDelayS,
        showTimer: true,
        showActivity: true,
        lineup: [],
      }}
    />
  );
}
