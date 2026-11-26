import { ReactNode } from 'react';
import { APP_NAME } from '../lib/config';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white">
            {APP_NAME.slice(0, 1)}
          </span>
          <h1 className="text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-soft">{children}</div>
      </div>
    </div>
  );
}
