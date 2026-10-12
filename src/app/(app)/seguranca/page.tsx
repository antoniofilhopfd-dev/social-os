import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { twoFactorStatus } from '@/modules/auth/twofactor';
import { TwoFactorPanel } from './two-factor-panel';

export const metadata: Metadata = { title: 'Segurança da conta' };

export default async function SecurityPage() {
  const { ctx } = await requireAuthPage();
  const st = await twoFactorStatus(getDb(), ctx);
  return (
    <>
      <div className="page-head">
        <h1>Segurança da conta</h1>
      </div>
      <TwoFactorPanel
        enabled={st.enabled}
        available={st.available}
        remaining={st.recoveryCodesRemaining}
      />
      <section className="section stack" aria-labelledby="sg-sessoes">
        <h2 id="sg-sessoes">Sessões</h2>
        <p>
          <Link href="/minhas-sessoes">Ver e encerrar as sessões ativas</Link>
        </p>
      </section>
    </>
  );
}
