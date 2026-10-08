export const IMPORT_TYPES = Object.freeze({ EVENTS: 'EVENTS', RESIDENTS: 'RESIDENTS' });
export const IMPORT_TYPE_VALUES = Object.freeze(Object.values(IMPORT_TYPES));
export const IMPORT_STATUS = Object.freeze({
  NOT_IMPORTED: 'NOT_IMPORTED', PROCESSING: 'PROCESSING', REVIEW_PENDING: 'REVIEW_PENDING',
  WITH_WARNINGS: 'WITH_WARNINGS', VALIDATED: 'VALIDATED', IMPORTED: 'IMPORTED', FAILED: 'FAILED',
});

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_IMPORT_FILE_SIZE_MB = 50;
export const MAX_IMPORT_BYTES = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
export const IMPORT_FILE_TOO_LARGE_MESSAGE = `A planilha excede o limite de ${MAX_IMPORT_FILE_SIZE_MB} MB.`;
export const IMPORT_YEAR = 2026;
export const EVENT_SHEET = 'Eventos';
export const EVENT_HEADERS = Object.freeze(['Lista', 'Data', 'Local', 'Temática', 'Modo', 'Tipo de Evento', 'Nº de Participantes', 'Nº de Empresas Participantes']);
export const RESIDENT_SHEET = 'Clientes';
export const RESIDENT_HEADERS = Object.freeze(['Legenda', 'Locador', 'Bloco', 'Bloco e Modúlo', 'Área', 'EMPRESA', 'CNPJ', 'Vigência', 'Fim', 'Atividades', 'Nacionalidade']);
export const TEMPLATE_SHEET = 'CI JOINVILLE';
export const RESIDENT_BLOCKS = Object.freeze(['HUB', 'MOB', 'UNI']);
export const EVENT_MODES = Object.freeze(['PRESENTIAL', 'HYBRID', 'ONLINE', 'NOT_INFORMED']);
export const EVENT_TYPES = Object.freeze(['Evento', 'Workshop', 'Palestra', 'Capacitação', 'Encontro', 'Feira', 'Hackathon', 'Reunião', 'Outro']);

export const TEMPLATE_BLOCKS = Object.freeze({
  EVENTS: {
    sectionAnchor: ['A86', 'Eventos'], countAnchor: ['A87', 'Nº de Eventos Realizados'],
    headerAnchor: ['A88', 'Lista'], nextAnchor: ['A1430', 'Grandes Empresas'],
    countRange: 'B87:M87', annualFormulaCell: 'N87', dataStart: 89, dataEnd: 1429, columns: 8,
  },
  RESIDENTS: {
    sectionAnchor: ['A1515', 'Empresas Residente'], countAnchor: ['A1516', 'Nº de Empresas Residentes'],
    headerAnchor: ['A1517', 'Lista'], nextAnchor: ['A1600', 'Inovação Aberta'],
    countRange: 'B1516:M1516', annualFormulaCell: 'N1516', dataStart: 1518, dataEnd: 1599, columns: 13,
  },
});

export const modeLabels = Object.freeze({
  PRESENTIAL: 'Presencial', HYBRID: 'Híbrido', ONLINE: 'Online', NOT_INFORMED: 'Não informado',
});
