import { readFileSync, readdirSync } from 'fs';
import path from 'path';

export type RagChunk = {
  id: string;
  title: string;
  body: string;
  source: string;
};

const DOCS_DIR = path.join(process.cwd(), 'content', 'rag-tax');

/** Load small controlled markdown corpus from disk. */
export function loadRagTaxCorpus(): RagChunk[] {
  let files: string[] = [];
  try {
    files = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }

  return files.map((file) => {
    const raw = readFileSync(path.join(DOCS_DIR, file), 'utf8');
    const lines = raw.split(/\r?\n/);
    const titleLine = lines.find((l) => l.startsWith('# '));
    const title = titleLine ? titleLine.replace(/^#\s+/, '') : file;
    return {
      id: file.replace(/\.md$/, ''),
      title,
      body: raw,
      source: `content/rag-tax/${file}`,
    };
  });
}

/** Naive keyword retrieval — good enough for a tiny lab corpus. */
export function retrieveRagTaxChunks(query: string, limit = 3): RagChunk[] {
  const q = query.toLowerCase();
  const terms = q.split(/\W+/).filter((t) => t.length > 2);
  const corpus = loadRagTaxCorpus();

  const scored = corpus.map((chunk) => {
    const hay = `${chunk.title}\n${chunk.body}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (hay.includes(term)) score += 1;
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.chunk);
}
