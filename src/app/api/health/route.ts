import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { publicRoute } from '@/core/http';

/** Verificação de saúde para monitoramento: confirma que o app responde e que o banco está acessível. Sem detalhes internos. */
export const GET = publicRoute(async () => {
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});
