import { strToU8, zipSync } from 'fflate';
import { escapeHtml } from './domain.js';
import { saveExcelFile } from './native.js';

const categories = {
  jubilo: 'Júbilo', hinario: 'Hinário', adoracao: 'Adoração',
  oferta: 'Ofertas', corinho: 'Corinhos', ceia: 'Santa Ceia',
};

// Both exports use the event's actual sequence and assigned ministry vocalist.
export function setlistExportRows(event, songs, members) {
  const catalog = new Map(songs.map(song => [song.id, song]));
  const team = new Map(members.map(member => [member.id, member]));
  const items = event.items?.length ? event.items.filter(item => item.type === 'song') : (event.songs || []).map(song_id => ({ song_id }));
  return items.flatMap(item => {
    const song = catalog.get(item.song_id);
    if (!song) return [];
    const singerId = Object.hasOwn(event.singerBySong || {}, song.id) ? event.singerBySong[song.id] : item.singer_id;
    return [{
      category: categories[song.cat] || song.cat || 'Sem categoria',
      title: song.title || 'Música sem título',
      vocalist: team.get(singerId)?.name || 'Vocalista não definido',
      key: event.keyBySong?.[song.id] || song.vocal_keys?.[singerId] || song.key || '—',
    }];
  });
}

function eventDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : value || '';
}

export function setlistWhatsAppText(event, songs, members) {
  const rows = setlistExportRows(event, songs, members);
  const heading = `🎵 *${event.label}* — ${eventDate(event.date)} · ${(event.time || '').slice(0, 5)}`;
  const theme = event.theme ? `\n📖 ${event.theme}` : '';
  const list = rows.map(row => `*${row.category}:* ${row.title} — ${row.vocalist} · Tom: ${row.key}`).join('\n');
  return `${heading}${theme}\n\n*Setlist:*\n${list}\n\n_Via LouveSync · IMWAL_`;
}

function xml(value) {
  // XML 1.0 forbids these controls; tabs and newlines remain valid cell text.
  // eslint-disable-next-line no-control-regex
  return escapeHtml(String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, ''));
}

// A real OOXML workbook, with string cells (never formulas), not HTML renamed .xls.
export function setlistWorkbook(event, songs, members) {
  const rows = setlistExportRows(event, songs, members);
  const values = [
    [event.label || 'Setlist'],
    ['Data', eventDate(event.date), 'Horário', (event.time || '').slice(0, 5)],
    [event.theme ? `Tema: ${event.theme}` : ''],
    [], ['Categoria', 'Música', 'Vocalista', 'Tom'],
    ...rows.map(row => [`${row.category}:`, row.title, row.vocalist, row.key]),
  ];
  const lastRow = values.length;
  const sheetRows = values.map((cells, index) => `<row r="${index + 1}">${cells.map((value, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr" s="${index === 0 ? 2 : index === 4 ? 1 : 0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('');
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const spreadsheet = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const documentRelations = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parts = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${documentRelations}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${spreadsheet}" xmlns:r="${documentRelations}"><sheets><sheet name="Setlist" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${documentRelations}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${documentRelations}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<styleSheet xmlns="${spreadsheet}"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FF241C35"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7B3FF2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${spreadsheet}"><dimension ref="A1:D${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="44" customWidth="1"/><col min="3" max="3" width="30" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A5:D${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:D1"/><mergeCell ref="A3:D3"/></mergeCells></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(parts).map(([name, content]) => [name, strToU8(declaration + content)])), { level: 6 });
}

export async function downloadSetlistExcel(event, songs, members) {
  const bytes = setlistWorkbook(event, songs, members);
  const filename = `setlist_${/^\d{4}-\d{2}-\d{2}$/.test(event.date || '') ? event.date : 'evento'}.xlsx`;
  if (await saveExcelFile(bytes, filename)) return;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
