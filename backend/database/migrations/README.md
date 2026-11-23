# Migrações

A versão 1.0 do banco é criada integralmente por `../schema.sql` (via `npm run db:init`).

Alterações futuras de estrutura devem ser adicionadas aqui como scripts numerados e idempotentes,
aplicados em ordem sobre um banco existente, por exemplo:

```
002_multiplos_almoxarifados.sql
003_custo_medio.sql
```

Nunca edite `schema.sql` para alterar um banco que já está em produção: crie uma migração.
