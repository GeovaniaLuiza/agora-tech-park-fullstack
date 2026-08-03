-- Insert users (password is '12345678' hashed with bcrypt)
INSERT INTO users (id, name, email, password_hash, role, status, email_verified_at) VALUES 
('11111111-1111-1111-1111-111111111111', 'Marina Ribeiro', 'marina@agoratechpark.com.br', '$2a$10$X4hOPFquUUx7mrsNHSLlOOTtAdWfvsergWSjX/Nh.g.dCI0vfwptq', 'PESQUISADOR', 'ACTIVE', NOW()),
('22222222-2222-2222-2222-222222222222', 'Geovania Francisco', 'geovania.francisco@agoratechpark.com.br', '$2a$10$X4hOPFquUUx7mrsNHSLlOOTtAdWfvsergWSjX/Nh.g.dCI0vfwptq', 'ADMIN', 'ACTIVE', NOW()),
('33333333-3333-3333-3333-333333333333', 'João Silva', 'joao@agoratechpark.com.br', '$2a$10$X4hOPFquUUx7mrsNHSLlOOTtAdWfvsergWSjX/Nh.g.dCI0vfwptq', 'GESTOR', 'ACTIVE', NOW()),
('44444444-4444-4444-4444-444444444444', 'Ana Costa', 'ana@agoratechpark.com.br', '$2a$10$X4hOPFquUUx7mrsNHSLlOOTtAdWfvsergWSjX/Nh.g.dCI0vfwptq', 'RESIDENTE', 'ACTIVE', NOW())
ON CONFLICT (email) DO NOTHING;

-- Insert organizations
INSERT INTO organizations (id, name, cnpj) VALUES 
('55555555-5555-5555-5555-555555555555', 'Marina Tech Solutions', '00000000000100'),
('66666666-6666-6666-6666-666666666666', 'InovaTech LTDA', '00000000000200'),
('77777777-7777-7777-7777-777777777777', 'DataSoft Solutions', '00000000000300'),
('88888888-8888-8888-8888-888888888888', 'CloudTech Brasil', '00000000000400')
ON CONFLICT (cnpj) DO NOTHING;

-- Insert user-organization relationships
INSERT INTO users_organizations (user_id, organization_id) VALUES 
('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555'),
('33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666'),
('44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777')
ON CONFLICT DO NOTHING;

-- Insert forms
INSERT INTO forms (id, title, description, start_date, end_date, status, created_by) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Indicadores trimestrais Q1/2026', 'Preencha os indicadores do período de janeiro a março de 2026.', '2026-01-01', '2026-03-31', 'ACTIVE', '11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Censo de colaboradores 2025', 'Levantamento anual de colaboradores das empresas residentes.', '2025-01-01', '2025-12-31', 'CLOSED', '11111111-1111-1111-1111-111111111111'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Mapeamento de captação e investimento', 'Mapeamento de rodadas de investimento e captação de recursos.', '2026-09-01', '2026-09-15', 'ACTIVE', '11111111-1111-1111-1111-111111111111'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Indicadores ESG', 'Coleta de indicadores ambientais, sociais e de governança.', NULL, NULL, 'DRAFT', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Insert questions
INSERT INTO questions (id, form_id, label, type, required) VALUES 
('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Número de colaboradores', 'NUMBER', true),
('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Faturamento do trimestre (R$)', 'DECIMAL', true),
('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Projetos ativos no trimestre', 'NUMBER', true),
('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Estágio atual', 'OPTION', true),
('10000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Eventos realizados / participados', 'TEXT', false)
ON CONFLICT DO NOTHING;

-- Insert question options (for the OPTION type question)
INSERT INTO question_options (id, question_id, value) VALUES 
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Ideação'),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'MVP'),
('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'Tração'),
('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Escala')
ON CONFLICT DO NOTHING;

-- Insert responses (response headers)
INSERT INTO responses (id, form_id, organization_id, answered_by) VALUES 
('30000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444'),
('aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;

-- Insert answers (individual responses)
INSERT INTO answers (id, response_id, question_id, value) VALUES 
('11111111-1111-1111-1111-222222222222', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12'),
('22222222-2222-2222-2222-333333333333', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '482000.00'),
('33333333-3333-3333-3333-444444444444', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '7'),
('44444444-4444-4444-4444-555555555555', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Tração'),
('55555555-5555-5555-5555-666666666666', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Demo Day Ágora · Meetup React Joinville · Workshop ESG')
ON CONFLICT DO NOTHING;

-- Insert indicators (calculated indicators)
INSERT INTO indicators (id, name, value, period) VALUES 
('66666666-6666-6666-6666-777777777777', 'Faturamento agregado', 64200000.00, '2026-Q1'),
('77777777-7777-7777-7777-888888888888', 'Colaboradores no parque', 340.00, '2026-Q1'),
('88888888-8888-8888-8888-999999999999', 'Projetos ativos total', 156.00, '2026-Q1'),
('99999999-9999-9999-9999-aaaaaaaaaaaa', 'Eventos realizados', 24.00, '2026-Q1')
ON CONFLICT (name, period) DO NOTHING;

-- Insert audit logs
INSERT INTO audit_logs (id, user_id, action, entity) VALUES 
('aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'CREATE', 'form'),
('bbbbbbbb-bbbb-bbbb-bbbb-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'SUBMIT', 'response'),
('cccccccc-cccc-cccc-cccc-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'UPDATE', 'indicator')
ON CONFLICT DO NOTHING;
