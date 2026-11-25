import { describe, expect, it } from 'vitest';
import { loadRagTaxCorpus, retrieveRagTaxChunks } from '@/lib/lab/rag-tax';

describe('rag-tax corpus', () => {
  it('loads markdown fixtures', () => {
    expect(loadRagTaxCorpus().length).toBeGreaterThanOrEqual(3);
  });

  it('retrieves by keyword', () => {
    const hits = retrieveRagTaxChunks('marginal bracket standard deduction', 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].source).toContain('content/rag-tax/');
  });
});
