import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// A CSP usa nonce por requisição, então as páginas precisam ser renderizadas dinamicamente.
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Social Media OS', template: '%s · Social Media OS' },
  description: 'Gestão de operações de social media orgânico.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#243b80' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        <main id="conteudo">{children}</main>
      </body>
    </html>
  );
}
