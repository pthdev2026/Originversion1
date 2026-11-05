import type { ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useRestoreFocus } from '@/lib/use-restore-focus';

/**
 * Shared confirmation window of « Votre espace » (remove from the list, sign out…): one question,
 * a safe choice and the action. Controlled, so a list can open it for the item being removed.
 */
export function ConfirmDialog({ open, onOpenChange, icon, title, text, cancelLabel = 'Annuler', confirmLabel, confirmIcon, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; icon?: ReactNode; title: string; text: string;
  cancelLabel?: string; confirmLabel: string; confirmIcon?: ReactNode; onConfirm: () => void;
}) {
  const restoreFocus = useRestoreFocus(open);
  return <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="tv-overlay so-confirm-overlay" />
      <AlertDialog.Content className="so-confirm" onCloseAutoFocus={restoreFocus}>
        {icon && <span className="so-confirm-icon" aria-hidden="true">{icon}</span>}
        <AlertDialog.Title className="so-confirm-title">{title}</AlertDialog.Title>
        <AlertDialog.Description className="so-confirm-text">{text}</AlertDialog.Description>
        <div className="so-confirm-actions">
          <AlertDialog.Cancel className="sp-btn is-ghost">{cancelLabel}</AlertDialog.Cancel>
          <AlertDialog.Action className="sp-btn" onClick={onConfirm}>{confirmIcon}{confirmLabel}</AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
