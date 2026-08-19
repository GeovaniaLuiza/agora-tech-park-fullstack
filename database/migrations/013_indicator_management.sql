CREATE TABLE IF NOT EXISTS innovation_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  municipality VARCHAR(120),
  state CHAR(2),
  phase VARCHAR(80),
  facilities_status VARCHAR(80),
  innovation_law_status VARCHAR(20) CHECK (innovation_law_status IN ('YES', 'NO', 'NOT_APPLICABLE')),
  miditec_status VARCHAR(20) CHECK (miditec_status IN ('YES', 'NO', 'NOT_APPLICABLE')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO innovation_centers(code,name,municipality,state)
VALUES('CI_JOINVILLE','Centro de Inovação de Joinville','Joinville','SC')
ON CONFLICT(code) DO NOTHING;

ALTER TABLE indicator_definitions
  ADD COLUMN IF NOT EXISTS calculation_type VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS annual_aggregation VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_entity VARCHAR(50),
  ADD COLUMN IF NOT EXISTS formula TEXT,
  ADD COLUMN IF NOT EXISTS not_applicable_allowed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE indicator_definitions DROP CONSTRAINT IF EXISTS indicator_definitions_value_type_check;
ALTER TABLE indicator_definitions ADD CONSTRAINT indicator_definitions_value_type_check
  CHECK (value_type IN ('NUMBER','INTEGER','DECIMAL','CURRENCY','PERCENT','PERCENTAGE','TEXT','BOOLEAN','JSON'));
ALTER TABLE indicator_definitions DROP CONSTRAINT IF EXISTS indicator_definitions_aggregation_type_check;
ALTER TABLE indicator_definitions ADD CONSTRAINT indicator_definitions_aggregation_type_check
  CHECK (aggregation_type IN ('SUM','AVERAGE','COUNT','LAST_VALUE','MAX','MIN','PERCENT','ACCUMULATED','CALCULATED','DERIVED','MANUAL'));
ALTER TABLE indicator_definitions DROP CONSTRAINT IF EXISTS indicator_definitions_calculation_type_check;
ALTER TABLE indicator_definitions ADD CONSTRAINT indicator_definitions_calculation_type_check
  CHECK (calculation_type IN ('MANUAL','AUTOMATIC','DERIVED'));
ALTER TABLE indicator_definitions DROP CONSTRAINT IF EXISTS indicator_definitions_annual_aggregation_check;
ALTER TABLE indicator_definitions ADD CONSTRAINT indicator_definitions_annual_aggregation_check
  CHECK (annual_aggregation IS NULL OR annual_aggregation IN ('SUM','AVERAGE','LAST_VALUE','COUNT','DERIVED'));

INSERT INTO indicator_definitions(code,name,category,unit,value_type,periodicity,aggregation_type,default_source_type)
VALUES
('NOVAS_STARTUPS','Nº de Novas Startups','Resumo das Empresas','UNIDADE','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('STARTUPS_ATIVAS','Nº de Startups Ativas','Resumo das Empresas','UNIDADE','INTEGER','MONTHLY','LAST_VALUE','MANUAL_ENTRY'),
('NOVAS_EMPRESAS_ATIVAS','Nº Total de Novas Empresas Ativas','Resumo das Empresas','UNIDADE','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('EMPRESAS_ATIVAS_TOTAL','Nº Total de Empresas Ativas','Resumo das Empresas','EMPRESA','INTEGER','MONTHLY','LAST_VALUE','MANUAL_ENTRY'),
('FATURAMENTO_EMPRESAS','Faturamento das Empresas Atendidas','Resumo das Empresas','BRL','CURRENCY','MONTHLY','SUM','MANUAL_ENTRY'),
('ARRECADACAO_EMPRESAS','Arrecadação Total das Empresas Atendidas','Resumo das Empresas','BRL','CURRENCY','MONTHLY','SUM','MANUAL_ENTRY'),
('COLABORADORES_EMPRESAS','Nº Total de Colaboradores das Empresas Atendidas','Resumo das Empresas','PESSOA','INTEGER','MONTHLY','LAST_VALUE','MANUAL_ENTRY'),
('RECEITA_TOTAL_CENTRO','Receita Total do Centro','Saúde Financeira','BRL','CURRENCY','MONTHLY','SUM','MANUAL_ENTRY'),
('DESPESAS_TOTAL_CENTRO','Custos e Despesas Totais do Centro','Saúde Financeira','BRL','CURRENCY','MONTHLY','SUM','MANUAL_ENTRY'),
('RESULTADO_ANUAL_CENTRO','Resultado Mensal','Saúde Financeira','BRL','CURRENCY','MONTHLY','DERIVED','SYSTEM_CALCULATION'),
('DESPESAS_CUSTEADAS_RECEITA_PROPRIA','% de Despesas Custeadas com Receitas Próprias','Saúde Financeira','PERCENT','PERCENTAGE','MONTHLY','AVERAGE','MANUAL_ENTRY'),
('EQUIPE_CENTRO','Nº de Pessoas na Equipe do Centro de Inovação','Saúde Financeira','PESSOA','INTEGER','MONTHLY','LAST_VALUE','MANUAL_ENTRY'),
('OCUPACAO_PREDIO','Ocupação do Prédio','Saúde Financeira','PERCENT','PERCENTAGE','MONTHLY','AVERAGE','MANUAL_ENTRY'),
('PROJETOS_SUBMETIDOS','Nº de Projetos Submetidos para Editais','Captação de Recursos','UNIDADE','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('PROJETOS_GANHOS','Nº de Projetos Ganhos em Editais','Captação de Recursos','UNIDADE','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('VALOR_PROJETOS_GANHOS','Valor de Projetos Ganhos em Editais','Captação de Recursos','BRL','CURRENCY','MONTHLY','SUM','MANUAL_ENTRY'),
('VISITANTES_CENTRO','Nº de Visitantes no Centro','Visitantes','PESSOA','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('VALOR_PROJETOS_CAPACITACAO','Valor de Projetos de Capacitação de Empresas','Capacitações','BRL','CURRENCY','MONTHLY','SUM','MANUAL_ENTRY'),
('CAPACITACOES_REALIZADAS','Nº de Capacitações Realizadas','Capacitações','UNIDADE','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('EMPRESAS_CAPACITADAS','Nº de Empresas Capacitadas','Capacitações','EMPRESA','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('PESSOAS_CAPACITADAS','Nº de Pessoas Capacitadas','Capacitações','PESSOA','INTEGER','MONTHLY','SUM','MANUAL_ENTRY'),
('FUNCOES_ATIVAS','Nº de Funções Ativas','Funções','UNIDADE','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('PROGRAMAS_INICIADOS','Nº de Programas Iniciados','Programas','UNIDADE','INTEGER','MONTHLY','SUM','SYSTEM_CALCULATION'),
('EVENTOS_REALIZADOS','Nº de Eventos Realizados','Eventos','UNIDADE','INTEGER','MONTHLY','SUM','SYSTEM_CALCULATION'),
('MANTENEDORES','Nº de Mantenedores','Mantenedores','ORGANIZAÇÃO','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('IES_REGIAO','Nº de Instituições de Ensino Superior na Região','Instituições de Ensino Superior','ORGANIZAÇÃO','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('IES_ATENDIDAS','Nº de Instituições de Ensino Superior Atendidas','Instituições de Ensino Superior','ORGANIZAÇÃO','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('MUNICIPIOS_REGIAO','Nº de Municípios na Região','Municípios','MUNICÍPIO','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('MUNICIPIOS_ATENDIDOS','Nº de Municípios Atendidos','Municípios','MUNICÍPIO','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('ENTIDADES_REGIAO','Nº de Entidades na Região','Entidades','ORGANIZAÇÃO','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('ENTIDADES_ATENDIDAS','Nº de Entidades Atendidas','Entidades','ORGANIZAÇÃO','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('GRANDES_EMPRESAS_REGIAO','Nº de Grandes Empresas na Região','Grandes Empresas','EMPRESA','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('GRANDES_EMPRESAS_ATENDIDAS','Nº de Grandes Empresas Atendidas','Grandes Empresas','EMPRESA','INTEGER','MONTHLY','LAST_VALUE','SYSTEM_CALCULATION'),
('EMPRESAS_PRE_INCUBADAS','Nº de Empresas Pré-Incubadas','Pré-incubadora','EMPRESA','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('EMPRESAS_INCUBADAS','Nº de Empresas Incubadas','Incubadora','EMPRESA','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('EMPRESAS_ACELERADAS','Nº de Empresas Aceleradas','Aceleradora','EMPRESA','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('EMPRESAS_RESIDENTES','Nº de Empresas Residentes','Empresas Residentes','EMPRESA','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('GRANDES_EMPRESAS_APOIADAS','Nº de Grandes Empresas Apoiadas','Inovação Aberta','EMPRESA','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION'),
('FASE_CENTRO','Fase do Centro','Diagnóstico do Centro','TEXTO','TEXT','ANNUAL','LAST_VALUE','SYSTEM_CALCULATION'),
('INSTALACOES_CENTRO','Prédio / Instalações físicas','Diagnóstico do Centro','TEXTO','TEXT','ANNUAL','LAST_VALUE','SYSTEM_CALCULATION'),
('LEI_INOVACAO_EXISTENTE','Lei de Inovação','Diagnóstico do Centro','TEXTO','TEXT','ANNUAL','LAST_VALUE','SYSTEM_CALCULATION')
ON CONFLICT(code) DO NOTHING;

UPDATE indicator_definitions
SET calculation_type=CASE
      WHEN code='RESULTADO_ANUAL_CENTRO' THEN 'DERIVED'
      WHEN aggregation_type='COUNT' THEN 'AUTOMATIC'
      ELSE 'MANUAL'
    END,
    annual_aggregation=CASE
      WHEN aggregation_type IN ('SUM','AVERAGE','LAST_VALUE','COUNT') THEN aggregation_type
      WHEN aggregation_type IN ('CALCULATED','DERIVED') THEN 'DERIVED'
      ELSE 'LAST_VALUE'
    END,
    formula=CASE WHEN code='RESULTADO_ANUAL_CENTRO' THEN 'RECEITA_TOTAL_CENTRO - DESPESAS_TOTAL_CENTRO' ELSE formula END;

INSERT INTO indicator_definitions
  (code,name,description,category,unit,value_type,periodicity,aggregation_type,default_source_type,
   calculation_type,annual_aggregation,sort_order,source_entity,formula,not_applicable_allowed)
VALUES
('MASSA_SALARIAL_NOVAS_STARTUPS','Massa Salarial Média verificada nas Novas Startups','Valor médio mensal informado.','Resumo das Empresas','BRL','CURRENCY','MONTHLY','AVERAGE','MANUAL_ENTRY','MANUAL','AVERAGE',20,NULL,NULL,FALSE),
('MASSA_SALARIAL_STARTUPS_ATIVAS','Massa Salarial Média verificada nas Startups Ativas','Valor médio mensal informado.','Resumo das Empresas','BRL','CURRENCY','MONTHLY','AVERAGE','MANUAL_ENTRY','MANUAL','AVERAGE',40,NULL,NULL,FALSE),
('NOVAS_EMPRESAS','Nº de Novas Empresas','Quantidade mensal informada.','Resumo das Empresas','UNIDADE','INTEGER','MONTHLY','SUM','MANUAL_ENTRY','MANUAL','SUM',50,NULL,NULL,FALSE),
('EMPRESAS_ATIVAS','Nº de Empresas Ativas','Estoque mensal informado.','Resumo das Empresas','EMPRESA','INTEGER','MONTHLY','LAST_VALUE','MANUAL_ENTRY','MANUAL','LAST_VALUE',60,NULL,NULL,FALSE),
('MASSA_SALARIAL_EMPRESAS_ATIVAS','Massa Salarial Média verificada nas Empresas Ativas','Valor médio mensal informado.','Resumo das Empresas','BRL','CURRENCY','MONTHLY','AVERAGE','MANUAL_ENTRY','MANUAL','AVERAGE',70,NULL,NULL,FALSE),
('EMPRESAS_PRE_ACELERADAS','Nº de Empresas Pré-Aceleradas','Calculado a partir das empresas em pré-aceleração.','Pré-aceleradora','EMPRESA','INTEGER','MONTHLY','COUNT','SYSTEM_CALCULATION','AUTOMATIC','LAST_VALUE',10,'DEVELOPMENT_COMPANY',NULL,TRUE),
('MIDITEC_ADOTADO','Adotou Metodologia MIDITEC?','Configuração qualitativa do módulo de incubação.','Incubadora','TEXTO','TEXT','ANNUAL','LAST_VALUE','SYSTEM_CALCULATION','AUTOMATIC','LAST_VALUE',90,'CENTER_PROFILE',NULL,TRUE)
ON CONFLICT(code) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,unit=EXCLUDED.unit,
  value_type=EXCLUDED.value_type,periodicity=EXCLUDED.periodicity,aggregation_type=EXCLUDED.aggregation_type,
  default_source_type=EXCLUDED.default_source_type,calculation_type=EXCLUDED.calculation_type,
  annual_aggregation=EXCLUDED.annual_aggregation,sort_order=EXCLUDED.sort_order,
  source_entity=EXCLUDED.source_entity,formula=EXCLUDED.formula,
  not_applicable_allowed=EXCLUDED.not_applicable_allowed,active=TRUE;

UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation=aggregation_type,sort_order=10 WHERE code='NOVAS_STARTUPS';
UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation='LAST_VALUE',sort_order=30 WHERE code='STARTUPS_ATIVAS';
UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation='SUM',sort_order=80 WHERE code='NOVAS_EMPRESAS_ATIVAS';
UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation='LAST_VALUE',sort_order=90 WHERE code='EMPRESAS_ATIVAS_TOTAL';
UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation='SUM',sort_order=100 WHERE code='FATURAMENTO_EMPRESAS';
UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation='SUM',sort_order=110 WHERE code='ARRECADACAO_EMPRESAS';
UPDATE indicator_definitions SET category='Resumo das Empresas',calculation_type='MANUAL',annual_aggregation='LAST_VALUE',sort_order=120 WHERE code='COLABORADORES_EMPRESAS';
UPDATE indicator_definitions SET category='Saúde Financeira',calculation_type='MANUAL',annual_aggregation='SUM',sort_order=10 WHERE code='RECEITA_TOTAL_CENTRO';
UPDATE indicator_definitions SET category='Saúde Financeira',calculation_type='MANUAL',annual_aggregation='SUM',sort_order=20 WHERE code='DESPESAS_TOTAL_CENTRO';
UPDATE indicator_definitions SET name='Resultado Mensal',category='Saúde Financeira',calculation_type='DERIVED',annual_aggregation='DERIVED',aggregation_type='DERIVED',default_source_type='SYSTEM_CALCULATION',formula='RECEITA_TOTAL_CENTRO - DESPESAS_TOTAL_CENTRO',sort_order=30 WHERE code='RESULTADO_ANUAL_CENTRO';
UPDATE indicator_definitions SET category='Saúde Financeira',calculation_type='MANUAL',annual_aggregation='AVERAGE',sort_order=40 WHERE code='DESPESAS_CUSTEADAS_RECEITA_PROPRIA';
UPDATE indicator_definitions SET category='Saúde Financeira',calculation_type='MANUAL',annual_aggregation='LAST_VALUE',sort_order=50 WHERE code='EQUIPE_CENTRO';
UPDATE indicator_definitions SET category='Saúde Financeira',calculation_type='MANUAL',annual_aggregation='AVERAGE',sort_order=60 WHERE code='OCUPACAO_PREDIO';
UPDATE indicator_definitions SET category='Captação de Recursos',calculation_type='MANUAL',annual_aggregation='SUM' WHERE code IN ('PROJETOS_SUBMETIDOS','PROJETOS_GANHOS','VALOR_PROJETOS_GANHOS');
UPDATE indicator_definitions SET category='Visitantes',calculation_type='MANUAL',annual_aggregation='SUM' WHERE code='VISITANTES_CENTRO';
UPDATE indicator_definitions SET category='Capacitações',calculation_type='MANUAL',annual_aggregation='SUM' WHERE code IN ('VALOR_PROJETOS_CAPACITACAO','CAPACITACOES_REALIZADAS','EMPRESAS_CAPACITADAS','PESSOAS_CAPACITADAS');
UPDATE indicator_definitions SET category='Funções',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='FUNCTION' WHERE code='FUNCOES_ATIVAS';
UPDATE indicator_definitions SET category='Programas',calculation_type='AUTOMATIC',annual_aggregation='SUM',default_source_type='SYSTEM_CALCULATION',source_entity='PROGRAM' WHERE code='PROGRAMAS_INICIADOS';
UPDATE indicator_definitions SET category='Eventos',calculation_type='AUTOMATIC',annual_aggregation='SUM',default_source_type='SYSTEM_CALCULATION',source_entity='EVENT' WHERE code='EVENTOS_REALIZADOS';
UPDATE indicator_definitions SET category='Mantenedores',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='MAINTAINER' WHERE code='MANTENEDORES';
UPDATE indicator_definitions SET category='Instituições de Ensino Superior',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='IES' WHERE code IN ('IES_REGIAO','IES_ATENDIDAS');
UPDATE indicator_definitions SET category='Municípios',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='MUNICIPALITY' WHERE code IN ('MUNICIPIOS_REGIAO','MUNICIPIOS_ATENDIDOS');
UPDATE indicator_definitions SET category='Entidades',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='ENTITY' WHERE code IN ('ENTIDADES_REGIAO','ENTIDADES_ATENDIDAS');
UPDATE indicator_definitions SET category='Grandes Empresas',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='LARGE_COMPANY' WHERE code IN ('GRANDES_EMPRESAS_REGIAO','GRANDES_EMPRESAS_ATENDIDAS');
UPDATE indicator_definitions SET category='Pré-incubadora',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='DEVELOPMENT_COMPANY',not_applicable_allowed=TRUE WHERE code='EMPRESAS_PRE_INCUBADAS';
UPDATE indicator_definitions SET category='Incubadora',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='DEVELOPMENT_COMPANY',not_applicable_allowed=TRUE WHERE code='EMPRESAS_INCUBADAS';
UPDATE indicator_definitions SET category='Aceleradora',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='DEVELOPMENT_COMPANY',not_applicable_allowed=TRUE WHERE code='EMPRESAS_ACELERADAS';
UPDATE indicator_definitions SET category='Empresas Residentes',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='RESIDENT_COMPANY' WHERE code='EMPRESAS_RESIDENTES';
UPDATE indicator_definitions SET category='Inovação Aberta',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='OPEN_INNOVATION' WHERE code='GRANDES_EMPRESAS_APOIADAS';
UPDATE indicator_definitions SET category='Diagnóstico do Centro',calculation_type='AUTOMATIC',annual_aggregation='LAST_VALUE',default_source_type='SYSTEM_CALCULATION',source_entity='CENTER_PROFILE' WHERE code IN ('FASE_CENTRO','INSTALACOES_CENTRO','LEI_INOVACAO_EXISTENTE');

ALTER TABLE indicator_values
  ADD COLUMN IF NOT EXISTS innovation_center_id UUID REFERENCES innovation_centers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE indicator_values SET innovation_center_id=(SELECT id FROM innovation_centers WHERE code='CI_JOINVILLE' LIMIT 1)
WHERE innovation_center_id IS NULL;
ALTER TABLE indicator_values ALTER COLUMN innovation_center_id SET NOT NULL;
DROP INDEX IF EXISTS idx_indicator_values_natural_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_indicator_values_natural_key
  ON indicator_values(indicator_id,innovation_center_id,year,COALESCE(month,0),source_type)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_indicator_values_center_period
  ON indicator_values(innovation_center_id,year,month,indicator_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS indicator_applicability (
  innovation_center_id UUID NOT NULL REFERENCES innovation_centers(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES indicator_definitions(id) ON DELETE CASCADE,
  applicable BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(innovation_center_id,indicator_id)
);

CREATE TABLE IF NOT EXISTS indicator_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  innovation_center_id UUID NOT NULL REFERENCES innovation_centers(id) ON DELETE RESTRICT,
  record_type VARCHAR(40) NOT NULL CHECK (record_type IN (
    'FUNCTION','PROGRAM','EVENT','MAINTAINER','IES','MUNICIPALITY','ENTITY','LARGE_COMPANY',
    'DEVELOPMENT_COMPANY','RESIDENT_COMPANY','OPEN_INNOVATION'
  )),
  name VARCHAR(220) NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  event_at TIMESTAMPTZ,
  continuous BOOLEAN NOT NULL DEFAULT FALSE,
  location VARCHAR(220),
  theme VARCHAR(160),
  mode VARCHAR(20) CHECK (mode IS NULL OR mode IN ('PRESENTIAL','ONLINE','HYBRID')),
  subtype VARCHAR(100),
  participants INTEGER CHECK (participants IS NULL OR participants>=0),
  participating_companies INTEGER CHECK (participating_companies IS NULL OR participating_companies>=0),
  municipality VARCHAR(120),
  in_region BOOLEAN,
  served BOOLEAN,
  support_type VARCHAR(160),
  amount NUMERIC(24,4) CHECK (amount IS NULL OR amount>=0),
  contribution_periodicity VARCHAR(40),
  sector VARCHAR(160),
  result TEXT,
  program_name VARCHAR(180),
  development_stage VARCHAR(30) CHECK (development_stage IS NULL OR development_stage IN ('PRE_INCUBATION','PRE_ACCELERATION','INCUBATION','ACCELERATION')),
  collaborators_entry INTEGER CHECK (collaborators_entry IS NULL OR collaborators_entry>=0),
  collaborators_exit INTEGER CHECK (collaborators_exit IS NULL OR collaborators_exit>=0),
  intellectual_property TEXT,
  funds_raised NUMERIC(24,4) CHECK (funds_raised IS NULL OR funds_raised>=0),
  annual_revenue NUMERIC(24,4) CHECK (annual_revenue IS NULL OR annual_revenue>=0),
  international_relationships TEXT,
  challenges INTEGER CHECK (challenges IS NULL OR challenges>=0),
  solutions INTEGER CHECK (solutions IS NULL OR solutions>=0),
  deals INTEGER CHECK (deals IS NULL OR deals>=0),
  year INTEGER CHECK (year IS NULL OR year BETWEEN 2000 AND 2200),
  month SMALLINT CHECK (month IS NULL OR month BETWEEN 1 AND 12),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (continuous OR end_date IS NULL OR start_date IS NULL OR end_date>=start_date)
);

CREATE INDEX IF NOT EXISTS idx_indicator_records_center_type
  ON indicator_records(innovation_center_id,record_type,active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_indicator_records_dates
  ON indicator_records(innovation_center_id,start_date,end_date,event_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_indicator_records_competence
  ON indicator_records(innovation_center_id,year,month,record_type) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_innovation_centers_updated_at ON innovation_centers;
CREATE TRIGGER update_innovation_centers_updated_at BEFORE UPDATE ON innovation_centers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_indicator_records_updated_at ON indicator_records;
CREATE TRIGGER update_indicator_records_updated_at BEFORE UPDATE ON indicator_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
