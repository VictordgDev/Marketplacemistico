# Migrations

Este projeto usa migracoes SQL incrementais versionadas na pasta `migrations/`.

## Padrao de arquivos

Cada migracao precisa de dois arquivos com mesmo prefixo:

- `NNNN_nome.up.sql`: aplica mudancas
- `NNNN_nome.down.sql`: desfaz mudancas da migracao

Exemplo:

- `0001_initial_schema.up.sql`
- `0001_initial_schema.down.sql`

## Comandos

Aplicar migracoes pendentes:

```bash
npm run db:migrate
```

Rollback da ultima migracao aplicada:

```bash
npm run db:rollback
```

## Tabela de controle

As migracoes aplicadas ficam registradas em `schema_migrations`.

## Fluxo sugerido para validar Sprint 01

1. Subir banco vazio.
2. Rodar `npm run db:migrate`.
3. Conferir tabelas criadas sem usar `DROP TABLE`.
4. Rodar `npm run db:rollback`.
5. Conferir rollback da ultima migracao.
