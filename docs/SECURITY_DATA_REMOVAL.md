# Remoção de dados pessoais do histórico Git

## Estado do incidente

Em 04/09/2026, a auditoria identificou padrões compatíveis com e-mail e CPF/CNPJ no arquivo operacional `frontend/imgs/Locatários Perini Business 2026.xlsx`. O conteúdo não foi reproduzido nos relatórios.

O arquivo foi removido da árvore de trabalho e seu padrão foi incluído no `.gitignore`. Ele continua recuperável no commit `55faede` e no objeto Git `54b236f1796d100c64259e54bfff3d43854005b5` pelas refs históricas de PR identificadas na validação de 05/10/2026; a pendência server-side exige avaliação/purge pelo GitHub Support.

## Validação técnica de 05/10/2026 — Issue #37 / SEC-01

- **Arquivo sensível:** `frontend/imgs/Locatários Perini Business 2026.xlsx`.
- **Introdução:** commit `55faede`, mensagem "Tela de importar planilha de residentes no frontend".
- **Remoção da árvore atual:** commit `7af0840`, mensagem "chore: align AWS production architecture and CI validation".
- **Main atual: saneada quanto ao arquivo alvo.** A árvore atual de `origin/main` não contém mais o arquivo; isso não comprova a sanitização de todas as refs históricas.
- **Blob histórico identificado:** `54b236f1796d100c64259e54bfff3d43854005b5`.
- **Refs históricas de PR:** a auditoria de refs remotas confirmou que `55faede` continua alcançável, incluindo `refs/pull/8/head` até `refs/pull/29/head`.
- **SEC-01: pendente.** Essas refs de Pull Request são mantidas server-side pelo GitHub e exigem avaliação/purge pelo GitHub Support. O encerramento depende de confirmação/remoção server-side pelo Support; a sanitização LGPD não está concluída.

Este registro atualiza o estado do incidente e prevalece sobre descrições anteriores do estado atual. Os checkpoints e procedimentos de setembro permanecem como histórico. Nenhum conteúdo da planilha ou dado pessoal é reproduzido nesta validação.

## Impacto

- O repositório é público, portanto o arquivo histórico deve ser tratado como potencialmente exposto.
- A reescrita altera os hashes dos commits alcançáveis.
- Clones, forks, caches e downloads existentes não são eliminados pela reescrita.
- Todos os colaboradores deverão sincronizar novamente seus clones após a operação.

## Pré-condições

- [ ] Confirmar com o responsável pelos dados se os registros são reais e pessoais.
- [ ] Registrar internamente o incidente e avaliar obrigações de comunicação segundo a política institucional/LGPD.
- [ ] Informar todos os colaboradores sobre a janela de manutenção.
- [ ] Suspender merges e pushes durante a limpeza.
- [ ] Obter autorização explícita para reescrever o histórico e para executar o push forçado.
- [ ] Criar um backup privado e criptografado do repositório, se exigido pela política institucional.
- [ ] Instalar e validar `git-filter-repo` em um clone descartável e exclusivo para a operação.

## Procedimento preparado — não executado

Executar em um clone novo, fora de qualquer diretório de trabalho ativo:

```powershell
git clone --mirror https://github.com/GeovaniaLuiza/agora-tech-park-fullstack.git agora-tech-park-sanitizacao.git
Set-Location agora-tech-park-sanitizacao.git
git filter-repo --sensitive-data-removal --path 'frontend/imgs/Locatários Perini Business 2026.xlsx' --invert-paths
git log --all -- 'frontend/imgs/Locatários Perini Business 2026.xlsx'
git rev-list --all --objects | Select-String -SimpleMatch 'Locatários Perini Business 2026.xlsx'
```

Os dois últimos comandos devem produzir saída vazia. O push remoto não faz parte deste procedimento local e não deve ser executado sem um checkpoint independente.

## Checkpoint de push futuro

Quando a sanitização local for validada, será necessária autorização separada para atualizar as referências remotas com `--force-with-lease`. Antes disso, confirmar branch padrão, branches protegidas, tags e pull requests abertas. Nunca usar `git push --force` indiscriminadamente.

## Validação posterior

- [ ] Nome e objeto ausentes de todas as referências Git alcançáveis.
- [ ] Arquivo ausente da árvore da branch principal.
- [ ] Repositório ainda público após a sanitização.
- [ ] CI executado novamente com sucesso.
- [ ] Colaboradores orientados a descartar clones antigos.
- [ ] Planilhas de demonstração contêm apenas dados sintéticos e claramente identificados.
- [ ] Nenhum dado pessoal aparece em releases, artifacts, issues, Wiki ou documentação.



## Checkpoint revalidado em 10/09/2026

O plano operacional atualizado está em [DATA_REMOVAL_CHECKPOINT.md](DATA_REMOVAL_CHECKPOINT.md), com inventário agregado, preservação local, impacto das assinaturas e validações. Esse checkpoint prevalece sobre o procedimento antigo acima. Nesta execução não houve rewrite nem push; artefatos de uma aparente sanitização local anterior foram encontrados e estão registrados no checkpoint. Aguarda-se `APROVADO PARA LIMPEZA DO HISTÓRICO`. Usar versão >= 2.47, clone novo e validar todos os caminhos/blobs e refs; as duas buscas de nome acima, isoladamente, não comprovam a limpeza completa.
