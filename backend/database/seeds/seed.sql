-- Dados iniciais indispensáveis ao funcionamento do sistema.
-- O primeiro usuário administrador NÃO é criado aqui: use "npm run criar-admin".

INSERT INTO perfis (codigo, nome, descricao) VALUES
  ('ADMINISTRADOR', 'Administrador', 'Acesso completo, gerenciamento de usuários e perfis'),
  ('ALMOXARIFE',    'Almoxarife',    'Cadastros, entradas, aprovação de requisições, saídas, ajustes e estornos'),
  ('SOLICITANTE',   'Solicitante',   'Registro e acompanhamento das requisições do próprio setor'),
  ('CONSULTA',      'Consulta',      'Acesso somente às consultas e relatórios');

INSERT INTO unidades_medida (descricao, sigla) VALUES
  ('Unidade', 'UN'),
  ('Caixa', 'CX'),
  ('Pacote', 'PCT'),
  ('Resma', 'RSM'),
  ('Quilograma', 'KG'),
  ('Litro', 'L');

INSERT INTO setores (nome, sigla, responsavel) VALUES
  ('Almoxarifado Central', 'ALMOX', NULL);
