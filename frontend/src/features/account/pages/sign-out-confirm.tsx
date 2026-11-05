import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { LogoutIcon } from '@/components/menu/menu-icons';
import { firstName, signOut, useSession } from '@/features/account/session/demo-session';

/**
 * « Déconnexion » with a confirmation: the trigger keeps its own look (menu entry, side link),
 * the dialog asks once before closing the session, then returns to the homepage.
 */
export function SignOutConfirm({ trigger, onSignedOut }: { trigger: ReactNode; onSignedOut?: () => void }) {
  const user = useSession();
  const navigate = useNavigate();
  // Leave the page first: on a « Votre espace » page, ending the session first would send the visitor to sign-in.
  const confirm = () => { onSignedOut?.(); void navigate({ to: '/' }).then(() => signOut()); };
  return <AlertDialog.Root>
    <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="tv-overlay so-confirm-overlay" />
      <AlertDialog.Content className="so-confirm">
        <span className="so-confirm-icon" aria-hidden="true"><LogoutIcon /></span>
        <AlertDialog.Title className="so-confirm-title">Se déconnecter ?</AlertDialog.Title>
        <AlertDialog.Description className="so-confirm-text">
          {user ? `Vous allez quitter le compte de ${firstName(user)} sur cet appareil.` : 'Vous allez quitter votre compte sur cet appareil.'} Votre liste et vos reprises vous attendront à votre retour.
        </AlertDialog.Description>
        <div className="so-confirm-actions">
          <AlertDialog.Cancel className="sp-btn is-ghost">Rester connecté</AlertDialog.Cancel>
          <AlertDialog.Action className="sp-btn" onClick={confirm}><LogoutIcon aria-hidden="true" />Se déconnecter</AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
