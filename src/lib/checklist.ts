// Hidrata as checkboxes de uma checklist com o estado salvo localmente
// e persiste as mudanças. Também atualiza a barra de progresso.
import { getCheck, setCheck } from './store';

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
  const boxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

  boxes.forEach((box) => {
    const li = box.closest('li');
    const text = (li?.textContent || '').trim();
    const key = `${slug}::${hash(text)}`;

    box.disabled = false; // GFM renderiza como disabled por padrão
    getCheck(key).then((v) => {
      if (v !== undefined) {
        box.checked = v;
        li?.classList.toggle('done', v);
        updateProgress(root);
      }
    });

    box.addEventListener('change', () => {
      li?.classList.toggle('done', box.checked);
      setCheck(key, box.checked);
      updateProgress(root);
    });
  });

  updateProgress(root);
}
