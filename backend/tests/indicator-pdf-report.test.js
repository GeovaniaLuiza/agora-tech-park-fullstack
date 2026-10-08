import { inflateSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIndicatorReport } from '../src/services/indicatorReportModel.js';
import { renderIndicatorPdf } from '../src/services/indicatorPdfReport.js';
import PDFDocument from 'pdfkit';

const mocks = vi.hoisted(() => ({ summary: vi.fn(), record: vi.fn() }));
vi.mock('../src/repositories/indicatorRepository.js', () => ({ summary: mocks.summary, periods: vi.fn(), dashboard: vi.fn(), recompute: vi.fn() }));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: mocks.record }));
import { exportReport } from '../src/services/indicatorService.js';

// Synthetic test inputs only: never seeded or returned by the application.
const generated = new Date('2026-10-08T19:49:00Z');
const user = { sub: 'test-user', name: 'Usuária de validação', email: 'test@example.invalid' };
const filters = { centerId: 'test-center', year: '2026', period: '2026', sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true', codes: 'EVENTOS_REALIZADOS', categoryLabel: 'Eventos e Capacitações' };
const row = { code: 'EVENTOS_REALIZADOS', name: 'Eventos e ações de inovação', category: 'Eventos', unit: 'UNIDADE', value_type: 'INTEGER', periodicity: 'MONTHLY', annual_aggregation: 'SUM', value: '12', source: 'SPREADSHEET_IMPORT', updated_at: '2026-10-07T10:00:00Z', year: 2026, center_name: 'Centro de teste', monthly_values: [{ month: 1, value: '5', source: 'SPREADSHEET_IMPORT' }, { month: 3, value: '7', updated_at: '2026-03-31T12:00:00Z' }] };

function pdfText(buffer) {
  const streams = [...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  return streams.flatMap((match) => {
    let content;
    try { content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { return []; }
    return [...content.matchAll(/BT([\s\S]*?)ET/g)].map((text) => [...text[1].matchAll(/<([\da-f]+)>/gi)].map((hex) => new TextDecoder('windows-1252').decode(Buffer.from(hex[1], 'hex'))).join(''));
  }).join('\n');
}

beforeEach(() => { vi.resetAllMocks(); mocks.summary.mockResolvedValue([row]); });

describe('dados do relatório institucional', () => {
  it('conta resultados disponíveis, ausentes e zero sem inventar metas', () => {
    const report = buildIndicatorReport([row, { ...row, code: 'EMPTY', value: null }, { ...row, code: 'ZERO', value: 0 }], filters, user, [], generated);
    expect(report.cards.slice(0, 3).map((card) => card[1])).toEqual([3, 2, 1]);
    expect(report.indicators.map((item) => item.result)).toEqual(['12', 'Sem dados', '0']);
    expect(report.indicators.map((item) => item.status)).toEqual(['Não avaliado (sem meta)', 'Sem dados', 'Não avaliado (sem meta)']);
    expect(report.cards.slice(3).every((card) => card[1] === 'Não informado')).toBe(true);
    expect(report.note).toContain('não há metas cadastradas');
  });
  it('usa o resultado e atualização do mês selecionado e mantém a série anual com lacunas', () => {
    const report = buildIndicatorReport([row], { ...filters, period: '2026-03' }, user);
    expect(report.indicators[0]).toMatchObject({ result: '7', updated: '31/03/2026' });
    expect(report.indicators[0].series.slice(0, 4)).toEqual([5, null, 7, null]);
    expect(report.charts).toHaveLength(1);
    const empty = buildIndicatorReport([row], { ...filters, period: '2026-02' }, user);
    expect(empty.indicators[0].result).toBe('Sem dados');
  });
  it('preserva o consolidado anual fornecido e não inventa série para indicador anual', () => {
    const annual = { ...row, periodicity: 'ANNUAL', value: '19', consolidation_basis: 'RECORDED_ANNUAL', monthly_values: [] };
    const report = buildIndicatorReport([annual], filters, user);
    expect(report.indicators[0]).toMatchObject({ result: '19', aggregation: 'Consolidado anual da planilha', periodicity: 'Anual' });
    expect(report.charts).toEqual([]);
    expect(buildIndicatorReport([annual], { ...filters, period: '2026-03' }, user).indicators[0].result).toBe('Sem dados');
  });
  it('registra centro, ano, categoria, origem, busca, usuário e geração reais da entrada', () => {
    const report = buildIndicatorReport([row], { ...filters, name: 'ações' }, user, [], generated);
    expect(report).toMatchObject({ center: row.center_name, user: user.name, year: '2026', generatedLabel: '08/10/2026, 16:49' });
    expect(report.filters).toMatchObject({ Centro: row.center_name, Categoria: filters.categoryLabel, Origem: 'Planilha oficial', Busca: 'ações' });
  });
  it('compara somente pares conhecidos do mesmo período, incluindo zero', () => {
    const report = buildIndicatorReport([row], filters, user, [{ ...row, value: 0 }]);
    expect(report.analysis.find(([title]) => title === 'Comparação histórica')[1]).toContain('2025: 0');
    expect(buildIndicatorReport([row], filters, user, [{ ...row, value: null }]).analysis.find(([title]) => title === 'Comparação histórica')[1]).toBe('Não disponível para este relatório.');
    expect(buildIndicatorReport([row], filters, user, [{ ...row, unit: 'BRL' }]).indicators[0].history).toBeNull();
    const text = buildIndicatorReport([{ ...row, value_type: 'TEXT' }], filters, user, [{ ...row, value_type: 'TEXT' }]);
    expect(text.charts).toHaveLength(0);
    expect(text.indicators[0].history).toBeNull();
  });
  it('gera somente recomendações derivadas e não inventa responsáveis, prazos ou desatualização', () => {
    const report = buildIndicatorReport([{ ...row, value: null, monthly_values: [] }], filters, user);
    expect(report.actions.map((action) => action.action)).toEqual(['Cadastrar metas', 'Consolidar resultados', 'Estabelecer rotina de atualização']);
    expect(report.actions.every((action) => action.responsible === 'Não informado' && action.deadline === 'Não informado' && action.status === 'Não informado')).toBe(true);
  });
});

describe('PDF completo e integração de exportação', () => {
  it('produz as nove seções, texto com acentos, usuário, data e todas as colunas', async () => {
    const body = await renderIndicatorPdf(buildIndicatorReport([row], filters, user, [], generated));
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(body);
    expect(text).toContain('Eventos e ações de inovação');
    expect(text).toContain(user.name);
    expect(text).toContain('08/10/2026, 16:49');
    for (const section of ['1. Identificação', '2. Resumo', '3. Status', '4. Indicadores', '5. Evolução', '6. Análise', '7. Recomendações', '8. Observações', '9. Controle']) expect(text).toContain(section);
    for (const field of ['Código', 'Indicador', 'Categoria', 'Unidade', 'Meta', 'Resultado', 'Status', 'Origem']) expect(text).toContain(field);
    expect(text).toContain('Não informado');
  });
  it('exporta todos os indicadores de uma tabela longa, repetindo o cabeçalho sem corte', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ ...row, code: `C${String(index).padStart(4, '0')}`, name: `Indicador de teste ${index}`, monthly_values: [] }));
    const body = await renderIndicatorPdf(buildIndicatorReport(rows, filters, user));
    const text = pdfText(body);
    for (const item of rows) expect(text).toContain(item.code);
    expect((text.match(/Código/g) || []).length).toBeGreaterThan(2);
    expect((body.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(3);
  });
  it('quebra inclusive células maiores que uma página sem descartar texto', async () => {
    const long = { ...row, name: `${'Descrição muito longa '.repeat(300)}FINALDOINDICADOR`, monthly_values: [] };
    const body = await renderIndicatorPdf(buildIndicatorReport([long], filters, user));
    expect(pdfText(body).replaceAll('\n', '')).toContain('FINALDOINDICADOR');
  });
  it('gera relatório sem dados e sem gráfico para apenas um mês conhecido', async () => {
    const report = buildIndicatorReport([{ ...row, value: null, monthly_values: [{ month: 3, value: '7' }] }], filters, user);
    expect(report.charts).toHaveLength(0);
    const text = pdfText(await renderIndicatorPdf(report));
    expect(text).toContain('Sem dados');
    expect(text).toContain('Não há série mensal suficiente');
  });
  it('aplica centro, ano, origem, busca e códigos na consulta e retém Jan-Dez para PDF mensal', async () => {
    const applied = { ...filters, period: '2026-03', name: 'ações' };
    const report = await exportReport('pdf', applied, user);
    expect(mocks.summary).toHaveBeenNthCalledWith(1, { ...applied, period: null });
    expect(mocks.summary).toHaveBeenNthCalledWith(2, { ...applied, period: null, year: '2025' });
    expect(pdfText(report.body)).toContain('Mar de 2026');
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ userId: user.sub, action: 'INDICATORS_EXPORTED' }));
  });
  it('aplica categoria nativa quando fornecida e deduz o ano do período', async () => {
    await exportReport('pdf', { centerId: 'other', period: '2025-07', category: 'Eventos', sourceType: 'MANUAL_ENTRY' }, user);
    expect(mocks.summary).toHaveBeenNthCalledWith(1, { centerId: 'other', period: null, year: '2025', category: 'Eventos', sourceType: 'MANUAL_ENTRY' });
  });
  it('propaga falha da consulta atual sem auditar uma exportação inexistente', async () => {
    mocks.summary.mockRejectedValueOnce(new Error('Falha na consulta'));
    await expect(exportReport('pdf', filters, user)).rejects.toThrow('Falha na consulta');
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('propaga erro do gerador PDF sem registrar exportação bem-sucedida', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text').mockImplementationOnce(() => { throw new Error('Falha no gerador PDF'); });
    try {
      await expect(exportReport('pdf', filters, user)).rejects.toThrow('Falha no gerador PDF');
      expect(mocks.record).not.toHaveBeenCalled();
    } finally { text.mockRestore(); }
  });
  it('indica comparação indisponível se a consulta histórica falha', async () => {
    mocks.summary.mockResolvedValueOnce([row]).mockRejectedValueOnce(new Error('Falha histórica'));
    expect(pdfText((await exportReport('pdf', filters, user)).body)).toContain('Não disponível para este relatório.');
  });
});
