-- Extend the shared catalog without changing existing IDs, status or associations.
-- Match names as well as codes because centers may already have been registered manually.
INSERT INTO innovation_centers(code,name,municipality,state)
SELECT catalog.code,catalog.name,catalog.municipality,'SC'
FROM (VALUES
  ('CI_FLORIANOPOLIS','Centro de Inovação de Florianópolis','Florianópolis'),
  ('SCTI_FLORIANOPOLIS','Secretaria de Estado da Ciência, Tecnologia e Inovação (SCTI) – Florianópolis','Florianópolis'),
  ('CI_BLUMENAU','Centro de Inovação de Blumenau','Blumenau'),
  ('CI_BRUSQUE','Centro de Inovação de Brusque','Brusque'),
  ('CI_CACADOR','Centro de Inovação de Caçador','Caçador'),
  ('CI_CHAPECO','Centro de Inovação de Chapecó','Chapecó'),
  ('CI_CRICIUMA','Centro de Inovação de Criciúma','Criciúma'),
  ('CI_ITAJAI','Centro de Inovação de Itajaí','Itajaí'),
  ('CI_JARAGUA_DO_SUL','Centro de Inovação de Jaraguá do Sul','Jaraguá do Sul'),
  ('CI_JOACABA','Centro de Inovação de Joaçaba','Joaçaba'),
  ('CI_JOINVILLE','Centro de Inovação de Joinville','Joinville'),
  ('CI_LAGES','Centro de Inovação de Lages','Lages'),
  ('CI_RIO_DO_SUL','Centro de Inovação de Rio do Sul','Rio do Sul'),
  ('CI_SAO_BENTO_DO_SUL','Centro de Inovação de São Bento do Sul','São Bento do Sul'),
  ('CI_TUBARAO','Centro de Inovação de Tubarão','Tubarão'),
  ('CI_VIDEIRA','Centro de Inovação de Videira','Videira')
) AS catalog(code,name,municipality)
WHERE NOT EXISTS (
  SELECT 1 FROM innovation_centers existing
  WHERE existing.code=catalog.code
     OR lower(btrim(existing.name))=lower(btrim(catalog.name))
)
ON CONFLICT(code) DO NOTHING;
