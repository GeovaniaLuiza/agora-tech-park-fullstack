# Prompt — Indicadores FAPESC/SCTI

Altere a tela `http://localhost:5174/indicators` da Plataforma de Indicadores e Governança do Ágora Tech Park para exibir exclusivamente os indicadores cuja fonte seja a Planilha FAPESC/SCTI.

Requisitos:

- Identificar os registros da fonte pelo valor canônico `FAPESC_SCTI` no backend e no banco de dados.
- Aplicar o filtro de origem no servidor, sem depender apenas de ocultação no frontend.
- Restringir à mesma fonte a lista de períodos, o total exibido no dashboard e as exportações PDF/Excel.
- Exibir na interface o aviso “Fonte: Planilha FAPESC/SCTI”.
- Manter filtros por período, estados de carregamento/erro/vazio e formatação numérica em `pt-BR`.
- Permitir consulta ao Residente, Pesquisador, Gestor e Administrador; manter exportação somente para Pesquisador, Gestor e Administrador.
- Não misturar dados de formulários, fontes legadas ou outras integrações com os dados FAPESC/SCTI.
- Garantir que novos indicadores consolidados destinados a essa tela sejam persistidos com a origem `FAPESC_SCTI`.

Critérios de aceite:

1. Nenhum registro de outra fonte é retornado por `GET /api/indicators`.
2. `GET /api/indicators/history` retorna apenas períodos existentes na fonte FAPESC/SCTI.
3. PDF e Excel contêm exatamente o mesmo recorte exibido na tela.
4. O Residente visualiza os dados públicos, mas não visualiza os botões de exportação.
5. Os testes automatizados e o build de produção são concluídos sem falhas.
