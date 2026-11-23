/** Exportação dos relatórios para Excel (exceljs) e PDF (pdfkit). */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

function formatarValor(valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (tipo) {
    case 'numero': return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    case 'inteiro': return String(valor);
    case 'data': return dayjs(valor).format('DD/MM/YYYY');
    case 'datahora': return dayjs(valor).format('DD/MM/YYYY HH:mm');
    default: return String(valor);
  }
}

async function paraExcel(rel, usuario) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Controle de Estoque';
  wb.created = new Date();
  const ws = wb.addWorksheet('Relatório', { views: [{ state: 'frozen', ySplit: 4 }] });
  const n = rel.colunas.length;

  ws.mergeCells(1, 1, 1, n);
  ws.getCell(1, 1).value = rel.titulo;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, n);
  ws.getCell(2, 1).value = [...rel.filtrosAplicados, `Emitido em ${dayjs().format('DD/MM/YYYY HH:mm')} por ${usuario.nome}`].join(' | ');
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: 'FF555555' } };

  const cab = ws.getRow(4);
  rel.colunas.forEach((c, i) => {
    cab.getCell(i + 1).value = c.titulo;
    ws.getColumn(i + 1).width = Math.max(8, c.largura || 14);
  });
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; });

  for (const linha of rel.linhas) {
    const valores = rel.colunas.map((c) => {
      const v = linha[c.chave];
      if (v === null || v === undefined) return null;
      if (c.tipo === 'numero' || c.tipo === 'inteiro') return Number(v);
      if (c.tipo === 'data' || c.tipo === 'datahora') return dayjs(v).toDate();
      return String(v);
    });
    ws.addRow(valores);
  }
  rel.colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.tipo === 'numero') col.numFmt = '#,##0.###';
    if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy';
    if (c.tipo === 'datahora') col.numFmt = 'dd/mm/yyyy hh:mm';
  });

  if (rel.totais) {
    const linhaTotal = rel.colunas.map((c, i) => (i === 0 ? rel.totais.descricao : (rel.totais[c.chave] ?? null)));
    const r = ws.addRow(linhaTotal);
    r.font = { bold: true };
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: n } };
  return wb.xlsx.writeBuffer();
}

function paraPdf(rel, usuario) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const larguraUtil = doc.page.width - 60;
    const totalPeso = rel.colunas.reduce((t, c) => t + (c.largura || 14), 0);
    const larguras = rel.colunas.map((c) => ((c.largura || 14) / totalPeso) * larguraUtil);
    const alinhar = (c) => (['numero', 'inteiro'].includes(c.tipo) ? 'right' : 'left');

    const cabecalho = () => {
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(rel.titulo, 30, 30, { width: larguraUtil });
      doc.font('Helvetica').fontSize(8).fillColor('#555')
        .text(rel.filtrosAplicados.join('  |  ') || ' ', { width: larguraUtil });
      doc.moveDown(0.5);
      const y = doc.y;
      doc.rect(30, y, larguraUtil, 16).fill('#1F3A5F');
      let x = 30;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff');
      rel.colunas.forEach((c, i) => { doc.text(c.titulo, x + 3, y + 4, { width: larguras[i] - 6, align: alinhar(c), lineBreak: false, ellipsis: true }); x += larguras[i]; });
      doc.y = y + 18;
      doc.fillColor('#000').font('Helvetica').fontSize(8);
    };

    const desenharLinha = (valores, negrito, zebra) => {
      const alturas = valores.map((v, i) => doc.heightOfString(v, { width: larguras[i] - 6 }));
      const altura = Math.max(12, ...alturas) + 4;
      if (doc.y + altura > doc.page.height - 40) { doc.addPage(); cabecalho(); }
      const y = doc.y;
      if (zebra) doc.rect(30, y, larguraUtil, altura).fill('#F1F4F8').fillColor('#000');
      doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica');
      let x = 30;
      valores.forEach((v, i) => { doc.text(v, x + 3, y + 2, { width: larguras[i] - 6, align: alinhar(rel.colunas[i]) }); x += larguras[i]; });
      doc.y = y + altura;
    };

    cabecalho();
    if (!rel.linhas.length) doc.text('Nenhum registro encontrado para os filtros informados.', 30, doc.y + 6);
    rel.linhas.forEach((l, idx) => desenharLinha(rel.colunas.map((c) => formatarValor(l[c.chave], c.tipo)), false, idx % 2 === 1));
    if (rel.totais) {
      desenharLinha(rel.colunas.map((c, i) => (i === 0 ? rel.totais.descricao : formatarValor(rel.totais[c.chave], c.tipo))), true, false);
    }

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(i);
      const margemInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;  // evita que o rodapé crie uma página extra
      doc.font('Helvetica').fontSize(7).fillColor('#777').text(
        `Emitido em ${dayjs().format('DD/MM/YYYY HH:mm')} por ${usuario.nome} — página ${i + 1} de ${paginas.count}`,
        30, doc.page.height - 25, { width: larguraUtil, align: 'right', lineBreak: false }
      );
      doc.page.margins.bottom = margemInferior;
    }
    doc.end();
  });
}

module.exports = { paraExcel, paraPdf };
