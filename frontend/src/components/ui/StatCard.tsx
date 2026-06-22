import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; label: string };
  color?: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'accent';
  loading?: boolean;
}

const colorMap = {
  primary: { bg: 'var(--color-primary-muted)', fg: 'var(--color-primary)' },
  success: { bg: 'var(--color-success-muted)', fg: 'var(--color-success)' },
  danger: { bg: 'var(--color-danger-muted)', fg: 'var(--color-danger)' },
  warning: { bg: 'var(--color-warning-muted)', fg: 'var(--color-warning)' },
  info: { bg: 'var(--color-info-muted)', fg: 'var(--color-info)' },
  accent: { bg: 'var(--color-accent-muted)', fg: 'var(--color-accent)' },
};

export function StatCard({ title, value, icon, trend, color = 'primary', loading }: StatCardProps) {
  const colors = colorMap[color];

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
          <div className="skeleton w-10 h-10 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card p-5 group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className="text-xs font-semibold"
                style={{ color: trend.value >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
              >
                {trend.value >= 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {trend.label}
              </span>
            </div>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}
