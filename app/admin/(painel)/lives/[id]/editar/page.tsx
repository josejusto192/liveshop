import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/auth';
import { liveForEdit } from '@/lib/lives-admin';
import { LiveForm } from '../../LiveForm';
import { brandsWithProducts, localParts } from '../../data';

export default async function EditarLivePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('lives:write');
  const { id } = await params;
  const [data, { brands, productsByBrand }] = await Promise.all([liveForEdit(id), brandsWithProducts()]);
  if (!data) notFound();
  const { live, items } = data;
  const { date, time } = localParts(live.startsAt);
  return (
    <LiveForm
      liveId={live.id}
      status={live.status}
      slug={live.slug}
      appUrl={process.env.APP_URL || 'http://localhost:3000'}
      brands={brands}
      productsByBrand={productsByBrand}
      initial={{
        name: live.name,
        brandId: live.brandId,
        date,
        time,
        format: live.format,
        mode: live.mode,
        videoDelayS: live.videoDelayS,
        showTimer: live.showTimer,
        showActivity: live.showActivity,
        lineup: items.map((i) => ({ productId: i.productId, min: Math.round(i.durationS / 60) })),
      }}
    />
  );
}
