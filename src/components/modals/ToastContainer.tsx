import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const ToastContainer: React.FC = () => {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item is-${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={15} color="var(--success)" />
          ) : toast.type === 'error' ? (
            <AlertCircle size={15} color="var(--danger)" />
          ) : (
            <Info size={15} color="var(--primary)" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: 2, marginLeft: 4 }}
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
};
