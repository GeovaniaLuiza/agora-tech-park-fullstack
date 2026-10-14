import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import names from '../../../backend/tests/fixtures/innovation-center-names.json';

const api = vi.hoisted(() => ({
  getInnovationCenters: vi.fn(), getIndicatorHistory: vi.fn(), getIndicators: vi.fn(),
  getConfirmedImportIndicators: vi.fn(), getIndicatorImportDraft: vi.fn(), getIndicatorImportOptions: vi.fn(),
  getOperationalDashboard: vi.fn(), getInstitutionalDashboard: vi.fn(), getDashboardCompanies: vi.fn(),
  getDashboardFinancial: vi.fn(), getDashboardProjects: vi.fn(), getDashboardEngagement: vi.fn(),
}));
vi.mock('../services/api.js', () => api);
vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }));
import DashboardPage from './DashboardPage.jsx';
import IndicatorsPage from './IndicatorsPage.jsx';
import ImportedIndicatorsPage from './ImportedIndicatorsPage.jsx';
import IndicatorImportPage from './IndicatorImportPage.jsx';

const centers = names.map((name, index) => ({ id: `catalog-${index}`, code: index === 10 ? 'CI_JOINVILLE' : `CI_${index}`, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const joinville = 'catalog-10';
const blumenau = 'catalog-2';
const pages = [
  ['Dashboard', () => <DashboardPage />, () => api.getInstitutionalDashboard.mock.calls.map(([filters]) => filters.centerId)],
  ['Indicadores', () => <IndicatorsPage />, () => api.getIndicators.mock.calls.map(([filters]) => filters.centerId)],
  ...['EVENTS', 'RESIDENTS'].flatMap((type) => [
    [`Indicadores ${type}`, () => <ImportedIndicatorsPage type={type} />, () => api.getConfirmedImportIndicators.mock.calls.map(([, filters]) => filters.centerId)],
    [`Importar ${type}`, () => <IndicatorImportPage type={type} />, () => api.getIndicatorImportDraft.mock.calls.map(([, id]) => id)],
  ]),
];

beforeEach(() => {
  vi.resetAllMocks();
  api.getInnovationCenters.mockResolvedValue(centers);
  api.getIndicatorHistory.mockResolvedValue(['2026']);
  api.getIndicators.mockResolvedValue([]);
  api.getConfirmedImportIndicators.mockResolvedValue({ monthly: Array(12).fill(0), total: 0, records: [] });
  api.getIndicatorImportDraft.mockResolvedValue(null);
  api.getIndicatorImportOptions.mockResolvedValue({ eventModes: [], eventTypes: [], maxBytes: 1048576 });
  api.getOperationalDashboard.mockResolvedValue({});
  api.getInstitutionalDashboard.mockResolvedValue({ cards: [], categories: [] });
  for (const key of ['getDashboardCompanies', 'getDashboardFinancial', 'getDashboardProjects', 'getDashboardEngagement']) {
    api[key].mockResolvedValue({ series: [] });
  }
});
afterEach(cleanup);

describe.each(pages)('%s shares the center selection rule', (_name, page, requestedCenters) => {
  it('defaults to Joinville with all 16 centers alphabetically ordered, and allows manual changes', async () => {
    render(<MemoryRouter><>{page()}</></MemoryRouter>);
    await waitFor(() => expect(requestedCenters()).toContain(joinville));
    const select = screen.getByLabelText('Centro');
    expect(select.value).toBe(joinville);
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(centers.map((center) => center.name));
    expect(within(select).getAllByRole('option')[0].value).toBe(blumenau);
    expect(requestedCenters()).not.toContain(blumenau);
    fireEvent.change(select, { target: { value: blumenau } });
    await waitFor(() => expect(requestedCenters().at(-1)).toBe(blumenau));
    expect(select.value).toBe(blumenau);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('honors a valid URL center ahead of navigation state', async () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/', search: `?centerId=${blumenau}`, state: { centerId: joinville } }]}>{page()}</MemoryRouter>);
    await waitFor(() => expect(requestedCenters()).toContain(blumenau));
    expect(screen.getByLabelText('Centro').value).toBe(blumenau);
    expect(requestedCenters()).not.toContain(joinville);
  });
  it('preserves a valid center from navigation state when the URL center is invalid', async () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/', search: '?centerId=invalid', state: { centerId: blumenau } }]}>{page()}</MemoryRouter>);
    await waitFor(() => expect(requestedCenters()).toContain(blumenau));
    expect(requestedCenters()).not.toContain('invalid');
    expect(screen.getByLabelText('Centro').value).toBe(blumenau);
  });
  it('preserves the previous manual selection when navigating to an invalid center', async () => {
    render(<MemoryRouter>{page()}<Link to="/?centerId=invalid">Invalid center link</Link></MemoryRouter>);
    await waitFor(() => expect(requestedCenters()).toContain(joinville));
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: blumenau } });
    await waitFor(() => expect(requestedCenters().at(-1)).toBe(blumenau));
    fireEvent.click(screen.getByRole('link', { name: 'Invalid center link' }));
    expect(screen.getByLabelText('Centro').value).toBe(blumenau);
    expect(requestedCenters()).not.toContain('invalid');
  });
  it('waits for a manual selection when Joinville is unavailable', async () => {
    api.getInnovationCenters.mockResolvedValue(centers.filter((center) => center.id !== joinville));
    render(<MemoryRouter>{page()}</MemoryRouter>);
    await screen.findByRole('option', { name: 'Centro de Inovação de Blumenau' });
    expect(screen.getByLabelText('Centro').value).toBe('');
    expect(requestedCenters()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Centro'), { target: { value: blumenau } });
    await waitFor(() => expect(requestedCenters().at(-1)).toBe(blumenau));
  });
});
