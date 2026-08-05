CREATE TABLE IF NOT EXISTS indicator_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('NUMBER', 'CURRENCY', 'PERCENT', 'TEXT', 'JSON')),
  periodicity VARCHAR(20) NOT NULL CHECK (periodicity IN ('MONTHLY', 'ANNUAL', 'EVENT')),
  aggregation_type VARCHAR(30) NOT NULL CHECK (aggregation_type IN ('SUM', 'AVERAGE', 'COUNT', 'LAST_VALUE', 'MAX', 'MIN', 'PERCENT', 'ACCUMULATED', 'CALCULATED', 'MANUAL')),
  default_source_type VARCHAR(30) NOT NULL DEFAULT 'SPREADSHEET_IMPORT'
    CHECK (default_source_type IN ('SPREADSHEET_IMPORT', 'FORM_RESPONSE', 'MANUAL_ENTRY', 'SYSTEM_CALCULATION')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spreadsheet_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  file_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('VALIDATED', 'IMPORTED', 'FAILED')),
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_hash, sheet_name, year, status)
);

CREATE TABLE IF NOT EXISTS indicator_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES indicator_definitions(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  month SMALLINT CHECK (month BETWEEN 1 AND 12),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  numeric_value NUMERIC(24,4),
  text_value TEXT,
  json_value JSONB,
  source_type VARCHAR(30) NOT NULL
    CHECK (source_type IN ('SPREADSHEET_IMPORT', 'FORM_RESPONSE', 'MANUAL_ENTRY', 'SYSTEM_CALCULATION')),
  source_id UUID,
  spreadsheet_import_id UUID REFERENCES spreadsheet_imports(id) ON DELETE RESTRICT,
  consolidated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (num_nonnulls(numeric_value, text_value, json_value) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_indicator_values_natural_key
  ON indicator_values (
    indicator_id,
    year,
    COALESCE(month, 0),
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_type
  );
CREATE INDEX IF NOT EXISTS idx_indicator_values_dashboard
  ON indicator_values (year, month, indicator_id, source_type);
CREATE INDEX IF NOT EXISTS idx_indicator_definitions_active_category
  ON indicator_definitions (active, category, code);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_imports_hash
  ON spreadsheet_imports (file_hash, sheet_name, year);

CREATE TABLE IF NOT EXISTS question_indicator_links (
  question_id UUID PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES indicator_definitions(id) ON DELETE RESTRICT,
  aggregation_type VARCHAR(30) NOT NULL,
  periodicity VARCHAR(20) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_indicator_definitions_updated_at ON indicator_definitions;
CREATE TRIGGER update_indicator_definitions_updated_at BEFORE UPDATE ON indicator_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_indicator_values_updated_at ON indicator_values;
CREATE TRIGGER update_indicator_values_updated_at BEFORE UPDATE ON indicator_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_question_indicator_links_updated_at ON question_indicator_links;
CREATE TRIGGER update_question_indicator_links_updated_at BEFORE UPDATE ON question_indicator_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
