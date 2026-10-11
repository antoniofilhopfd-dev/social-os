import type { Metadata } from 'next';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { ConfirmDemo } from './confirm-demo';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';

export const metadata: Metadata = { title: 'Design system' };

const colors = [
  ['Azul principal', '--color-primary', '#243B80'],
  ['Violeta', '--color-accent', '#7557D9'],
  ['Azul escuro', '--color-navy', '#172554'],
  ['Fundo', '--color-bg', '#F5F7FC'],
  ['Superfície', '--color-surface', '#FFFFFF'],
  ['Sucesso', '--color-success', '#0F6B3E'],
  ['Atenção', '--color-warning', '#8A5300'],
  ['Erro', '--color-danger', '#B42318'],
] as const;

export default function DesignSystemPage() {
  return (
    <div className="container">
      <h1>Design system</h1>
      <p className="muted">
        Página interna de conferência visual da Etapa 01. Os dados abaixo são apenas exemplos de
        componentes, não dados reais.
      </p>

      <section className="section" aria-labelledby="cores">
        <h2 id="cores">Cores</h2>
        <div className="grid">
          {colors.map(([name, token, hex]) => (
            <div key={token} className="swatch">
              <div
                className="swatch-color"
                style={{
                  background: `var(${token})`,
                  borderBottom: '1px solid var(--color-border)',
                }}
              />
              <div className="swatch-info">
                <strong>{name}</strong>
                <code>{hex}</code>
                <code>{token}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="tipografia">
        <h2 id="tipografia">Tipografia (Inter)</h2>
        <div className="stack">
          <h1 style={{ margin: 0 }}>Título 1: Calendário editorial</h1>
          <h2 style={{ margin: 0 }}>Título 2: Aprovações pendentes</h2>
          <h3 style={{ margin: 0 }}>Título 3: Conteúdos da semana</h3>
          <p style={{ margin: 0 }}>Texto padrão para formulários, tabelas e descrições.</p>
          <p className="muted" style={{ margin: 0 }}>
            Texto secundário para ajuda e metadados.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="botoes">
        <h2 id="botoes">Botões e confirmação</h2>
        <div className="row">
          <Button>Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="danger">Perigo</Button>
          <Button disabled>Desabilitado</Button>
          <ConfirmDemo />
        </div>
      </section>

      <section className="section" aria-labelledby="formularios">
        <h2 id="formularios">Formulário</h2>
        <div className="stack" style={{ maxWidth: 420 }}>
          <Field
            id="ex-titulo"
            label="Título interno"
            hint="Visível apenas para a equipe."
            defaultValue="Post de lançamento"
          />
          <Field
            id="ex-data"
            label="Data prevista"
            type="date"
            error="Informe uma data válida."
            defaultValue=""
          />
        </div>
      </section>

      <section className="section" aria-labelledby="status">
        <h2 id="status">Status e avisos</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <Badge>Rascunho</Badge>
          <Badge tone="info">Em produção</Badge>
          <Badge tone="warning">Aguardando cliente</Badge>
          <Badge tone="success">Aprovado</Badge>
          <Badge tone="danger">Ajustes solicitados</Badge>
        </div>
        <div className="stack">
          <Alert tone="info">Informação neutra para o usuário.</Alert>
          <Alert tone="success">Alterações salvas.</Alert>
          <Alert tone="warning">Prazo próximo do vencimento.</Alert>
          <Alert tone="danger">Não foi possível concluir a ação.</Alert>
        </div>
      </section>

      <section className="section" aria-labelledby="tabela">
        <h2 id="tabela">Tabela</h2>
        <div className="table-wrap" role="region" aria-label="Tabela de exemplo" tabIndex={0}>
          <table className="table">
            <caption className="muted" style={{ textAlign: 'left', padding: '8px 14px' }}>
              Exemplo de estrutura (dados ilustrativos)
            </caption>
            <thead>
              <tr>
                <th scope="col">Conteúdo</th>
                <th scope="col">Rede</th>
                <th scope="col">Status</th>
                <th scope="col">Prazo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Exemplo A</td>
                <td>Instagram</td>
                <td>
                  <Badge tone="info">Em produção</Badge>
                </td>
                <td>12/11</td>
              </tr>
              <tr>
                <td>Exemplo B</td>
                <td>LinkedIn</td>
                <td>
                  <Badge tone="success">Aprovado</Badge>
                </td>
                <td>14/11</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="estados">
        <h2 id="estados">Estados: carregando, vazio e erro</h2>
        <div className="stack">
          <LoadingState />
          <EmptyState
            title="Nenhuma solicitação ainda"
            description="Quando uma demanda chegar, ela aparecerá aqui."
          />
          <ErrorState
            title="Não foi possível carregar"
            description="Verifique sua conexão e tente novamente."
            onRetry={undefined}
          />
        </div>
      </section>
    </div>
  );
}
