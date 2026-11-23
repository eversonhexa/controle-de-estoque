# Registro de decisões técnicas

A especificação (item 19) pede que inconsistências e decisões não especificadas sejam registradas. Este documento reúne essas decisões.

## 1. Inconsistências da especificação e como foram resolvidas

| # | Ponto da especificação | Problema | Decisão |
|---|---|---|---|
| 1 | Perfil Solicitante vê "requisições do próprio setor" (4.1) | A tabela `usuarios` não tinha vínculo com setor | Foi criado `usuarios.setor_id`, obrigatório para o perfil Solicitante (validado no backend). O solicitante sempre registra requisições para o próprio setor, mesmo que envie outro `setor_id`. |
| 2 | "Situação do documento" (5.1, 7.1) | A especificação não lista os valores possíveis | `RASCUNHO` → `EFETIVADO` → `ESTORNADO`. Só a efetivação altera saldo. Um documento estornado continua no histórico. |
| 3 | "Saldo após a operação" no extrato (8.1) | Não havia onde guardar esse valor | Foi criado `documento_itens.saldo_apos`, gravado na efetivação sob `SELECT ... FOR UPDATE`. O valor fica exato mesmo com operações simultâneas. |
| 4 | Unidade no item da requisição (6.2) | A tabela `requisicao_itens` não tem esse campo | A unidade é fixa por mercadoria e vem do cadastro. Os itens dos documentos de estoque guardam uma cópia (`unidade_medida_id`). A unidade de uma mercadoria não pode ser trocada depois que ela é movimentada ou requisitada. |
| 5 | `ESTORNO_AJUSTE` (10.1) | O tipo não indica o sentido do movimento | Foi criada a coluna `documentos_estoque.sentido` (+1 aumenta o saldo, −1 reduz) em todos os documentos. O estorno usa o sentido inverso ao do original. A coluna também simplifica extratos e relatórios. |
| 6 | Ajuste com "Mercadoria" no singular (9.1) × modelo com vários itens | Divergência entre o texto e o modelo | O ajuste aceita vários itens, todos com a mesma natureza (`AJUSTE_ENTRADA` ou `AJUSTE_SAIDA`). |
| 7 | Requisição PARCIAL que nunca será completada | A especificação não prevê como encerrá-la | Foi criada a situação **`ENCERRADA`**: o almoxarife encerra uma requisição PARCIAL informando um motivo, e o saldo pendente deixa de ser exigível. Decisão confirmada com o usuário. |
| 8 | Ajustes "conforme autorização" (4.1) | Quem autoriza não foi definido | O almoxarife cria e efetiva ajustes e estornos. Decisão confirmada com o usuário. Para separar essas funções no futuro, basta ajustar `ajustes.gerenciar` em `utils/permissoes.js`. |
| 9 | Perfil "Consulta" com "relatórios autorizados" | Não há granularidade definida | O perfil Consulta acessa todas as consultas de estoque, documentos, requisições e relatórios, mas não altera nada. |
| 10 | Mercadorias: "não permitir exclusão física" | — | Não existe rota `DELETE` para mercadorias nem para os demais cadastros. Registros sem uso são inativados. |
| 11 | "connect-session-sequelize" citado (3.1) | A própria especificação diz que essa biblioteca não se aplica | Foi usado `express-mysql-session`, que guarda as sessões na tabela `sessoes`, criada automaticamente. |

## 2. Integridade das movimentações

- **Um único ponto altera saldo:** `services/movimentacaoService.js` (`aplicarMovimentos`). Não existe endpoint genérico de saldo, e um teste automatizado garante isso.
- **Bloqueio pessimista:** cada saldo é lido com `SELECT ... FOR UPDATE`. Quando há várias mercadorias, os bloqueios seguem a ordem crescente de `mercadoria_id`, o que evita deadlocks.
- **Ordem de bloqueio:** documento → requisição → saldos. Na saída, o bloqueio da requisição serializa entregas simultâneas da mesma requisição e impede que a soma das entregas ultrapasse o solicitado.
- **Defesa em profundidade:** além das validações no serviço, o banco tem `CHECK (quantidade_atual >= 0)`, `CHECK (quantidade > 0)`, uma restrição que exige requisição em saídas e uma `UNIQUE` em `documento_origem_id`, que impede estornar o mesmo documento duas vezes.
- **Duplicidade:** a efetivação bloqueia o documento e confere se ele ainda está em `RASCUNHO`. Uma segunda chamada (duplo clique ou reenvio) recebe `409`. O frontend também desabilita o botão durante o envio.
- **Auditoria transacional:** os registros de auditoria das movimentações são gravados na mesma transação. Se a operação falha, nada fica registrado como se tivesse ocorrido.
- **Quantidades decimais:** as quantidades usam `DECIMAL(12,3)`. As comparações no JavaScript são feitas em milésimos inteiros (`utils/quantidade.js`), o que evita erros de ponto flutuante.

## 3. Regras de requisição

- A **aprovação não baixa o estoque**. A baixa só acontece quando a saída é efetivada.
- **Entregue** é a soma das saídas `EFETIVADO`. Saídas estornadas (`ESTORNADO`) não contam. **Pendente** é o solicitado menos o entregue.
- A situação é recalculada automaticamente a cada saída e a cada estorno de saída: sem entrega → `APROVADA`, entrega parcial → `PARCIAL`, tudo entregue → `ATENDIDA`. Se uma saída de uma requisição ATENDIDA for estornada, a requisição volta para PARCIAL ou APROVADA.
- **Cancelamento:**
  - o solicitante cancela enquanto a requisição está `PENDENTE`;
  - o almoxarifado cancela também uma requisição `APROVADA`, desde que não haja nenhuma entrega efetivada.
- Rejeitar, cancelar e encerrar exigem motivo.
- Uma requisição não pode ser cancelada nem encerrada enquanto houver saída em rascunho vinculada a ela.
- A requisição pode ser registrada mesmo sem saldo disponível. O saldo é conferido na entrega.

## 4. Numeração

O formato é `PREFIXO-ANO-SEQUENCIAL`, com sequência reiniciada a cada ano:

| Prefixo | Documento |
|---|---|
| `ENT` | Entrada |
| `SAI` | Saída |
| `AJU` | Ajuste |
| `EST` | Estorno |
| `REQ` | Requisição |

A numeração usa a tabela `numeradores`, com `INSERT ... ON DUPLICATE KEY UPDATE`, que é atômico. O número é gerado já no rascunho. Rascunhos excluídos deixam lacunas na sequência, e isso é esperado: a auditoria registra a exclusão.

## 5. Segurança

- **Senhas:**
  - armazenadas com bcrypt (custo configurável, padrão 12);
  - política mínima de 8 caracteres, com letras e números;
  - o login inválido leva o mesmo tempo e devolve a mesma mensagem, exista o usuário ou não.
- **Sessões:**
  - cookie `httpOnly`, `SameSite=Strict` e `secure` em produção;
  - o ID da sessão é regenerado no login;
  - a sessão expira por inatividade;
  - o usuário é recarregado do banco a cada requisição, então uma inativação tem efeito imediato.
- **CSRF:** um token é gerado por sessão e enviado no cabeçalho `X-CSRF-Token` em toda requisição que altera dados. O login fica de fora porque ainda não existe sessão; ele é protegido pelo `SameSite` e pela limitação de tentativas.
- **XSS:**
  - CSP restritiva via helmet (`script-src 'self'`, sem scripts inline);
  - todo texto vindo do servidor passa por `Util.esc()` antes de entrar no HTML.
- **SQL injection:** as consultas são sempre parametrizadas. Nomes de tabelas e colunas dinâmicos vêm apenas de configuração interna, nunca da requisição.
- **Limitação de tentativas:** login (10 a cada 15 minutos por IP) e API em geral.
- **Proteção do administrador:** um administrador não pode inativar o próprio usuário, e o sistema não pode ficar sem nenhum administrador ativo.
- **Bootstrap local:** Bootstrap e Bootstrap Icons são servidos localmente a partir do `node_modules`. O sistema funciona em rede interna sem internet e respeita a CSP.

## 6. Interface

- O frontend é composto por páginas HTML estáticas que consomem a API e são servidas pelo próprio Express (mesma origem, sem CORS).
- O layout (menu e barra superior) é montado por `components/layout.js` conforme as permissões.
- A tela de cadastros é genérica (`pages/cadastro.html?c=...`) e serve mercadorias, categorias, unidades, setores, fornecedores, usuários e perfis.
- Os relatórios são exportados para Excel com **exceljs** e para PDF com **pdfkit**, no backend. Decisão confirmada com o usuário.
- O detalhe de cada documento tem uma opção de impressão de comprovante, com espaço para as assinaturas do almoxarifado e do recebedor.

## 7. Evoluções previstas pela arquitetura

| Evolução | Ponto de extensão |
|---|---|
| Múltiplos almoxarifados | Adicionar `almoxarifado_id` em `documentos_estoque` e `estoque_saldos` (UNIQUE composto). A lógica de movimentação já está concentrada em um único serviço. |
| Custo médio e valorização | Adicionar `valor_unitario` em `documento_itens` e `custo_medio` em `estoque_saldos`, calculados em `aplicarMovimentos`. |
| Permissões configuráveis | Mover a matriz de `utils/permissoes.js` para tabelas `permissoes` e `perfil_permissoes`. |
