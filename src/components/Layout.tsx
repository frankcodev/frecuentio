import { NavLink, Outlet } from 'react-router-dom';
import { CreditCard, LayoutDashboard, LogOut, ScanLine, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { APP_NAME } from '../lib/config';

const LINKS = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard },
  { to: '/escanear', label: 'Escanear', icon: ScanLine },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/tarjeta', label: 'Tarjeta', icon: CreditCard },
];

export default function Layout() {
  const { business } = useAuth();
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
              {APP_NAME.slice(0, 1)}
            </span>
            <span className="font-semibold">{business?.name || APP_NAME}</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-100'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom tab bar on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-gray-100 bg-white md:hidden">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-primary' : 'text-gray-500'}`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
