import { describe, expect, it } from 'vitest';
import { selectInnovationCenterId } from './innovationCenters.js';

const centers = [
  { id: 'blumenau-existing-id', code: 'CI_BLUMENAU' },
  { id: 'joinville-existing-id', code: 'CI_JOINVILLE' },
  { id: 'scti-existing-id', code: 'SCTI_FLORIANOPOLIS' },
];

describe('innovation center selection priority', () => {
  it('uses the stable Joinville code regardless of order or display name', () => {
    expect(selectInnovationCenterId(centers)).toBe('joinville-existing-id');
    expect(selectInnovationCenterId([...centers].reverse())).toBe('joinville-existing-id');
  });
  it('prefers valid explicit IDs, then valid previous selections', () => {
    expect(selectInnovationCenterId(centers, 'scti-existing-id', 'blumenau-existing-id')).toBe('scti-existing-id');
    expect(selectInnovationCenterId(centers, 'unknown-id', 'blumenau-existing-id')).toBe('blumenau-existing-id');
    expect(selectInnovationCenterId(centers, 'unknown-id')).toBe('joinville-existing-id');
  });
  it('never selects another center automatically when Joinville is unavailable', () => {
    expect(selectInnovationCenterId([centers[0]])).toBe('');
    expect(selectInnovationCenterId([])).toBe('');
    expect(selectInnovationCenterId([centers[0]], 'blumenau-existing-id')).toBe('blumenau-existing-id');
  });
});
