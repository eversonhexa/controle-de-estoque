/**
 * Repositório genérico para cadastros simples (setores, categorias,
 * unidades de medida, fornecedores). Os nomes de tabela e colunas vêm
 * exclusivamente da configuração interna, nunca da requisição; os valores
 * são sempre parametrizados.
 */
function criarRepositorio({ tabela, campos, ordem, busca }) {
  const colunas = ['id', ...campos, 'ativo', 'criado_em'].join(', ');

  return {
    async listar(executor, { q, ativo }) {
      const where = [];
      const params = [];
      if (q && busca.length) {
        where.push('(' + busca.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
        busca.forEach(() => params.push(`%${q}%`));
      }
      if (ativo === '1' || ativo === '0') { where.push('ativo = ?'); params.push(Number(ativo)); }
      const [rows] = await executor.query(
        `SELECT ${colunas} FROM ${tabela} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${ordem}`,
        params
      );
      return rows;
    },

    async obter(executor, id, bloquear = false) {
      const [rows] = await executor.query(`SELECT ${colunas} FROM ${tabela} WHERE id = ? ${bloquear ? 'FOR UPDATE' : ''}`, [id]);
      return rows[0] || null;
    },

    async inserir(executor, dados) {
      const valores = campos.map((c) => (dados[c] === undefined || dados[c] === '' ? null : dados[c]));
      const [r] = await executor.query(
        `INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`,
        valores
      );
      return r.insertId;
    },

    async atualizar(executor, id, dados) {
      const valores = campos.map((c) => (dados[c] === undefined || dados[c] === '' ? null : dados[c]));
      await executor.query(`UPDATE ${tabela} SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...valores, id]);
    },

    async alterarStatus(executor, id, ativo) {
      await executor.query(`UPDATE ${tabela} SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id]);
    }
  };
}

module.exports = { criarRepositorio };
