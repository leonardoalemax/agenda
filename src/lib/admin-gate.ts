// Liga/desliga os controles marcados `data-admin-only` conforme o status de
// login. Todo controle desses já nasce `disabled` no HTML (ver
// src/styles/global.css) — isto só reflete o estado real assim que o
// Firebase resolve.
//
// Chame de novo depois de criar HTML dinamicamente (ex.: um modal montado
// em runtime) — o disabled inicial só existe no HTML que o servidor rendeu.
import { currentAdminStatus } from './auth-client';

type Gatable = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function applyAdminGate(root: ParentNode = document): void {
  const isAdmin = currentAdminStatus().isAdmin;
  root.querySelectorAll<Gatable>('[data-admin-only]').forEach((el) => {
    el.disabled = !isAdmin;
  });
}
