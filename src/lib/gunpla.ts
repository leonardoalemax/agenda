// Helpers puros de Gunpla (usados no build e no cliente).
// Cotação fixa combinada: 1000 ienes = R$ 35,00.
export const YEN_PER_BRL_UNIT = 1000;
export const BRL_PER_UNIT = 35;

export function yenToBRL(yen: number): number {
  return (yen / YEN_PER_BRL_UNIT) * BRL_PER_UNIT;
}

export function formatYen(yen: number): string {
  return '¥' + new Intl.NumberFormat('pt-BR').format(yen);
}

export function formatBRL(brl: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(brl);
}

// Remove o prefixo "GRADE 1/144 " do nome (já mostrado via badge/escala),
// evitando duplicação. Ex.: "HG 1/144 GN-001 Gundam Exia" -> "GN-001 Gundam Exia".
export function shortName(fullName: string): string {
  return fullName.replace(/^(HG|RG|EG|MG|PG|SD|FM|RE|MGSD)\s+\d\/\d+\s+/i, '');
}
