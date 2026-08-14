// Hidrata a wishlist de Gunpla: toggle "comprado", preço pago e diferença
// vs. a projeção inicial. Tudo salvo localmente (IndexedDB).
import { getCheck, setCheck, getPrice, setPrice, deletePrice } from './store';
import { formatBRL, yenToBRL } from './gunpla';

function projectedBRL(card: HTMLElement): number {
  return yenToBRL(Number(card.dataset.yen || 0));
}

// Diferença por kit: pago - projeção. Negativo = abaixo (economia).
function renderCardDiff(card: HTMLElement) {
  const diffEl = card.querySelector<HTMLElement>('[data-paid-diff]');
  const input = card.querySelector<HTMLInputElement>('input[data-paid]');
  if (!diffEl || !input) return;

  const paid = parseFloat(input.value.replace(',', '.'));
  if (!Number.isFinite(paid) || paid <= 0) {
    diffEl.textContent = '';
    diffEl.className = 'paid-diff';
    return;
  }
  const diff = paid - projectedBRL(card); // + acima, - abaixo
  const abs = formatBRL(Math.abs(diff));
  if (Math.abs(diff) < 0.005) {
    diffEl.textContent = 'no alvo da projeção';
    diffEl.className = 'paid-diff on-target';
  } else if (diff < 0) {
    diffEl.textContent = `${abs} abaixo da projeção`;
    diffEl.className = 'paid-diff below';
  } else {
    diffEl.textContent = `${abs} acima da projeção`;
    diffEl.className = 'paid-diff above';
  }
}

function updateTotals(root: HTMLElement) {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-kit]'));
  const totalYen = cards.reduce((s, c) => s + Number(c.dataset.yen || 0), 0);

  let boughtCount = 0;
  let projBoughtBRL = 0; // projeção dos comprados
  let remainingYen = 0;
  let paidTotalBRL = 0; // soma do que foi realmente pago
  let projForPaidBRL = 0; // projeção só dos que têm preço pago (p/ comparar 1:1)

  for (const card of cards) {
    const yen = Number(card.dataset.yen || 0);
    const bought = card.classList.contains('bought');
    if (bought) {
      boughtCount++;
      projBoughtBRL += yenToBRL(yen);
      const input = card.querySelector<HTMLInputElement>('input[data-paid]');
      const paid = parseFloat((input?.value || '').replace(',', '.'));
      if (Number.isFinite(paid) && paid > 0) {
        paidTotalBRL += paid;
        projForPaidBRL += yenToBRL(yen);
      }
    } else {
      remainingYen += yen;
    }
  }

  const set = (sel: string, txt: string, cls?: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return;
    el.textContent = txt;
    if (cls !== undefined) el.className = cls;
  };

  set('[data-total-count]', `${boughtCount}/${cards.length} comprados`);
  set('[data-total-proj]', formatBRL(projBoughtBRL));
  set('[data-total-paid]', paidTotalBRL > 0 ? formatBRL(paidTotalBRL) : '—');
  set('[data-total-remaining]', formatBRL(yenToBRL(remainingYen)));
  set('[data-total-all]', formatBRL(yenToBRL(totalYen)));

  // diferença agregada (só sobre os que têm preço pago)
  const diff = paidTotalBRL - projForPaidBRL;
  if (paidTotalBRL <= 0) {
    set('[data-total-diff]', '—', 'total-strong');
  } else if (Math.abs(diff) < 0.005) {
    set('[data-total-diff]', 'no alvo', 'total-strong on-target');
  } else if (diff < 0) {
    set('[data-total-diff]', `${formatBRL(Math.abs(diff))} abaixo`, 'total-strong below');
  } else {
    set('[data-total-diff]', `${formatBRL(diff)} acima`, 'total-strong above');
  }
}

// Lê o estado salvo (IndexedDB) e joga na tela. Chamado na carga e de novo
// quando chega mudança de outro dispositivo pelo sync.
async function hydrate(root: HTMLElement) {
  const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[data-bought]'));
  await Promise.all(
    boxes.map(async (box) => {
      const card = box.closest<HTMLElement>('[data-kit]');
      const v = await getCheck(`gunpla-bought::${box.getAttribute('data-bought') || ''}`);
      box.checked = Boolean(v);
      card?.classList.toggle('bought', box.checked);
    }),
  );

  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[data-paid]'));
  await Promise.all(
    inputs.map(async (input) => {
      const card = input.closest<HTMLElement>('[data-kit]');
      // não pisa no que o usuário está digitando agora
      if (document.activeElement === input) return;
      const v = await getPrice(`gunpla-paid::${input.getAttribute('data-paid') || ''}`);
      input.value = typeof v === 'number' && v > 0 ? String(v) : '';
      if (card) renderCardDiff(card);
    }),
  );

  updateTotals(root);
}

export function initGunplaWishlist() {
  const root = document.querySelector<HTMLElement>('[data-wishlist]');
  if (!root) return;

  // toggle "comprado"
  root.querySelectorAll<HTMLInputElement>('input[data-bought]').forEach((box) => {
    const card = box.closest<HTMLElement>('[data-kit]');
    const key = `gunpla-bought::${box.getAttribute('data-bought') || ''}`;

    box.addEventListener('change', () => {
      card?.classList.toggle('bought', box.checked);
      setCheck(key, box.checked);
      updateTotals(root);
    });
  });

  // preço pago (R$)
  root.querySelectorAll<HTMLInputElement>('input[data-paid]').forEach((input) => {
    const card = input.closest<HTMLElement>('[data-kit]');
    const key = `gunpla-paid::${input.getAttribute('data-paid') || ''}`;

    input.addEventListener('input', () => {
      const paid = parseFloat(input.value.replace(',', '.'));
      if (Number.isFinite(paid) && paid > 0) setPrice(key, paid);
      else deletePrice(key);
      if (card) renderCardDiff(card);
      updateTotals(root);
    });
  });

  hydrate(root);
  window.addEventListener('agenda:remote-sync', () => hydrate(root));
}
