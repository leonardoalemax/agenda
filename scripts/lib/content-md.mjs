// Helpers compartilhados pelos scripts que geram ou editam .md de content
// collections (frontmatter YAML + corpo) — usado por pokemon-to-content.mjs,
// cheevos-sync.mjs, cheevos-to-content.mjs e pokemon-ra-map.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { dump, load } from 'js-yaml';

export function serializeMd(frontmatter, body = '') {
  const yamlText = dump(frontmatter, { lineWidth: -1, noRefs: true });
  return `---\n${yamlText}---\n\n${body}`;
}

export async function writeMd(path, frontmatter, body = '') {
  await writeFile(path, serializeMd(frontmatter, body));
}

/** Lê um .md gerado por writeMd() de volta em { frontmatter, body }. */
export async function readMd(path) {
  const raw = await readFile(path, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) throw new Error(`frontmatter não encontrado em ${path}`);
  return { frontmatter: load(match[1]), body: match[2] ?? '' };
}

/** Lê, aplica `patch` no frontmatter (mutando ou devolvendo um novo objeto) e regrava. */
export async function updateMdFrontmatter(path, patch) {
  const { frontmatter, body } = await readMd(path);
  const next = typeof patch === 'function' ? patch(frontmatter) ?? frontmatter : { ...frontmatter, ...patch };
  await writeMd(path, next, body);
  return next;
}
