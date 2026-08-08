import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Coleção "agenda": diários, checklists e páginas custom.
// O campo `type` no frontmatter decide o layout. Excluímos `hobbies/`,
// que tem coleções próprias (ex.: gunpla) com schema diferente.
const agenda = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!hobbies/**/*.md'], base: './src/content' }),
  schema: z.object({
    // tipo de conteúdo -> layout dedicado
    type: z.enum(['diario', 'checklist', 'custom']).default('custom'),
    title: z.string(),
    date: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    summary: z.string().optional(),
    // usado só por checklists: mostra barra de progresso
    progress: z.boolean().default(true),
  }),
});

// Hobby: Gunpla. Cada kit é um .md (corpo = conteúdo futuro do kit).
// A tag `wishlist` marca o que entra na página de wishlist.
const gunpla = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hobbies/gunpla' }),
  schema: z.object({
    type: z.literal('gunpla').default('gunpla'),
    name: z.string(),
    grade: z.string().optional(), // HG | RG | EG | MG ...
    scale: z.string().default('1/144'),
    code: z.string().optional(), // ex.: GN-001
    priceYen: z.number(),
    image: z.string(), // caminho local em public/ (ex.: hobbies/gunpla/slug.jpg)
    tags: z.array(z.string()).default([]),
    date: z.coerce.date().optional(),
    summary: z.string().optional(),
  }),
});

export const collections = { agenda, gunpla };
