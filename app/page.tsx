import { redirect } from 'next/navigation';

// Não há página pública na raiz: o comprador chega pelo link da live e a agência pelo /admin.
export default function Home() {
  redirect('/admin');
}
