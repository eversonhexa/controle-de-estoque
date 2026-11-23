# API REST — Controle de Estoque

**Base:** `/api`. O corpo das requisições e das respostas é JSON (`Content-Type: application/json`).

## Convenções

| Tema | Regra |
|---|---|
| **Autenticação** | Sessão por cookie (`estoque.sid`), obtida em `POST /api/auth/login`. Sem sessão válida, a resposta é `401`. |
| **CSRF** | Toda requisição `POST`, `PUT`, `PATCH` ou `DELETE` (exceto o login) envia o cabeçalho `X-CSRF-Token`. O token vem na resposta do login e de `GET /api/auth/me`. |
| **Autorização** | Cada rota exige uma permissão (coluna **Permissão**). Sem a permissão, a resposta é `403`. A matriz está em `backend/src/utils/permissoes.js`. |
| **Quantidades** | Números maiores que zero, com no máximo 3 casas decimais. Exemplos: `10`, `2.5`, `"0.125"`. |
| **Datas** | Enviadas como `AAAA-MM-DD` e devolvidas como `AAAA-MM-DD HH:mm:ss`, sem fuso. |
| **Filtros de período** | Parâmetros `de` e `ate` (`AAAA-MM-DD`) nas listagens. |

### Formato de erro

Todos os erros seguem o mesmo formato:

```json
{ "erro": { "mensagem": "Saldo insuficiente para MAT001 - Caneta: disponível 3, necessário 7.", "detalhes": [ ... ] } }
```

| Código | Significado |
|---|---|
| 400 | JSON inválido |
| 401 | Não autenticado |
| 403 | Sem permissão ou token CSRF inválido |
| 404 | Não encontrado |
| 409 | Conflito: documento já efetivado ou estornado, valor duplicado, operação simultânea |
| 422 | Regra de negócio ou validação |
| 429 | Excesso de tentativas |
| 500 | Erro interno (registrado no log do servidor) |

## Autenticação

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | `{ login, senha }` → `{ ok, csrfToken }`. Limitado por IP. |
| POST | `/auth/logout` | Encerra a sessão. |
| GET | `/auth/me` | `{ usuario, permissoes[], csrfToken }` |
| PUT | `/auth/senha` | `{ senhaAtual, novaSenha }` |

## Usuários e perfis

Todas as rotas exigem a permissão `usuarios.gerenciar`.

| Método | Rota | Corpo / parâmetros |
|---|---|---|
| GET | `/usuarios` | `?q=&ativo=1\|0&perfilId=` |
| POST | `/usuarios` | `{ nome, login, email?, perfil_id, setor_id?, senha }`. `setor_id` é obrigatório para Solicitante. |
| GET | `/usuarios/:id` | |
| PUT | `/usuarios/:id` | Mesmo corpo do POST. `senha` é opcional: em branco, a senha atual é mantida. |
| PATCH | `/usuarios/:id/status` | `{ ativo: true\|false }` |
| GET | `/perfis` | |
| PUT | `/perfis/:id` | `{ nome, descricao, ativo }` |

## Cadastros básicos

| Recurso | Campos |
|---|---|
| `/setores` | `nome`, `sigla`, `responsavel?` |
| `/categorias` | `nome`, `descricao?` |
| `/unidades-medida` | `descricao`, `sigla` |
| `/fornecedores` | `nome`, `documento?` (CPF ou CNPJ validado), `contato?`, `telefone?`, `email?` |
| `/mercadorias` | `codigo` (único), `descricao`, `categoria_id`, `unidade_id`, `estoque_minimo?`, `observacoes?` |

Rotas disponíveis para cada recurso:

| Método | Rota | Permissão |
|---|---|---|
| GET | `/{recurso}?q=&ativo=` | `cadastros.consultar` |
| GET | `/{recurso}/:id` | `cadastros.consultar` |
| POST | `/{recurso}` | `cadastros.gerenciar` |
| PUT | `/{recurso}/:id` | `cadastros.gerenciar` |
| PATCH | `/{recurso}/:id/status` com `{ ativo }` | `cadastros.gerenciar` |

Observações:

- `/mercadorias` também aceita o filtro `?categoriaId=` e devolve o `saldo` atual de cada mercadoria.
- Não existe `DELETE`: registros sem uso futuro são inativados.

## Entradas

Permissão de leitura: `entradas.consultar`. Permissão de escrita: `entradas.gerenciar`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/entradas` | `?q=&status=&fornecedorId=&de=&ate=` |
| POST | `/entradas` | Cria um rascunho. Corpo: `{ data_movimentacao, tipo_documento_referencia?, documento_referencia?, fornecedor_id?, observacoes?, itens: [{ mercadoria_id, quantidade }] }` |
| GET | `/entradas/:id` | Cabeçalho e itens |
| PUT | `/entradas/:id` | Altera o rascunho (mesmo corpo do POST) |
| DELETE | `/entradas/:id` | Exclui o rascunho |
| POST | `/entradas/:id/efetivar` | Efetiva, em transação, e aumenta os saldos |

## Requisições

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/requisicoes` | `requisicoes.consultar` | `?q=&status=PENDENTE,APROVADA&setorId=&mercadoriaId=&de=&ate=`. O solicitante recebe apenas as do próprio setor. |
| POST | `/requisicoes` | `requisicoes.criar` | `{ setor_id?, observacoes?, itens: [{ mercadoria_id, quantidade_solicitada, observacoes? }] }` |
| GET | `/requisicoes/:id` | `requisicoes.consultar` | Inclui `itens[]` (`entregue`, `pendente`, `saldo_disponivel`) e `saidas[]` |
| PUT | `/requisicoes/:id` | `requisicoes.criar` | Somente `PENDENTE` |
| POST | `/requisicoes/:id/aprovar` | `requisicoes.analisar` | `PENDENTE` → `APROVADA` (não baixa estoque) |
| POST | `/requisicoes/:id/rejeitar` | `requisicoes.analisar` | `{ motivo }` |
| POST | `/requisicoes/:id/cancelar` | `requisicoes.criar` | `{ motivo }`. Só sem entregas efetivadas. |
| POST | `/requisicoes/:id/encerrar` | `requisicoes.analisar` | `{ motivo }`. `PARCIAL` → `ENCERRADA`. |

Situações possíveis: `PENDENTE`, `APROVADA`, `PARCIAL`, `ATENDIDA`, `REJEITADA`, `CANCELADA`, `ENCERRADA`.

## Saídas

Permissão de leitura: `saidas.consultar`. Permissão de escrita: `saidas.gerenciar`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/saidas` | `?q=&status=&setorId=&de=&ate=` |
| POST | `/saidas` | Cria um rascunho. Corpo: `{ requisicao_id, recebedor?, observacoes?, itens: [{ requisicao_item_id, quantidade }] }` |
| GET | `/saidas/:id` | |
| PUT | `/saidas/:id` | `{ recebedor?, observacoes?, itens }` (somente rascunho) |
| DELETE | `/saidas/:id` | Exclui o rascunho |
| POST | `/saidas/:id/efetivar` | Baixa o estoque e atualiza a situação da requisição (sequência da spec 12.1) |

Validações da saída:

- a requisição precisa estar `APROVADA` ou `PARCIAL` (RN03);
- o item precisa pertencer à requisição;
- a quantidade não pode exceder o pendente (RN05) nem o saldo disponível (RN04);
- a mercadoria precisa estar ativa (RN09).

## Ajustes e estornos

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/ajustes` | `saidas.consultar` | Lista os ajustes |
| POST | `/ajustes` | `ajustes.gerenciar` | Rascunho: `{ natureza: "ENTRADA"\|"SAIDA", justificativa, observacoes?, itens: [{ mercadoria_id, quantidade }] }` |
| GET / PUT / DELETE | `/ajustes/:id` | idem | Consulta, edição e exclusão de rascunho |
| POST | `/ajustes/:id/efetivar` | `ajustes.gerenciar` | |
| GET | `/documentos` | `saidas.consultar` | Todos os documentos: `?tipos=ENTRADA,SAIDA,...&status=&q=&mercadoriaId=&requisicaoId=&de=&ate=` |
| GET | `/documentos/:id` | `saidas.consultar` | Qualquer documento |
| POST | `/documentos/:id/estornar` | `ajustes.gerenciar` | `{ justificativa }`. Ver regras abaixo. |

Regras do estorno:

- gera um documento `ESTORNO_*` com movimento inverso ao do original;
- o original passa para `ESTORNADO` e continua no histórico;
- o estorno respeita o saldo disponível (um estorno de entrada exige saldo suficiente);
- um mesmo documento não pode ser estornado duas vezes;
- um documento de estorno não pode ser estornado.

## Estoque e painel

Permissão: `estoque.consultar`, exceto o dashboard, disponível para qualquer usuário autenticado.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard` | Indicadores conforme o perfil |
| GET | `/estoque` | Posição. Filtros: `?codigo=&descricao=&q=&categoriaId=&situacao=NORMAL,BAIXO,ZERADO&ativo=` |
| GET | `/estoque/:mercadoriaId` | Posição de uma mercadoria |
| GET | `/estoque/:mercadoriaId/extrato` | `?de=&ate=` → `{ mercadoria, movimentos[] }`. Cada movimento traz entrada, saída, `saldo_apos`, origem/destino e responsável. |

Classificação da situação: `ZERADO` (saldo = 0), `BAIXO` (0 < saldo ≤ mínimo), `NORMAL` (saldo > mínimo).

## Relatórios

| Método | Rota | Permissão |
|---|---|---|
| GET | `/relatorios/:tipo` | `relatorios.consultar` |

Tipos disponíveis:

| `:tipo` | Filtros |
|---|---|
| `estoque` | `categoriaId`, `situacao`, `ativo`, `q` |
| `estoque-minimo` | `categoriaId` |
| `entradas` | `de`, `ate`, `fornecedorId`, `mercadoriaId` |
| `saidas` | `de`, `ate`, `setorId`, `mercadoriaId` |
| `consumo-setor` | `de`, `ate`, `setorId`, `categoriaId` |
| `extrato` | `mercadoriaId` (obrigatório), `de`, `ate` |
| `requisicoes` | `de`, `ate`, `status`, `setorId` |

Formatos de saída:

- **Sem `formato`:** a resposta é JSON `{ titulo, filtrosAplicados[], colunas[], linhas[], totais }`.
- **`formato=xlsx`:** download de planilha Excel.
- **`formato=pdf`:** download de PDF em A4 paisagem.

## Auditoria

Permissão: `auditoria.consultar`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/auditoria` | `?usuarioId=&acao=&tabela=&registroId=&q=&de=&ate=&pagina=&porPagina=` → `{ total, pagina, porPagina, registros[] }` |
| GET | `/auditoria/acoes` | Lista das ações registradas |

Ações registradas:

| Grupo | Ações |
|---|---|
| Acesso | `LOGIN`, `LOGIN_FALHA`, `LOGIN_BLOQUEADO`, `LOGOUT`, `ALTERAR_SENHA` |
| Cadastros | `CRIAR`, `ALTERAR`, `ATIVAR`, `INATIVAR` |
| Documentos | `EXCLUIR_RASCUNHO`, `EFETIVAR`, `ESTORNAR` |
| Requisições | `APROVAR`, `REJEITAR`, `CANCELAR`, `ENCERRAR` |
| Relatórios e implantação | `EXPORTAR`, `CRIAR_ADMIN` |
