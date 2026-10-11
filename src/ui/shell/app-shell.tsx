'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { LogoutButton } from '@/ui/logout-button';
import type { NavGroup } from './nav-config';
import { OrgSwitcher } from './org-switcher';
import { SearchDialog } from './search-dialog';
import { SideNav } from './side-nav';

export function AppShell(props: {
  userName: string;
  orgs: { id: string; name: string }[];
  activeOrgId: string;
  groups: NavGroup[];
  unread: number;
  children: React.ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  // Fecha a gaveta ao navegar.
  useEffect(() => drawer.current?.close(), [path]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-side">Social Media OS</div>
        <SideNav groups={props.groups} label="Principal" unread={props.unread} />
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <button
            type="button"
            className="icon-btn hamburger"
            aria-label="Abrir menu"
            onClick={() => drawer.current?.showModal()}
          >
            Menu
          </button>
          <SearchDialog />
          <span className="spacer" />
          <Link
            href="/notificacoes"
            className="icon-btn"
            aria-label={
              props.unread > 0 ? `Notificações, ${props.unread} não lidas` : 'Notificações'
            }
          >
            <span aria-hidden="true">Avisos</span>
            {props.unread > 0 && (
              <span className="bell-badge" aria-hidden="true">
                {props.unread}
              </span>
            )}
          </Link>
          <OrgSwitcher orgs={props.orgs} activeId={props.activeOrgId} />
          <span className="user-name hide-mobile" title={props.userName}>
            {props.userName}
          </span>
          <LogoutButton />
        </header>
        <main id="conteudo" className="content">
          {props.children}
        </main>
      </div>

      <dialog
        ref={drawer}
        className="drawer"
        aria-label="Menu"
        onClick={(e) => e.target === drawer.current && drawer.current?.close()}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="brand-side" style={{ padding: 0 }}>
            Social Media OS
          </span>
          <button
            type="button"
            className="icon-btn drawer-close"
            onClick={() => drawer.current?.close()}
          >
            Fechar
          </button>
        </div>
        <SideNav groups={props.groups} label="Menu móvel" unread={props.unread} />
      </dialog>
    </div>
  );
}
