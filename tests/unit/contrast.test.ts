import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/ui/contrast';

const AA = 4.5;
// Pares texto/fundo realmente usados pelo design system (src/app/globals.css).
const pairs: [string, string, string][] = [
  ['texto sobre fundo', '#172033', '#f5f7fc'],
  ['texto sobre superfície', '#172033', '#ffffff'],
  ['texto secundário sobre superfície', '#4b5675', '#ffffff'],
  ['texto secundário sobre fundo', '#4b5675', '#f5f7fc'],
  ['botão primário', '#ffffff', '#243b80'],
  ['botão primário (hover)', '#ffffff', '#1d3070'],
  ['botão secundário', '#243b80', '#ffffff'],
  ['botão perigo', '#ffffff', '#b42318'],
  ['título (azul escuro) sobre fundo', '#172554', '#f5f7fc'],
  ['link sobre fundo', '#243b80', '#f5f7fc'],
  ['badge neutro', '#2d3752', '#e9ecf5'],
  ['badge info', '#243b80', '#e8ecf8'],
  ['badge sucesso', '#0f6b3e', '#e3f4ea'],
  ['badge atenção', '#8a5300', '#fdf0d9'],
  ['badge erro', '#b42318', '#fdeceb'],
  ['alerta info', '#172554', '#e8ecf8'],
  ['alerta sucesso', '#0b4d2c', '#e3f4ea'],
  ['alerta atenção', '#5e3800', '#fdf0d9'],
  ['alerta erro', '#8a1a11', '#fdeceb'],
  ['cabeçalho de tabela', '#172554', '#eef1f9'],
];

describe('contraste WCAG AA (texto normal ≥ 4,5:1)', () => {
  it.each(pairs)('%s', (_nome, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('calcula referência conhecida (preto sobre branco = 21)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
});
