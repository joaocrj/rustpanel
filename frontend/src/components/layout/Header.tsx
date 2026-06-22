import { Search, Bell } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 glass-strong"
    >
      {/* Title */}
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        {searchOpen ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
            <input
              autoFocus
              className="input pl-9 w-64"
              placeholder="Buscar por ID, alias, hostname, IP..."
              onBlur={() => setSearchOpen(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg transition-colors cursor-pointer"
            style={{
              color: 'var(--color-text-muted)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
            title="Buscar (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        {/* Notifications */}
        <button
          className="p-2 rounded-lg transition-colors relative cursor-pointer"
          style={{
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
          title="Notificações"
        >
          <Bell className="w-4 h-4" />
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{ background: 'var(--color-primary)' }}
          />
        </button>
      </div>
    </header>
  );
}
