/**
 * Importa a Tabela TACO (Tabela Brasileira de Composição de Alimentos,
 * NEPA/UNICAMP) completa a partir de um CSV oficial, gerando
 * src/lib/taco/data-generated.ts no mesmo formato de TacoFood[] usado
 * pelo seed manual em src/lib/taco/data.ts.
 *
 * NÃO SOBRESCREVE data.ts automaticamente — escreve em um arquivo
 * separado (data-generated.ts) pra você revisar e decidir se substitui
 * ou funde com o seed manual, já que os ~90 itens do seed foram
 * revisados a mão e o CSV completo (~600 itens) não foi testado contra
 * este parser (não tínhamos o arquivo disponível ao escrever isto).
 *
 * Como usar:
 *   1. Baixe o CSV oficial da TACO (NEPA/UNICAMP, 4ª edição) — busque
 *      "Tabela TACO NEPA UNICAMP download" para encontrar a fonte
 *      oficial atual; o formato de distribuição já mudou de versão
 *      pra versão, então não fixamos uma URL aqui.
 *   2. Rode: npm run taco:import -- /caminho/para/taco.csv
 *   3. Revise src/lib/taco/data-generated.ts antes de usar em produção
 *      — nomes de colunas de CSVs "TACO" que circulam por aí variam
 *      bastante entre fontes, então CONFIRA que os valores fazem
 *      sentido pra uma amostra de alimentos conhecidos antes de
 *      confiar no arquivo inteiro.
 *
 * Detecção de colunas: procura por cabeçalhos comuns
 * (case-insensitive, com/sem acento) para descrição, energia (kcal),
 * proteína, carboidrato, lipídios/gordura e fibra. Se o seu CSV usa
 * nomes de coluna diferentes, ajuste COLUMN_ALIASES abaixo.
 */

import fs from 'fs';
import path from 'path';
import type { TacoFood } from '../src/lib/taco/types';

const COLUMN_ALIASES: Record<keyof Omit<TacoFood, 'id' | 'aliases'>, string[]> = {
  name: ['descricao', 'descrição', 'alimento', 'nome', 'description'],
  kcal100g: ['energia_kcal', 'energia (kcal)', 'kcal', 'energy_kcal'],
  protein100g: ['proteina', 'proteína', 'proteina_g', 'protein', 'protein_g'],
  carbs100g: ['carboidrato', 'carboidratos', 'carboidrato_g', 'carbohydrate', 'carbs'],
  fat100g: ['lipidios', 'lipídios', 'gordura', 'gorduras', 'lipid', 'fat', 'fat_g'],
  fiber100g: ['fibra', 'fibra alimentar', 'fiber', 'dietary_fiber'],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function slugify(name: string): string {
  return normalizeHeader(name)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

// Parser simples de CSV com suporte a campos entre aspas — suficiente
// para os CSVs da TACO que circulam (sem campos multilinha).
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/"/g, '').trim().replace(',', '.');
  if (cleaned === '' || cleaned.toUpperCase() === 'NA' || cleaned === '*' || cleaned === 'Tr') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Uso: npm run taco:import -- /caminho/para/taco.csv');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(csvPath), 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    console.error('CSV vazio ou só com cabeçalho.');
    process.exit(1);
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headerCells = parseCsvLine(lines[0], delimiter).map(normalizeHeader);

  const columnIndex: Partial<Record<keyof Omit<TacoFood, 'id' | 'aliases'>, number>> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof Omit<TacoFood, 'id' | 'aliases'>, string[]][]) {
    const idx = headerCells.findIndex((h) => aliases.some((a) => normalizeHeader(a) === h));
    if (idx !== -1) columnIndex[field] = idx;
  }

  const missing = (Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]).filter((f) => columnIndex[f] === undefined);
  if (missing.length > 0) {
    console.error(
      `Não encontrei coluna para: ${missing.join(', ')}. ` +
      'Cabeçalhos do CSV: ' + headerCells.join(' | ') + '\n' +
      'Ajuste COLUMN_ALIASES neste script para os nomes reais do seu arquivo.',
    );
    process.exit(1);
  }

  const foods: TacoFood[] = [];
  const seenIds = new Set<string>();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter);
    const name = cells[columnIndex.name!]?.replace(/"/g, '').trim();
    if (!name) { skipped++; continue; }

    const kcal100g = parseNumber(cells[columnIndex.kcal100g!]);
    const protein100g = parseNumber(cells[columnIndex.protein100g!]);
    const carbs100g = parseNumber(cells[columnIndex.carbs100g!]);
    const fat100g = parseNumber(cells[columnIndex.fat100g!]);
    const fiber100g = parseNumber(cells[columnIndex.fiber100g!]);

    // Linha sem valor de energia não é utilizável para cálculo — pula
    // em vez de gravar um 0 que pareceria um dado real.
    if (kcal100g === null) { skipped++; continue; }

    let id = slugify(name);
    let suffix = 2;
    while (seenIds.has(id)) { id = `${slugify(name)}-${suffix++}`; }
    seenIds.add(id);

    foods.push({
      id,
      name,
      aliases: [],
      kcal100g,
      protein100g: protein100g ?? 0,
      carbs100g: carbs100g ?? 0,
      fat100g: fat100g ?? 0,
      fiber100g: fiber100g ?? 0,
    });
  }

  const outPath = path.resolve(__dirname, '../src/lib/taco/data-generated.ts');
  const header =
    '// Gerado por scripts/import-taco-csv.ts — NÃO editado à mão.\n' +
    '// Revise antes de usar em produção (ver o comentário no topo do script).\n' +
    "import type { TacoFood } from './types';\n\n" +
    'export const TACO_FOODS_GENERATED: TacoFood[] = ';

  fs.writeFileSync(outPath, header + JSON.stringify(foods, null, 2) + ';\n');

  console.log(`Importados: ${foods.length} alimentos. Pulados (sem nome/energia válida): ${skipped}.`);
  console.log(`Escrito em: ${outPath}`);
  console.log('Revise o arquivo antes de substituir ou mesclar com src/lib/taco/data.ts.');
}

main();
