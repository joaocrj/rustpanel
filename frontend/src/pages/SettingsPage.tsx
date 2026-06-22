import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Shield, Save, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export function SettingsPage() {
  const { profile, hasRole } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', profile.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error saving profile:', err);
    }
    setSaving(false);
  };

  const roleLabel: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    operator: 'Operador',
  };

  return (
    <div>
      <Header title="Configurações" subtitle="Perfil e preferências" />

      <div className="p-6 space-y-6 max-w-2xl">
        {/* Profile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Perfil
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Email
              </label>
              <input
                className="input"
                value={profile?.email || ''}
                disabled
                style={{ opacity: 0.6 }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Nome
              </label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Perfil de Acesso
              </label>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {roleLabel[profile?.role || 'operator']}
                </span>
              </div>
            </div>

            <button
              className="btn btn-primary mt-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : saved ? (
                'Salvo ✓'
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* System Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-6"
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Informações do Sistema
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Versão</span>
              <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>1.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Frontend</span>
              <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>React + Vite + TypeScript</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Backend</span>
              <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)' }}>Supabase</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tema</span>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Dark Mode</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
