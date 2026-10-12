import { apiLogin, fx } from './helpers';

/** Cria um conteúdo, leva-o à aprovação do cliente e o aprova (tudo pela API real). */
export async function approvedContent(
  title: string,
  opts: { profile?: boolean; date?: string } = {},
) {
  const f = fx();
  const owner = await apiLogin('dona.a@example.test');
  const c = await (
    await owner.post('/api/contents', {
      data: {
        clientId: f.clientA1,
        title,
        format: 'static_post',
        ...(opts.profile === false ? {} : { brandId: f.brandA, socialProfileId: f.profileA }),
      },
    })
  ).json();
  const body = {
    caption: `Legenda de ${title}`,
    hook: '',
    script: '',
    cta: 'Saiba mais',
    hashtags: '#social',
    coverText: '',
    altText: 'Imagem ilustrativa',
    productionNotes: '',
    publishNotes: 'Marcar o parceiro nos comentários.',
    references: '',
    slides: [],
    checklist: [],
  };
  await owner.put(`/api/contents/${c.id}/editor/draft`, { data: { baseRevision: 0, body } });
  await owner.post(`/api/contents/${c.id}/status`, { data: { to: 'in_production' } });
  await owner.post(`/api/contents/${c.id}/status`, { data: { to: 'internal_review' } });
  const ap = await (await owner.post(`/api/contents/${c.id}/approval`, { data: {} })).json();
  const client = await apiLogin('cliente.a1@example.test');
  await client.post(`/api/approvals/${ap.id}/decision`, { data: { decision: 'approved' } });
  await client.dispose();
  return { contentId: c.id as string, owner };
}
