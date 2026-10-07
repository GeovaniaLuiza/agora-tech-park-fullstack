// Synthetic fixture: document numbers are deliberately invalid.
import ExcelJS from 'exceljs';

const asBuffer = async (workbook) => Buffer.from(await workbook.xlsx.writeBuffer());

export async function eventWorkbookFixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Eventos');
  sheet.addRow(['Lista', 'Data', 'Local', 'Temática', 'Modo', 'Tipo de Evento', 'Nº de Participantes', 'Nº de Empresas Participantes']);
  sheet.addRow(['Evento Anônimo X', '15/03/2026 09:00:00', 'Auditório', '', 'Presencial', '', 20, '3']);
  sheet.addRow(['Evento Anônimo X', '15/03/2026 09:00:00', 'Rooftop 02', '', '', '', null, null]);
  sheet.addRow(['Reunião interna', new Date('2026-04-10T13:00:00Z'), 'Sala 01', '', 'Online', 'Reunião', '15', '2']);
  sheet.addRow(['Reserva inválida', 'data inválida', 'Sala 02', '', '', '', 5]);
  return asBuffer(workbook);
}

export async function residentWorkbookFixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Clientes');
  sheet.addRow([]);
  sheet.addRow(['Legenda ', 'Locador ', 'Bloco', 'Bloco e Modúlo ', 'Área ', 'EMPRESA', 'CNPJ', 'Vigência ', 'Fim ', 'Atividades', 'Nacionalidade']);
  const add = ({ legend = 'Locada', block, room, name, document, start, end, sector = 'Tecnologia' }) =>
    sheet.addRow([legend, 'Locador anonimizado', block, room, 50, name, document, start, end, sector, 'Brasileira']);
  add({ block: 'HUB', room: 'HUB 201', name: 'Empresa Anônima A', document: '11.222.333/0001-81', start: '01/01/2026', end: '31/12/2026' });
  add({ block: 'UNI', room: 'UNI 301', name: 'Empresa Anônima A', document: '11222333000181', start: '01/03/2026', end: '' });
  add({ block: 'MOB', room: 'MOB 101', name: 'Empresa B', document: '04.252.011/0001-10', start: '01/06/2026', end: '30/09/2026', sector: 'Consultoria' });
  add({ block: 'Z', room: 'Z 10', name: 'Empresa Fora do Centro', document: '00.000.000/0000-01', start: '01/01/2026', end: '31/12/2026' });
  add({ block: 'HUB', room: 'HUB 401', name: 'Empresa Sem Documento', document: '', start: '01/01/2026', end: '28/02/2026' });
  add({ block: 'HUB', room: 'HUB 402', name: 'Empresa Sem Documento', document: '', start: '01/07/2026', end: '31/08/2026' });
  add({ legend: 'Disponível', block: 'HUB', room: 'HUB 501' });
  add({ legend: 'Áreas Comuns', block: 'UNI', room: 'Hall' });
  return asBuffer(workbook);
}

export async function officialTemplateFixture({ existingEvent = false } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('CI JOINVILLE');
  sheet.getCell('A86').value = 'Eventos';
  sheet.getCell('A87').value = 'Nº de Eventos Realizados';
  sheet.getCell('A88').value = 'Lista';
  sheet.getCell('N87').value = { formula: 'SUM(B87:M87)' };
  sheet.getCell('A1430').value = 'Grandes Empresas';
  sheet.getCell('A1515').value = 'Empresas Residente';
  sheet.getCell('A1516').value = 'Nº de Empresas Residentes';
  sheet.getCell('A1517').value = 'Lista';
  sheet.getCell('N1516').value = { formula: 'SUM(B1516:D1516)' };
  sheet.getCell('A1600').value = 'Inovação Aberta';
  sheet.getCell('A89').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2F8' } };
  sheet.getCell('B89').numFmt = 'dd/mm/yyyy';
  if (existingEvent) { sheet.getCell('A89').value = 'Evento existente'; sheet.getCell('B89').value = new Date('2026-01-10T00:00:00Z'); }
  return workbook;
}
