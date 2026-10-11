'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from './nav-config';

/** O item ativo é o de maior correspondência de prefixo (evita marcar "Notificações" e "Preferências" juntos). */
function activeHref(groups: NavGroup[], path: string): string | null {
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const matches = hrefs.filter((h) =>
    h === '/' ? path === '/' : path === h || path.startsWith(h + '/'),
  );
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function SideNav({
  groups,
  label,
  unread,
}: {
  groups: NavGroup[];
  label: string;
  unread: number;
}) {
  const path = usePathname();
  const active = activeHref(groups, path);
  return (
    <nav aria-label={label}>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="nav-group-label">{g.label}</p>
          <div className="side-nav">
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={i.href === active ? 'page' : undefined}
              >
                {i.label}
                {i.href === '/notificacoes' && unread > 0 && (
                  <span className="bell-badge" aria-label={`${unread} não lidas`}>
                    {unread}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
