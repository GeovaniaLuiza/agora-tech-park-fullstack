export const CALCULATION_TYPES = Object.freeze(['MANUAL', 'AUTOMATIC', 'DERIVED']);
export const VALUE_TYPES = Object.freeze(['INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENTAGE', 'TEXT', 'BOOLEAN']);
export const ANNUAL_AGGREGATIONS = Object.freeze(['SUM', 'AVERAGE', 'LAST_VALUE', 'COUNT', 'DERIVED']);

export const RECORD_TYPES = Object.freeze({
  FUNCTION: { label: 'Funções', indicatorCodes: ['FUNCOES_ATIVAS'] },
  PROGRAM: { label: 'Programas', indicatorCodes: ['PROGRAMAS_INICIADOS'] },
  EVENT: { label: 'Eventos', indicatorCodes: ['EVENTOS_REALIZADOS'] },
  MAINTAINER: { label: 'Mantenedores', indicatorCodes: ['MANTENEDORES'] },
  IES: { label: 'Instituições de Ensino Superior', indicatorCodes: ['IES_REGIAO', 'IES_ATENDIDAS'] },
  MUNICIPALITY: { label: 'Municípios', indicatorCodes: ['MUNICIPIOS_REGIAO', 'MUNICIPIOS_ATENDIDOS'] },
  ENTITY: { label: 'Entidades', indicatorCodes: ['ENTIDADES_REGIAO', 'ENTIDADES_ATENDIDAS'] },
  LARGE_COMPANY: { label: 'Grandes Empresas', indicatorCodes: ['GRANDES_EMPRESAS_REGIAO', 'GRANDES_EMPRESAS_ATENDIDAS'] },
  DEVELOPMENT_COMPANY: {
    label: 'Programas de desenvolvimento empresarial',
    indicatorCodes: ['EMPRESAS_PRE_INCUBADAS', 'EMPRESAS_PRE_ACELERADAS', 'EMPRESAS_INCUBADAS', 'EMPRESAS_ACELERADAS'],
  },
  RESIDENT_COMPANY: { label: 'Empresas Residentes', indicatorCodes: ['EMPRESAS_RESIDENTES'] },
  OPEN_INNOVATION: { label: 'Inovação Aberta', indicatorCodes: ['GRANDES_EMPRESAS_APOIADAS', 'INOVACAO_ABERTA_ORGANIZACOES'] },
});

export const RECORD_TYPE_VALUES = Object.freeze(Object.keys(RECORD_TYPES));
export const MODES = Object.freeze(['PRESENTIAL', 'ONLINE', 'HYBRID']);
export const DEVELOPMENT_STAGES = Object.freeze(['PRE_INCUBATION', 'PRE_ACCELERATION', 'INCUBATION', 'ACCELERATION']);

export function normalizedValueType(valueType) {
  if (valueType === 'NUMBER') return 'DECIMAL';
  if (valueType === 'PERCENT') return 'PERCENTAGE';
  return valueType;
}
