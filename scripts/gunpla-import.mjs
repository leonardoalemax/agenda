// Importa a wishlist de Gunpla:
//  - baixa as imagens dos kits para public/hobbies/gunpla/ (offline)
//  - gera 1 .md por kit em src/content/hobbies/gunpla/ (não sobrescreve
//    arquivos existentes, pra preservar conteúdo escrito depois)
// Uso: npm run gunpla:import
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = join(root, 'public', 'hobbies', 'gunpla');
const MD_DIR = join(root, 'src', 'content', 'hobbies', 'gunpla');

// slug, grade, code, fullName (nome canônico da tabela), priceYen, url
const KITS = [
  ['hg-gundam-exia', 'HG', 'GN-001', 'HG 1/144 GN-001 Gundam Exia', 1540, 'https://cdn2.gunpladb.net/HGMSG00144-01GN001GundamExia.jpg'],
  ['hg-mighty-strike-freedom', 'HG', 'ZGMF/A-262PD-P', 'HG 1/144 ZGMF/A-262PD-P Mighty Strike Freedom Gundam', 2970, 'https://cdn2.gunpladb.net/mighty-strike-freedom.jpg'],
  ['rg-rx-78-2-ver2', 'RG', 'RX-78-2', 'RG 1/144 RX-78-2 Gundam (Ver. 2.0)', 3850, 'https://cdn2.gunpladb.net/RG-RX782Gundam20.jpg'],
  ['rg-wing-gundam-zero', 'RG', 'XXXG-00W0', 'RG 1/144 XXXG-00W0 Wing Gundam Zero', 4620, 'https://cdn2.gunpladb.net/RG-XXXG00W0WingGundamZero.jpg'],
  ['rg-zeong', 'RG', 'MSN-02', 'RG 1/144 MSN-02 Zeong', 6050, 'https://cdn2.gunpladb.net/RG-34MSN02Zeong.jpg'],
  ['hg-rx-78-02-origin', 'HG', 'RX-78-02', 'HG 1/144 RX-78-02 Gundam (Gundam The Origin Ver.)', 2750, 'https://cdn2.gunpladb.net/HGHGGSEED-026RX7802GundamGundamTheOriginVer.jpg'],
  ['rg-sazabi', 'RG', 'MSN-04', 'RG 1/144 MSN-04 Sazabi', 5280, 'https://cdn2.gunpladb.net/RG-29MSN04Sazabi.jpg'],
  ['hg-moon-gundam', 'HG', 'AMS-123X-X', 'HG 1/144 AMS-123X-X Moon Gundam', 3000, 'https://cdn2.gunpladb.net/HGHGUC-215AMS123XXMoonGundam.jpg'],
  ['rg-hi-nu-gundam', 'RG', 'RX-93-ν2', 'RG 1/144 RX-93-ν2 Hi-ν Gundam', 4950, 'https://cdn2.gunpladb.net/RG-36RX93%CE%BD2Hi%CE%BDGundam.jpg'],
  ['hg-nu-gundam', 'HG', 'RX-93', 'HG 1/144 RX-93 ν Gundam', 2500, 'https://cdn2.gunpladb.net/HGHGUC-086RX93%CE%BDGundam.jpg'],
  ['hg-unicorn-destroy', 'HG', 'RX-0', 'HG 1/144 RX-0 Unicorn Gundam (Destroy Mode)', 1800, 'https://cdn2.gunpladb.net/HGHGUC-100RX0UnicornGundamDestroyMode.jpg'],
  ['eg-rx-78f00e', 'EG', 'RX-78F00/E', 'EG 1/144 RX-78F00/E Gundam', 1320, 'https://cdn2.gunpladb.net/HG-RX78F00EGundam.jpg'],
  ['eg-rx-93ff-nu', 'EG', 'RX-93ff', 'EG 1/144 RX-93ff ν Gundam', 1430, 'https://cdn2.gunpladb.net/EG-NARX93ff%CE%BDGundam.jpg'],
];

const exists = (p) => access(p).then(() => true, () => false);

await mkdir(IMG_DIR, { recursive: true });
await mkdir(MD_DIR, { recursive: true });

for (const [slug, grade, code, fullName, priceYen, url] of KITS) {
  const imgFile = join(IMG_DIR, `${slug}.jpg`);
  const mdFile = join(MD_DIR, `${slug}.md`);

  // baixa a imagem (pula se já existe)
  if (await exists(imgFile)) {
    console.log('• imagem já existe:', slug);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`falha ao baixar ${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(imgFile, buf);
    console.log(`✓ imagem ${slug}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  // gera o md (NÃO sobrescreve — preserva conteúdo futuro)
  if (await exists(mdFile)) {
    console.log('• md já existe (preservado):', slug);
    continue;
  }
  const md = `---
type: gunpla
name: "${fullName}"
grade: ${grade}
scale: "1/144"
code: "${code}"
priceYen: ${priceYen}
image: hobbies/gunpla/${slug}.jpg
tags: [wishlist]
---

<!-- Espaço pro conteúdo deste kit: review da montagem, dicas, fotos, etc. -->
`;
  await writeFile(mdFile, md);
  console.log('✓ md', slug + '.md');
}

console.log('\nConcluído.');
