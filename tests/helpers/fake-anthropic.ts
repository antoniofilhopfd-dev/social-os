import { createServer, type IncomingMessage, type Server } from 'node:http';

export interface Recorded {
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

/**
 * Servidor HTTP local usado SOMENTE em testes para observar o que o programa envia ao serviço de IA
 * (cabeçalhos, corpo, privacidade do contexto). Não faz parte do produto e não simula uma resposta de IA em nenhuma tela.
 */
export async function startFakeAnthropic(
  respond: (
    req: Recorded,
  ) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>,
  fixedPort = 0,
) {
  const calls: Recorded[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      const rec: Recorded = { headers: req.headers, body: raw ? JSON.parse(raw) : {} };
      calls.push(rec);
      const out = await respond(rec);
      res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(fixedPort, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export const okMessage = (json: unknown, extra: Record<string, unknown> = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }],
  usage: { input_tokens: 321, output_tokens: 87 },
  ...extra,
});
