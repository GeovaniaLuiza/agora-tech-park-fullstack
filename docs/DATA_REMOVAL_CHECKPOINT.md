# CHECKPOINT — REMOÇÃO DE DADOS

Revalidado em 10/09/2026. **PARADO, aguardando `APROVADO PARA LIMPEZA DO HISTÓRICO`.**
Nesta execução, nenhum rewrite, commit, push, reset ou alteração remota foi executado.

## Revalidação de 10/09/2026

- `git status`, branch, remotes, últimos dez commits e estatísticas dos diffs
  conferidos. HEAD continua `aeace75a2139cc05a1bfa00d7a3ad23b4a5671be`.
  A exclusão já estava preparada no índice ao início desta execução e foi preservada.
- Havia 15 entradas de alteração: nove arquivos modificados, uma exclusão preparada
  e cinco arquivos não rastreados. Além dos cinco itens indicados na solicitação,
  já existiam alterações nos três scripts de importação/migração, logger,
  requestLogger, fixture de indicadores, AppErrorBoundary, teste de privacidade,
  checkpoint e inventário. Nenhuma dessas alterações foi descartada ou aplicada
  a outro clone.
- Backup dos 14 arquivos presentes e registro da exclusão, com SHA-256 conferido
  após cópia: `C:/Users/geova/AppData/Local/Temp/agora-preserved-1789046571112/`.
  `manifest.json` registra caminhos, hashes e estado inicial. Esse backup captura
  o trabalho recebido nesta execução, antes das atualizações documentais abaixo;
  não contém a planilha removida nem cópia do histórico Git.
- `git ls-remote origin` confirmou as mesmas oito branches, dezenove refs de PR
  e nenhuma tag. API pública confirmou zero forks e PRs #12–#15 abertos.
- Reenumerados os 32 commits do clone de auditoria: 66 pares caminho/blob nas
  extensões solicitadas, todos presentes no inventário; 17 commits contêm o alvo
  e 24 têm assinatura. O blob alvo só aparece no caminho já identificado.
- Leitura em memória reconfirmou 397 células com padrão de e-mail, 17 com CPF
  formatado e 603 com CNPJ formatado. Nenhum valor foi impresso ou exportado.
  As demais contagens e heurísticas abaixo são evidências do inventário anterior,
  cujo conjunto de caminhos/blobs permanece igual.
- Planilha ausente do disco e do índice. Ignore protege as quatro pastas privadas;
  `templates/check.xlsx` e `fixtures/synthetic/check.xlsx` continuam permitidos.
  Call sites de logs revisados; as proteções existentes foram preservadas.
- Verificação atual: **107 testes backend / 22 arquivos aprovados**, lint e
  `git diff --check` aprovados. Integração/produção não executadas.
- `git filter-repo --version` confirma que a ferramenta não está disponível no
  PATH desta sessão. Instalação e validação de versão >= 2.47 continuam pendentes.
- **Divergência documental:** já existia em `%TEMP%/agora-local-clean-20260909/`
  um `validation.json` com mapeamento de SHAs e 32 comparações de árvores de uma
  aparente sanitização anterior. Isso impede afirmar globalmente que nunca houve
  rewrite local. Sua execução/autorização não foi estabelecida nesta sessão;
  o artefato não foi reutilizado nem tratado como validação desta operação.
  O remoto consultado continua com o histórico original. O futuro rewrite deve
  partir de outro clone novo, após a autorização solicitada.

## Preservação e estado atual

- Branch local: `main`; HEAD e origin/main: `aeace75a2139cc05a1bfa00d7a3ad23b4a5671be`.
- Estado inicial: `.gitignore` e `backend/tests/event-import.test.js` modificados;
  planilha excluída no disco; `docs/CONFORMIDADE_TCC.md` e
  `docs/SECURITY_DATA_REMOVAL.md` não rastreados.
- Cópias originais e manifesto SHA-256 em
  `C:/Users/geova/AppData/Local/Temp/agora-local-preserved-20260909/`.
  O patch preserva somente as modificações textuais; a exclusão tem registro separado.
  Não há cópia da planilha nesse backup de trabalho.
- Os hashes do teste preexistente e da matriz de conformidade continuam iguais.
  As regras originais do ignore foram preservadas e ampliadas.
- A exclusão da planilha foi preparada no índice com `git rm --cached`.
  Ela está ausente do disco e do índice; HEAD e o remoto ainda a contêm.
  É necessário publicar posteriormente a exclusão e as proteções locais.
- Auditoria remota em clone bare independente:
  `C:/Users/geova/AppData/Local/Temp/agora-data-audit-20260909.git`.
  Esse clone contém o histórico contaminado; não publicar, sincronizar ou usar como fixture.
  Ele não recebeu alterações do working copy e não será reutilizado para rewrite.

## Arquivos e natureza do risco

Inventário detalhado: [DATA_REMOVAL_INVENTORY.json](DATA_REMOVAL_INVENTORY.json).
Foram enumerados todos os commits e árvores das refs anunciadas no clone remoto,
arquivos locais fora de dependências/builds e extensões XLSX, XLS, CSV, ODS, JSON,
SQL e ZIP. Não foram encontrados XLS, CSV, ODS ou ZIP nessas árvores de projeto.
O inventário registra versões por blob e os commits que as contêm, sem valores pessoais.

| Arquivo | Commit de inclusão / evidência | Padrões aproximados | Avaliação |
|---|---|---|---|
| `frontend/imgs/Locatários Perini Business 2026.xlsx` | `55faededae3cf1dd10dd3afc47ed3a1d2c8628c3` | XML: 251 e-mails, 15 CPF, 477 CNPJ, 129 telefones; células resolvidas: 397 com e-mail, 17 com CPF formatado, 603 com CNPJ formatado | Dataset operacional alvo da remoção; presença estrutural de campos nome, telefone, e-mail e CNPJ |
| `frontend/imgs/Indicadores Rede de Centros de Inovação 2025_Joinville.xlsx` | `98d3e766b28aeac9f24c34b663e9f4c6f1b2e7e7` | 19 padrões de 11 dígitos, todos dentro de números decimais/científicos; zero CPF formatado/e-mail/CNPJ | Não classificar os 19 como CPF; conteúdo institucional preenchido requer revisão de proveniência |
| `frontend/imgs/Indicadores Rede de Centros de Inovação 2026_Joinville.xlsx` | `cf94dc6015bc5a034080391bad98168402e2cc17` | Zero padrões e-mail/CPF/CNPJ/telefone na varredura | Fonte institucional usada pela aplicação; preservada |
| `frontend/imgs/estatisticas.xlsx` | `55faededae3cf1dd10dd3afc47ed3a1d2c8628c3` | Zero padrões e-mail/CPF/CNPJ/telefone na varredura | Preservada; ausência de regex não certifica anonimização |
| `database/seed.sql` | Commits listados no inventário | 4 e-mails, 4 CNPJ, 115 correspondências amplas de telefone | Seed exige revisão de proveniência; regex pode confundir datas/números com telefones; não confirmado como dataset real nem certificado como sintético |
| `backend/package-lock.json` | Versões listadas no inventário | Até 1 e-mail por versão | Metadados de dependência; não excluir lockfile por regex |
| `database/migrations/011_dashboard_institutional_indicators.sql` | Commits listados no inventário | 2 correspondências amplas de telefone | Não comprova contato pessoal; migração preservada |

As contagens XML incluem shared strings uma vez; as contagens de células resolvem
referências e contam usos repetidos. Não representam pessoas distintas.
Heurística conservadora de nomes compostos: 153 células na planilha alvo;
heurística de endereço (Rua/Avenida/Rodovia/CEP): zero. Na fonte 2025 há 225
correspondências de nome composto e 2 de endereço; nas fontes 2026/estatísticas,
25/18 de nome composto. Títulos, empresas e categorias também satisfazem essas
heurísticas. Nenhuma delas confirma nome completo de pessoa nem endereço pessoal.
Não foi feita consulta de titulares ou validação externa de identidades.
**Padrão detectado não equivale a dado pessoal confirmado.** A autenticidade e
proveniência dos registros permanecem pendentes; a planilha alvo é tratada
preventivamente como exposição. Não há liberação geral de conformidade.

Um único caminho histórico foi localizado para o blob alvo
`54b236f1796d100c64259e54bfff3d43854005b5`, incluindo busca em caminhos sem extensão.
Não se encontrou rename da planilha alvo. A substituição de indicadores 2025 por
2026 é outro arquivo, não um rename do dataset de locatários.

## Impacto antes do rewrite

- **Primeiro commit que introduz o arquivo:** `55faededae3cf1dd10dd3afc47ed3a1d2c8628c3`.
- **First Changed Commit:** ainda não existe saída da ferramenta. Estimativa:
  `e77bb373c778e40dedffa0e40eab7220c4d3ed7b`, pois o commit raiz é assinado.
  Confirmar pela saída real, nunca enviar a estimativa ao Support como resultado.
- **Branches contendo o dataset:** `main`, `GLF-Frontend-Tela_importar_residentes`,
  `dependabot/github_actions/github-actions-4717a0affd`,
  `dependabot/npm_and_yarn/backend/backend-dependencies-56b52bfd91`,
  `dependabot/npm_and_yarn/frontend/frontend-dependencies-47b67a8480`,
  `dependabot/npm_and_yarn/root-dependencies-b599029903`.
- **Outras branches remotas:** `Frontend-GLF1`, `Frontend-GLF2`. Também podem mudar
  pela remoção de assinaturas anteriores. A branch apenas local `Frontend-GLF3`
  permanece preservada no working copy, fora do clone remoto.
- **Tags:** nenhuma anunciada pelo remoto.
- **PRs diretamente alcançados:** #8–#15; #12–#15 abertos, #8–#11 fechados.
  PR #8 foi mesclado. Refs de merge anunciadas: #12–#15.
  Com a remoção de assinaturas desde a raiz, os quinze PRs #1–#15 podem ter SHAs/diffs
  alterados. A lista exata virá de `filter-repo/changed-refs`.
- **Forks:** API pública informa zero e lista vazia; não demonstra ausência de
  clones, downloads ou cópias privadas.
- **LFS:** nenhum pointer encontrado na inspeção de blobs pequenos alcançáveis;
  confirmar também o relatório de objetos órfãos da ferramenta após rewrite.
- **Commits:** 32 alcançáveis nas refs remotas; 17 afetados pelo arquivo e descendência.
  Há 24 commits com assinatura, incluindo a raiz. Estimativa conservadora: os **32**
  SHAs podem mudar pela remoção de assinaturas e propagação aos descendentes.
- **Histórico:** assinaturas serão perdidas, links por SHA e diffs/comentários de PR
  podem ficar inválidos. Quantidade final exige o `commit-map` real.
- **Colaboradores:** congelar escrita durante a operação; depois reclonar e reaplicar
  apenas patches revisados. Não fazer merge/push de branches antigas contaminadas.
  Nenhuma mensagem foi enviada a colaboradores nem chamado aberto nesta fase.

## Correções locais e validação

- Ignore específico de locatários mantido; `data/private/`, `uploads/`, `tmp/` e
  `backups/` protegidos. `templates/` e `fixtures/synthetic/` continuam versionáveis.
- Nenhuma dependência de leitura do arquivo de locatários encontrada. O parser recebe
  upload; o nome da aba é contrato de formato, não caminho para o arquivo real.
- Fixture XLSX existente é gerada em memória; documentos substituídos por sequências
  deliberadamente inválidas. Não foi necessário criar outra planilha em disco.
- Redaction anterior preservada e ampliada. Erros são serializados sem mensagem,
  stack ou detalhes originais; `msg` é ocultado porque Pino pode derivá-lo do erro.
  Logs de importação não imprimem resultado/payload; falhas CLI e de interface
  não imprimem erros brutos. Logs HTTP omitem URL/path e geram request ID próprio.
  Isso reduz o detalhe diagnóstico; eventos, método, status e correlação permanecem.
- Não há garantia de redaction para qualquer futuro objeto arbitrário ou log externo.
  Novos call sites devem usar metadados permitidos, nunca payloads ou contatos.
- Backend: 106 testes existentes passaram; após as últimas mudanças, seis testes
  focados (privacidade, residentes, observabilidade) passaram.
- Lint e `git diff --check` passaram. Ignore foi verificado com caminhos privados
  e caminhos permitidos. Não existe teste específico AppErrorBoundary encontrado;
  essa consulta não é contada como teste aprovado. Integração/produção não executadas.

## Comando proposto — NÃO EXECUTADO

GitHub exige `git-filter-repo` **2.47 ou superior** para `--sensitive-data-removal`.
A ferramenta não está instalada; compatibilidade local ainda não foi validada.
Após autorização, instalar versão compatível em ambiente dedicado e conferir
versão instalada e presença do argumento no help. Não executar no working copy
nem no clone de auditoria; criar outro clone novo em diretório privado aprovado.

```powershell
git clone --mirror https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git agora-sanitizacao.git
Set-Location agora-sanitizacao.git
git filter-repo --version
git filter-repo -h
git filter-repo --sensitive-data-removal --invert-paths --path 'frontend/imgs/Locatários Perini Business 2026.xlsx'
```

Antes do comando, atualizar o inventário: adicionar um `--path` para cada novo
caminho comprovado e revisar qualquer mudança de refs. Se outro dataset real for
confirmado, ampliar o plano e o checkpoint antes da execução. Não usar `--refs`
para restringir inadvertidamente a limpeza, nem `--force` para contornar clone usado.

## Procedimento de validação e publicação futura

1. Registrar refs/SHAs remotos antes da operação e compará-los novamente antes
   de qualquer publicação; parar se houve escrita concorrente.
2. Executar `git fsck --full`. Enumerar todos os commits/árvores reescritos e verificar
   ausência do caminho e de todos os blobs contaminados, inclusive cópias renomeadas.
   Não basta verificar só a árvore de main ou o nome do arquivo.
3. Conferir `filter-repo/commit-map`, `changed-refs`, First Changed Commit(s) e LFS.
   Em clone bare esses relatórios ficam sob `filter-repo/`, sem prefixo `.git/`.
4. Comparar árvores antigas e novas: diferenças esperadas limitadas aos caminhos
   removidos. Validar templates oficiais, importações sintéticas e testes em checkout
   limpo do resultado. Não copiar automaticamente as alterações locais preservadas.
5. Apresentar resultados reais e plano explícito de atualização de cada branch/tag,
   com SHAs esperados, proteções/rulesets e recuperação revisados. **Sem push nesta fase.**
   Qualquer publicação exige confirmação do escopo; não executar mirror/force genérico.
6. PR refs são somente leitura no GitHub. Após publicação autorizada, tratar refs de
   PR, caches e garbage collection via GitHub Support, fornecendo os resultados reais.
   Tratar forks caso apareçam. Um push não apaga clones e cópias existentes.
7. Reaplicar por revisão as proteções locais em clone limpo, publicar por fluxo
   autorizado e confirmar que novo clone remoto não recupera os blobs pelas refs
   acessíveis. Revisar também releases/artifacts e outros canais, ainda não auditados.

## Procedimento de recuperação

Antes de publicar: abandonar o resultado do clone de sanitização em caso de falha;
o remoto e o working copy permanecem intactos. Refazer em novo clone após corrigir
o plano. Guardar mapas e inventários sem dados pessoais.

Trabalho local: recuperar seletivamente os arquivos do backup e conferir hashes;
preservar a exclusão registrada. Não aplicar patch ou restaurar tudo cegamente.
O diretório temporário pode ser limpo pelo sistema; verificar preservação antes
de iniciar a próxima fase. Se for exigida retenção de histórico contaminado,
usar armazenamento privado criptografado, com acesso e prazo definidos.

Após publicação: não restaurar o histórico contaminado no remoto. Corrigir a partir
do histórico limpo; qualquer recuperação extraordinária precisa de decisão explícita
e avaliação da reexposição. Encerrar retenção dos clones contaminados conforme o
procedimento aprovado, sem apagar o working copy preexistente automaticamente.

## Fontes

- [Playbook Web Apps](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md): exposição de dados sensíveis consta entre condições impeditivas.
- [GitHub — Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository): clone dedicado, flag de remoção sensível, assinaturas, PRs e tratamento de caches.

Este checkpoint complementa o registro anterior de incidente e prevalece sobre
seu roteiro operacional antigo. Aguardando **APROVADO PARA LIMPEZA DO HISTÓRICO**.
