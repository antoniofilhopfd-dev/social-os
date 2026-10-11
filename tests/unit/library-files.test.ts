import { describe, expect, it } from 'vitest';
import {
  detectFile,
  extensionOf,
  normalizeTag,
  sanitizeFileName,
  storageKeyFor,
} from '@/modules/library/files';
import { LocalStorageDriver } from '@/integrations/storage/local';

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(32),
]);
const mov = Buffer.concat([
  Buffer.from([0, 0, 0, 0x14]),
  Buffer.from('ftypqt  '),
  Buffer.alloc(32),
]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n');

describe('detecção por conteúdo', () => {
  it('reconhece tipos aceitos pela assinatura, ignorando o nome', () => {
    expect(detectFile(png, 'foto.png')).toMatchObject({ mime: 'image/png', kind: 'image' });
    expect(detectFile(png, 'nome-enganoso.pdf')).toMatchObject({ mime: 'image/png', ext: 'png' }); // vale o conteúdo
    expect(detectFile(jpg, 'a.JPG')).toMatchObject({ mime: 'image/jpeg', ext: 'jpg' });
    expect(detectFile(mp4, 'v.mp4')).toMatchObject({ mime: 'video/mp4', kind: 'video' });
    expect(detectFile(mov, 'v.mov')).toMatchObject({ mime: 'video/quicktime' });
    expect(detectFile(pdf, 'doc.pdf')).toMatchObject({ mime: 'application/pdf', kind: 'document' });
    expect(detectFile(Buffer.from('RIFF\0\0\0\0WEBPVP8 '), 'a.webp')).toMatchObject({
      mime: 'image/webp',
    });
    expect(detectFile(Buffer.from('GIF89a\0\0\0\0'), 'a.gif')).toMatchObject({ mime: 'image/gif' });
  });
  it('aceita texto UTF-8 simples e Office reais; recusa zip genérico', () => {
    expect(detectFile(Buffer.from('nome;idade\nAna;30\n'), 'dados.csv')).toMatchObject({
      mime: 'text/csv',
      kind: 'document',
    });
    expect(detectFile(Buffer.from('# Título\ntexto'), 'notas.md')).toMatchObject({
      mime: 'text/markdown',
    });
    const docx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('[Content_Types].xml word/document.xml'),
    ]);
    expect(detectFile(docx, 'a.docx')).toMatchObject({ ext: 'docx' });
    expect(detectFile(docx, 'a.zip')).toBeNull();
    expect(
      detectFile(
        Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]),
        'a.docx',
      ),
    ).toBeNull(); // sem estrutura de docx
  });
  it('recusa SVG, HTML, scripts, executáveis e polyglots', () => {
    expect(
      detectFile(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
        'x.svg',
      ),
    ).toBeNull();
    expect(detectFile(Buffer.from('<html><script>alert(1)</script></html>'), 'x.html')).toBeNull();
    expect(detectFile(Buffer.from('<html><script>alert(1)</script></html>'), 'x.txt')).toBeNull(); // texto que parece HTML
    expect(detectFile(Buffer.from('#!/bin/sh\nrm -rf /'), 'x.txt')).toBeNull();
    expect(detectFile(Buffer.from('MZ\x90\0\x03\0\0\0'), 'setup.exe')).toBeNull();
    expect(detectFile(png, 'shell.php')).toBeNull(); // PNG válido com extensão perigosa
    expect(detectFile(png, 'imagem.svg')).toBeNull();
    expect(detectFile(Buffer.from([0, 1, 2, 3, 4, 5]), 'x.bin')).toBeNull();
    expect(detectFile(Buffer.alloc(2), 'x.png')).toBeNull();
    expect(
      detectFile(
        Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]),
        'x.heic',
      ),
    ).toBeNull();
    expect(detectFile(Buffer.from('texto\0binario'), 'x.txt')).toBeNull(); // NUL em texto
  });
});

describe('nomes, tags e chaves de armazenamento', () => {
  it('sanitiza nomes: caminhos, controle, bidi, pontos e tamanho', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\a\\foto final.png')).toBe('foto final.png');
    expect(sanitizeFileName('a<b>:"|?*.png')).toBe('a_b______.png');
    expect(sanitizeFileName('foto\u202egpj.exe')).not.toContain('\u202e');
    expect(sanitizeFileName('...')).toBe('arquivo');
    expect(sanitizeFileName('')).toBe('arquivo');
    expect(sanitizeFileName(`${'a'.repeat(400)}.png`).length).toBeLessThanOrEqual(150);
    expect(sanitizeFileName(`${'a'.repeat(400)}.png`).endsWith('.png')).toBe(true);
    expect(sanitizeFileName('  .oculto  ')).toBe('oculto');
    expect(extensionOf('a.tar.gz')).toBe('gz');
    expect(extensionOf('semext')).toBe('');
  });
  it('normaliza tags', () => {
    expect(normalizeTag('  #Verão 2031 ')).toBe('verão-2031');
    expect(normalizeTag('a')).toBeNull();
    expect(normalizeTag('<script>')).toBe('script');
    expect(normalizeTag('x'.repeat(100))!.length).toBe(40);
  });
  it('a chave de armazenamento é aceita pelo driver e nunca contém entrada do usuário', async () => {
    const key = storageKeyFor(
      '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      '01HYYYYYYYYYYYYYYYYYYYYYYY',
      '01HXXXXXXXXXXXXXXXXXXXXXXX',
      'png',
    );
    expect(key).toBe(
      'orgs/01HZZZZZZZZZZZZZZZZZZZZZZZ/clients/01HYYYYYYYYYYYYYYYYYYYYYYY/01HXXXXXXXXXXXXXXXXXXXXXXX.png',
    );
    const d = new LocalStorageDriver('/tmp/claude-0/unused');
    await expect(d.exists(key)).resolves.toBe(false); // chave válida (não lança)
  });
});
