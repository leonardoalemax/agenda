// Hidrata as checkboxes de uma checklist com o estado salvo localmente
// e persiste as mudanças. Também atualiza a barra de progresso.
import { getCheck, setCheck } from './store';
import { applyAdminGate } from './admin-gate';

// hash estável a partir do texto do item (para a chave não depender da ordem)
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function updateProgress(root: HTMLElement) {
  const boxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  const total = boxes.length;
  if (!total) return;
  let done = 0;
  boxes.forEach((b) => b.checked && done++);
  const pct = Math.round((done / total) * 100);
  const bar = document.querySelector<HTMLElement>('[data-progress-bar]');
  const label = document.querySelector<HTMLElement>('[data-progress-label]');
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = `${done}/${total} — ${pct}%`;
}

export function initChecklists() {
  const root = document.querySelector<HTMLElement>('[data-checklist]');
  if (!root) return;
  const slug = root.getAttribute('data-slug') || location.pathname;
  const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

  const keyOf = (box: HTMLInputElement) =>
    `${slug}::${hash((box.closest('li')?.textContent || '').trim())}`;

  // Relê o estado salvo. Roda na carga e quando o sync traz dado de outro device.
  async function hydrate() {
    await Promise.all(
      boxes.map(async (box) => {
        const v = await getCheck(keyOf(box));
        if (v === undefined) return;
        box.checked = v;
        box.closest('li')?.classList.toggle('done', v);
      }),
    );
    updateProgress(root!);
  }

  boxes.forEach((box) => {
    // GFM renderiza como disabled por padrão; a gate decide se liga de
    // verdade (só admin) — ver src/lib/admin-gate.ts.
    box.setAttribute('data-admin-only', '');
    box.addEventListener('change', () => {
      box.closest('li')?.classList.toggle('done', box.checked);
      setCheck(keyOf(box), box.checked);
      updateProgress(root);
    });
  });

  applyAdminGate(root);
  hydrate();
  window.addEventListener('agenda:remote-sync', hydrate);
}
