-- =====================================================================
-- Sistema Web de Controle de Estoque e Distribuição de Materiais
-- Script de criação do banco de dados (versão 1.0)
-- Requisitos: MySQL 8.0.16 ou superior (CHECK constraints), InnoDB, utf8mb4
-- =====================================================================
-- O nome do banco é definido pelo script de inicialização (npm run db:init),
-- que executa "CREATE DATABASE" e "USE" antes deste arquivo.
-- As chaves estrangeiras usam o comportamento padrão do InnoDB (NO ACTION = RESTRICT):
-- nenhuma exclusão em cascata em documentos e registros históricos.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS estoque_saldos;
DROP TABLE IF EXISTS documento_itens;
DROP TABLE IF EXISTS documentos_estoque;
DROP TABLE IF EXISTS requisicao_itens;
DROP TABLE IF EXISTS requisicoes;
DROP TABLE IF EXISTS numeradores;
DROP TABLE IF EXISTS fornecedores;
DROP TABLE IF EXISTS mercadorias;
DROP TABLE IF EXISTS unidades_medida;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS setores;
DROP TABLE IF EXISTS perfis;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- SEGURANÇA
-- ---------------------------------------------------------------------
CREATE TABLE perfis (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo     VARCHAR(20)  NOT NULL,             -- ADMINISTRADOR, ALMOXARIFE, SOLICITANTE, CONSULTA
  nome       VARCHAR(60)  NOT NULL,
  descricao  VARCHAR(255) NULL,
  ativo      TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_perfis_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE setores (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome         VARCHAR(120) NOT NULL,
  sigla        VARCHAR(20)  NOT NULL,
  responsavel  VARCHAR(120) NULL,
  ativo        TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_setores_sigla (sigla),
  UNIQUE KEY uk_setores_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usuarios (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome       VARCHAR(120) NOT NULL,
  login      VARCHAR(60)  NOT NULL,
  senha      VARCHAR(100) NOT NULL,              -- hash bcrypt
  email      VARCHAR(150) NULL,
  perfil_id  INT UNSIGNED NOT NULL,
  setor_id   INT UNSIGNED NULL,                  -- obrigatório para o perfil SOLICITANTE (validado no backend)
  ativo      TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acesso DATETIME  NULL,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_login (login),
  KEY idx_usuarios_perfil (perfil_id),
  KEY idx_usuarios_setor (setor_id),
  CONSTRAINT fk_usuarios_perfil FOREIGN KEY (perfil_id) REFERENCES perfis (id),
  CONSTRAINT fk_usuarios_setor  FOREIGN KEY (setor_id)  REFERENCES setores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- CADASTROS
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome       VARCHAR(100) NOT NULL,
  descricao  VARCHAR(255) NULL,
  ativo      TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE unidades_medida (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  descricao  VARCHAR(60)  NOT NULL,
  sigla      VARCHAR(10)  NOT NULL,
  ativo      TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_unidades_sigla (sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mercadorias (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(30)   NOT NULL,
  descricao       VARCHAR(200)  NOT NULL,
  categoria_id    INT UNSIGNED  NOT NULL,
  unidade_id      INT UNSIGNED  NOT NULL,
  estoque_minimo  DECIMAL(12,3) NOT NULL DEFAULT 0,
  observacoes     VARCHAR(500)  NULL,
  ativo           TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mercadorias_codigo (codigo),
  KEY idx_mercadorias_descricao (descricao),
  KEY idx_mercadorias_categoria (categoria_id),
  KEY idx_mercadorias_unidade (unidade_id),
  CONSTRAINT fk_mercadorias_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id),
  CONSTRAINT fk_mercadorias_unidade   FOREIGN KEY (unidade_id)   REFERENCES unidades_medida (id),
  CONSTRAINT ck_mercadorias_minimo CHECK (estoque_minimo >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fornecedores (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome       VARCHAR(150) NOT NULL,
  documento  VARCHAR(14)  NULL,                  -- CPF (11) ou CNPJ (14), somente dígitos
  contato    VARCHAR(120) NULL,
  telefone   VARCHAR(20)  NULL,
  email      VARCHAR(150) NULL,
  ativo      TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fornecedores_documento (documento),
  KEY idx_fornecedores_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Numeração sequencial dos documentos por tipo e ano (ex.: ENT-2026-000001)
CREATE TABLE numeradores (
  prefixo  VARCHAR(5)   NOT NULL,
  ano      SMALLINT     NOT NULL,
  ultimo   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (prefixo, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- REQUISIÇÕES
-- ---------------------------------------------------------------------
CREATE TABLE requisicoes (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero               VARCHAR(20)  NOT NULL,
  setor_id             INT UNSIGNED NOT NULL,
  usuario_id           INT UNSIGNED NOT NULL,
  data_requisicao      DATETIME     NOT NULL,
  status               VARCHAR(12)  NOT NULL DEFAULT 'PENDENTE',
  observacoes          VARCHAR(500) NULL,
  aprovado_por         INT UNSIGNED NULL,
  aprovado_em          DATETIME     NULL,
  finalizado_por       INT UNSIGNED NULL,      -- quem rejeitou, cancelou ou encerrou
  finalizado_em        DATETIME     NULL,
  motivo_finalizacao   VARCHAR(500) NULL,
  criado_em            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_requisicoes_numero (numero),
  KEY idx_requisicoes_status (status),
  KEY idx_requisicoes_setor (setor_id),
  KEY idx_requisicoes_usuario (usuario_id),
  KEY idx_requisicoes_data (data_requisicao),
  CONSTRAINT fk_requisicoes_setor      FOREIGN KEY (setor_id)       REFERENCES setores (id) ,
  CONSTRAINT fk_requisicoes_usuario    FOREIGN KEY (usuario_id)     REFERENCES usuarios (id),
  CONSTRAINT fk_requisicoes_aprovador  FOREIGN KEY (aprovado_por)   REFERENCES usuarios (id),
  CONSTRAINT fk_requisicoes_finalizador FOREIGN KEY (finalizado_por) REFERENCES usuarios (id),
  CONSTRAINT ck_requisicoes_status CHECK (status IN ('PENDENTE','APROVADA','PARCIAL','ATENDIDA','REJEITADA','CANCELADA','ENCERRADA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE requisicao_itens (
  id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  requisicao_id          INT UNSIGNED  NOT NULL,
  mercadoria_id          INT UNSIGNED  NOT NULL,
  quantidade_solicitada  DECIMAL(12,3) NOT NULL,
  observacoes            VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_requisicao_item_mercadoria (requisicao_id, mercadoria_id),
  KEY idx_requisicao_itens_requisicao (requisicao_id),
  KEY idx_requisicao_itens_mercadoria (mercadoria_id),
  CONSTRAINT fk_req_itens_requisicao FOREIGN KEY (requisicao_id) REFERENCES requisicoes (id) ,
  CONSTRAINT fk_req_itens_mercadoria FOREIGN KEY (mercadoria_id) REFERENCES mercadorias (id),
  CONSTRAINT ck_req_itens_quantidade CHECK (quantidade_solicitada > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- MOVIMENTAÇÕES
-- ---------------------------------------------------------------------
CREATE TABLE documentos_estoque (
  id                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero                     VARCHAR(20)  NOT NULL,
  tipo                       VARCHAR(16)  NOT NULL,
  sentido                    TINYINT      NOT NULL,     -- +1 aumenta o saldo, -1 reduz o saldo
  data_movimentacao          DATETIME     NOT NULL,
  tipo_documento_referencia  VARCHAR(30)  NULL,     -- NF-e, NF, Recibo, Doação, Outro...
  documento_referencia       VARCHAR(60)  NULL,     -- número da nota fiscal ou equivalente
  fornecedor_id              INT UNSIGNED NULL,
  requisicao_id              INT UNSIGNED NULL,     -- obrigatório para SAIDA e ESTORNO_SAIDA
  documento_origem_id        INT UNSIGNED NULL,     -- preenchido nos estornos
  usuario_id                 INT UNSIGNED NOT NULL, -- responsável pelo lançamento
  recebedor                  VARCHAR(120) NULL,     -- responsável pelo recebimento (saídas)
  status                     VARCHAR(10)  NOT NULL DEFAULT 'RASCUNHO',
  observacoes                VARCHAR(500) NULL,
  justificativa              VARCHAR(500) NULL,     -- obrigatória para ajustes e estornos
  efetivado_por              INT UNSIGNED NULL,
  efetivado_em               DATETIME     NULL,
  criado_em                  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_documentos_numero (numero),
  UNIQUE KEY uk_documentos_origem (documento_origem_id),   -- um documento só pode ser estornado uma vez
  KEY idx_documentos_tipo (tipo),
  KEY idx_documentos_data (data_movimentacao),
  KEY idx_documentos_status (status),
  KEY idx_documentos_requisicao (requisicao_id),
  KEY idx_documentos_fornecedor (fornecedor_id),
  KEY idx_documentos_usuario (usuario_id),
  CONSTRAINT fk_documentos_fornecedor FOREIGN KEY (fornecedor_id)       REFERENCES fornecedores (id)      ,
  CONSTRAINT fk_documentos_requisicao FOREIGN KEY (requisicao_id)       REFERENCES requisicoes (id)       ,
  CONSTRAINT fk_documentos_origem     FOREIGN KEY (documento_origem_id) REFERENCES documentos_estoque (id),
  CONSTRAINT fk_documentos_usuario    FOREIGN KEY (usuario_id)          REFERENCES usuarios (id)          ,
  CONSTRAINT fk_documentos_efetivador FOREIGN KEY (efetivado_por)       REFERENCES usuarios (id)          ,
  CONSTRAINT ck_documentos_tipo CHECK (tipo IN ('ENTRADA','SAIDA','AJUSTE_ENTRADA','AJUSTE_SAIDA','ESTORNO_ENTRADA','ESTORNO_SAIDA','ESTORNO_AJUSTE')),
  CONSTRAINT ck_documentos_sentido CHECK (sentido IN (1, -1)),
  CONSTRAINT ck_documentos_status CHECK (status IN ('RASCUNHO','EFETIVADO','ESTORNADO')),
  CONSTRAINT ck_documentos_saida_requisicao CHECK (tipo NOT IN ('SAIDA','ESTORNO_SAIDA') OR requisicao_id IS NOT NULL),
  CONSTRAINT ck_documentos_estorno_origem CHECK (tipo NOT LIKE 'ESTORNO%' OR documento_origem_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE documento_itens (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  documento_id        INT UNSIGNED  NOT NULL,
  mercadoria_id       INT UNSIGNED  NOT NULL,
  requisicao_item_id  INT UNSIGNED  NULL,        -- obrigatório para saídas (validado no backend)
  unidade_medida_id   INT UNSIGNED  NOT NULL,    -- cópia da unidade da mercadoria no momento do lançamento
  quantidade          DECIMAL(12,3) NOT NULL,
  saldo_apos          DECIMAL(12,3) NULL,        -- saldo da mercadoria após a efetivação deste item
  PRIMARY KEY (id),
  UNIQUE KEY uk_documento_item_mercadoria (documento_id, mercadoria_id),
  KEY idx_documento_itens_documento (documento_id),
  KEY idx_documento_itens_mercadoria (mercadoria_id),
  KEY idx_documento_itens_req_item (requisicao_item_id),
  CONSTRAINT fk_doc_itens_documento  FOREIGN KEY (documento_id)       REFERENCES documentos_estoque (id),
  CONSTRAINT fk_doc_itens_mercadoria FOREIGN KEY (mercadoria_id)      REFERENCES mercadorias (id)       ,
  CONSTRAINT fk_doc_itens_req_item   FOREIGN KEY (requisicao_item_id) REFERENCES requisicao_itens (id)  ,
  CONSTRAINT fk_doc_itens_unidade    FOREIGN KEY (unidade_medida_id)  REFERENCES unidades_medida (id)   ,
  CONSTRAINT ck_doc_itens_quantidade CHECK (quantidade > 0),
  CONSTRAINT ck_doc_itens_saldo_apos CHECK (saldo_apos IS NULL OR saldo_apos >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- CONTROLE DE SALDO
-- ---------------------------------------------------------------------
CREATE TABLE estoque_saldos (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  mercadoria_id     INT UNSIGNED  NOT NULL,
  quantidade_atual  DECIMAL(12,3) NOT NULL DEFAULT 0,
  atualizado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_estoque_saldos_mercadoria (mercadoria_id),
  CONSTRAINT fk_saldos_mercadoria FOREIGN KEY (mercadoria_id) REFERENCES mercadorias (id),
  CONSTRAINT ck_saldos_nao_negativo CHECK (quantidade_atual >= 0)   -- RN07
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id         INT UNSIGNED NULL,          -- nulo apenas em tentativas de login com usuário inexistente
  acao               VARCHAR(40)  NOT NULL,
  tabela_referencia  VARCHAR(40)  NULL,
  registro_id        INT UNSIGNED NULL,
  descricao          VARCHAR(1000) NULL,
  ip                 VARCHAR(45)  NULL,
  data_hora          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auditoria_usuario (usuario_id),
  KEY idx_auditoria_data (data_hora),
  KEY idx_auditoria_tabela (tabela_referencia, registro_id),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
