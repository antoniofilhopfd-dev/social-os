'use client';
import { useId, useRef } from 'react';
import { Button } from './components';

/** Confirmação de ação destrutiva usando <dialog> nativo (foco e Esc tratados pelo navegador). */
export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <Button variant="danger" onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </Button>
      <dialog ref={ref} className="dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <p className="muted">{description}</p>
        <div className="row">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              ref.current?.close();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
