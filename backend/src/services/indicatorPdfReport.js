import PDFDocument from 'pdfkit';
import { reportMonths } from './indicatorReportModel.js';

const colors = { text: '#243447', blue: '#eaf3f8', line: '#cbd5df', muted: '#586675', accent: '#246b99' };

// Explicit measured layout also splits unusually long cells across pages.
// Text is retained as PDF text, including Portuguese accents, rather than rasterized.
export async function renderIndicatorPdf(report) {
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: { Title: 'Relatório de indicadores de inovação', Author: report.user, CreationDate: report.generated } });
  const chunks = [];
  const output = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const left = 36;
  let width = doc.page.width - left * 2;
  let bottom = doc.page.height - 66;
  let y = 52;
  const font = (size = 10, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(colors.text);
  function wrap(value, available, size = 10, bold = false) {
    font(size, bold);
    return String(value ?? '').split('\n').flatMap((paragraph) => {
      const lines = []; let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (line && doc.widthOfString(`${line} ${word}`) > available) { lines.push(line); line = ''; }
        if (doc.widthOfString(word) <= available) { line = line ? `${line} ${word}` : word; continue; }
        for (const character of word) {
          if (line && doc.widthOfString(line + character) > available) { lines.push(line); line = ''; }
          line += character;
        }
      }
      lines.push(line.trimEnd());
      return lines;
    });
  }
  function line(text, x, at, size = 10, bold = false, color = colors.text) {
    font(size, bold).fillColor(color).text(text, x, at, { lineBreak: false });
  }
  function newPage(layout = doc.page.layout) {
    doc.addPage({ layout }); y = 52;
    width = doc.page.width - left * 2; bottom = doc.page.height - 66;
  }
  function ensure(height) { if (y + height > bottom) newPage(); }
  function paragraph(text, size = 10) {
    for (const textLine of wrap(text, width, size)) {
      ensure(size * 1.5); line(textLine, left, y, size); y += size * 1.5;
    }
    y += 8;
  }
  function heading(text) {
    const lines = wrap(text, width - 18, 13, true);
    ensure(lines.length * 18 + 70);
    doc.rect(left, y, width, lines.length * 18 + 12).fill(colors.blue);
    lines.forEach((textLine, index) => line(textLine, left + 9, y + 6 + index * 18, 13, true));
    y += lines.length * 18 + 24;
  }
  function table(headers, rows, weights, size = 8.5) {
    const sum = weights.reduce((total, value) => total + value, 0);
    const widths = weights.map((value) => value / sum * width);
    const step = size * 1.35;
    const headerLines = headers.map((value, index) => wrap(value, widths[index] - 10, size, true));
    const headerHeight = Math.max(...headerLines.map((value) => value.length)) * step + 12;
    function draw(cells, count, fill, bold) {
      const height = count * step + 12;
      let x = left;
      cells.forEach((cell, index) => {
        doc.rect(x, y, widths[index], height).fillAndStroke(fill, colors.line);
        cell.forEach((textLine, row) => line(textLine, x + 5, y + 6 + row * step, size, bold));
        x += widths[index];
      });
      y += height;
    }
    function header() { draw(headerLines, Math.max(...headerLines.map((cell) => cell.length)), colors.blue, true); }
    ensure(headerHeight + step + 12); header();
    rows.forEach((row, index) => {
      let cells = row.map((value, column) => wrap(value, widths[column] - 10, size));
      while (cells.some((cell) => cell.length)) {
        const count = Math.max(...cells.map((cell) => cell.length));
        if (y + count * step + 12 > bottom && count * step + 12 <= bottom - 52 - headerHeight) { newPage(); header(); }
        let fit = Math.floor((bottom - y - 12) / step);
        if (fit < 1) { newPage(); header(); fit = Math.floor((bottom - y - 12) / step); }
        const take = Math.min(count, fit);
        draw(cells.map((cell) => cell.slice(0, take)), take, index % 2 ? '#f7fafc' : '#ffffff', false);
        cells = cells.map((cell) => cell.slice(take));
        if (cells.some((cell) => cell.length)) { newPage(); header(); }
      }
    });
    y += 14;
  }
  function cards() {
    const cardWidth = (width - 20) / 3;
    for (let offset = 0; offset < report.cards.length; offset += 3) {
      const group = report.cards.slice(offset, offset + 3).map(([label, value]) => ({ label: wrap(label, cardWidth - 20, 9, true), value: wrap(value, cardWidth - 20, 13) }));
      const height = Math.max(...group.map((card) => card.label.length * 13 + card.value.length * 18 + 32));
      ensure(height + 10);
      group.forEach((card, index) => {
        const x = left + index * (cardWidth + 10);
        doc.roundedRect(x, y, cardWidth, height, 5).fill(colors.blue);
        card.label.forEach((text, row) => line(text, x + 10, y + 10 + row * 13, 9, true));
        card.value.forEach((text, row) => line(text, x + 10, y + 20 + card.label.length * 13 + row * 18, 13));
      });
      y += height + 10;
    }
    y += 4;
  }
  function chart(row) {
    const title = wrap(`${row.code} - ${row.name}`, width, 10, true);
    const chartHeight = 200 + title.length * 14;
    ensure(chartHeight);
    title.forEach((text, index) => line(text, left, y + index * 14, 10, true));
    y += title.length * 14 + 5;
    line(`${row.unit} · ${row.aggregation} · Série anual ${report.year}`, left, y, 8, false, colors.muted);
    const start = y + 26; const height = 105;
    const values = row.series.filter((value) => value !== null);
    const min = Math.min(0, ...values);
    const observedMax = Math.max(0, ...values);
    const max = observedMax === min ? min + 1 : observedMax;
    const scale = max - min;
    const chartLeft = left + 42; const chartWidth = width - 54;
    const point = (value, index) => [chartLeft + index * chartWidth / 11, start + height - (value - min) / scale * height];
    for (const factor of [0, 0.5, 1]) {
      const at = start + height * factor;
      doc.moveTo(chartLeft, at).lineTo(chartLeft + chartWidth, at).strokeColor(colors.line).lineWidth(0.5).stroke();
      line(new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(max - factor * scale), left, at - 4, 7);
    }
    row.series.forEach((value, index) => {
      if (value === null) return;
      const [x, at] = point(value, index);
      if (index > 0 && row.series[index - 1] !== null) {
        const [beforeX, beforeY] = point(row.series[index - 1], index - 1);
        doc.moveTo(beforeX, beforeY).lineTo(x, at).strokeColor(colors.accent).lineWidth(1.5).stroke();
      }
      doc.circle(x, at, 2.5).fill(colors.accent);
    });
    reportMonths.forEach((month, index) => line(month, chartLeft + index * chartWidth / 11 - 6, start + height + 10, 8));
    y = start + height + 30;
    paragraph('Meses sem resultado permanecem como lacunas. Não há interpolação ou preenchimento artificial com zero.', 8);
  }

  try {
    paragraph('RELATÓRIO DE INDICADORES DE INOVAÇÃO', 21);
    paragraph('Plataforma de acompanhamento de indicadores institucionais.', 10);
    heading('1. Identificação do relatório');
    table(['Campo', 'Preenchimento'], [
      ['Centro de Inovação', report.center], ['Período de referência', report.period], ['Ano', report.year],
      ['Categoria selecionada', report.filters.Categoria], ['Origem selecionada', report.filters.Origem],
      ['Data e hora de geração', `${report.generatedLabel} (America/Sao_Paulo)`], ['Usuário que gerou', report.user],
    ], [1, 2], 10);
    heading('2. Resumo executivo'); cards(); paragraph(report.note);
    heading('3. Status da base de indicadores'); paragraph(report.base);
    table(['Status', 'Definição'], [
      ['Atingido', 'Resultado alcançou ou superou a meta.'],
      ['Parcialmente atingido', 'Resultado avançou em relação à meta, sem alcançá-la integralmente. A avaliação requer referência de progresso cadastrada.'],
      ['Não atingido', 'Resultado abaixo da meta.'], ['Sem dados', 'Não há informação validada suficiente para avaliação.'],
      ['Não avaliado (sem meta)', 'Há resultado, mas não há meta cadastrada. Não recebe classificação de atingimento.'],
    ], [1, 3]);
    newPage('landscape');
    heading('4. Indicadores monitorados');
    paragraph('Conjunto completo correspondente aos filtros. O resultado anual segue a regra de consolidação do indicador; o mensal corresponde ao mês selecionado.', 9);
    table(['Código', 'Indicador', 'Categoria', 'Unidade', 'Meta', 'Resultado', 'Atingimento', 'Status', 'Origem', 'Última atualização'], report.indicators.map((row) => [row.code, row.name, row.category, row.unit, row.target, row.result, row.attainment, row.status, row.source, row.updated]), [65, 130, 70, 80, 64, 75, 84, 88, 82, 82], 9);
    newPage('portrait');
    heading('5. Evolução mensal');
    if (!report.charts.length) paragraph('Não há série mensal suficiente para gerar gráficos neste recorte. São necessários ao menos dois meses com resultados numéricos.');
    report.charts.forEach(chart);
    heading('6. Análise gerencial');
    report.analysis.forEach(([label, text]) => { paragraph(label, 11); paragraph(text); });
    heading('7. Recomendações e plano de ação');
    paragraph('Recomendações derivadas das lacunas identificadas. Responsável, prazo, prioridade e status da ação não estão cadastrados.', 9);
    table(['Indicador/Ponto de atenção', 'Ação recomendada', 'Responsável', 'Prazo', 'Prioridade', 'Status da ação'], report.actions.map((row) => [row.point, row.action, row.responsible, row.deadline, row.priority, row.status]), [2.2, 2, 1.1, 1, 1, 1.1]);
    heading('8. Observações metodológicas');
    table(['Aspecto', 'Registro'], [
      ['Fonte dos dados', 'Sistema de gestão de indicadores do Centro de Inovação.'],
      ['Critério de avaliação', 'Comparação entre meta cadastrada e resultado apurado, quando ambos estiverem disponíveis.'],
      ['Periodicidade', [...new Set(report.indicators.map((row) => row.periodicity))].join(', ') || 'Não informado'],
      ['Consolidação', [...new Set(report.indicators.map((row) => row.aggregation))].join(', ') || 'Não informado'],
      ['Limitações', 'Metas, referência de progresso, validação do relatório e plano de ação não estão cadastrados. Os resultados correspondem à base consultada; não se presume validação adicional. Não se somam unidades diferentes para produzir um percentual geral. Não há critério cadastrado de desatualização; nenhuma data é inventada. Comparação histórica considera somente pares numéricos com mesma unidade, disponíveis no mesmo período do ano anterior.'],
      ...Object.entries(report.filters),
    ], [1, 3], 9);
    heading('9. Controle e governança do relatório');
    table(['Versão do relatório', 'Responsável pela validação', 'Data da validação'], [['Não informado', 'Não informado', 'Não informado']], [1, 1.5, 1]);
    const range = doc.bufferedPageRange();
    for (let page = 0; page < range.count; page++) {
      doc.switchToPage(page);
      const pageWidth = doc.page.width - left * 2;
      line('RELATÓRIO INSTITUCIONAL DE INDICADORES', left, 22, 8, true, colors.muted);
      const at = doc.page.height - 48;
      doc.moveTo(left, at - 6).lineTo(left + pageWidth, at - 6).strokeColor(colors.line).lineWidth(0.5).stroke();
      line(report.generatedLabel, left, at, 7, false, colors.muted);
      wrap(report.center, pageWidth - 175, 7).forEach((text, index) => line(text, left + 115, at + index * 9, 7, false, colors.muted));
      line(`${page + 1} / ${range.count}`, left + pageWidth - 40, at, 7, false, colors.muted);
    }
    doc.end();
  } catch (error) { doc.destroy(error); }
  return output;
}
