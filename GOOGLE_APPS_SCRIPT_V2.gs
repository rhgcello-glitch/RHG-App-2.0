/**
 * RHG Database API - RHG App 2.0
 * Compatível com as abas e cabeçalhos da planilha RHG — Base de Dados.
 *
 * SEGURANÇA:
 * 1. Em Configurações do projeto > Propriedades do script, crie RHG_API_KEY.
 * 2. Use exatamente o mesmo valor na variável RHG_SHEETS_API_KEY do Render.
 * 3. Não publique nem compartilhe essa chave no frontend.
 */
const SPREADSHEET_ID = 'COLE_AQUI_O_ID_DA_COPIA_DE_TESTE';

const ALLOWED_SHEETS = [
  'MATERIAIS',
  'FORNECEDORES',
  'SERVIÇOS',
  'CLIENTES',
  'ORÇAMENTOS',
  'COTAÇÕES',
  'REGRAS RHG',
  'HISTÓRICO DE PREÇOS',
  'HISTÓRICO DE PREÇOS SERVIÇOS',
  'MATERIAIS ASSOCIADOS',
  'PERFIS CLIENTE',
  'ORIGENS E TIPOS',
  'CONFLITOS E DUPLICIDADES'
];

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function verifyApiKey(suppliedKey) {
  const expectedKey = PropertiesService.getScriptProperties().getProperty('RHG_API_KEY');
  if (!expectedKey) throw new Error('RHG_API_KEY não configurada nas Propriedades do script.');
  if (!suppliedKey || suppliedKey !== expectedKey) throw new Error('Acesso não autorizado. Verifique a chave da API.');
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(sheetName) {
  if (!ALLOWED_SHEETS.includes(sheetName)) throw new Error(`Aba não autorizada: ${sheetName}`);
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Aba "${sheetName}" não encontrada.`);
  return sheet;
}

function getHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error('A aba não possui cabeçalhos.');
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(h => String(h || '').trim());
}

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = getHeaders(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map((row, index) => {
    const item = {};
    headers.forEach((header, columnIndex) => { if (header) item[header] = row[columnIndex]; });
    item._row = index + 2; // linha física real, mesmo quando há linhas vazias
    return item;
  }).filter(item => Object.keys(item).some(key => key !== '_row' && item[key] !== '' && item[key] !== null));
}

function appendRow(sheetName, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet(sheetName);
    const headers = getHeaders(sheet);
    const row = headers.map(header => data[header] !== undefined ? data[header] : '');
    sheet.appendRow(row);
    return { inserted: true, sheet: sheetName, row: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function updateRow(sheetName, rowNumber, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet(sheetName);
    const headers = getHeaders(sheet);
    const row = Number(rowNumber);
    if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Número de linha inválido.');
    const currentRow = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    headers.forEach((header, index) => { if (Object.prototype.hasOwnProperty.call(data, header)) currentRow[index] = data[header]; });
    sheet.getRange(row, 1, 1, headers.length).setValues([currentRow]);
    return { updated: true, sheet: sheetName, row };
  } finally {
    lock.releaseLock();
  }
}

function deactivateRow(sheetName, rowNumber) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet(sheetName);
    const headers = getHeaders(sheet);
    const row = Number(rowNumber);
    if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Número de linha inválido.');
    const activeIndex = headers.indexOf('Ativo');
    if (activeIndex === -1) throw new Error(`A aba "${sheetName}" não possui a coluna "Ativo".`);
    sheet.getRange(row, activeIndex + 1).setValue('Não');
    return { deactivated: true, sheet: sheetName, row };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    verifyApiKey(e && e.parameter ? e.parameter.apiKey : '');
    const sheetName = e.parameter.sheet;
    if (!sheetName) return jsonResponse({ ok: true, app: 'RHG Database API', version: '2.0' });
    return jsonResponse({ ok: true, sheet: sheetName, data: getSheetData(sheetName) });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    verifyApiKey(body.apiKey);
    const action = body.action;
    const sheet = body.sheet;
    if (!action) throw new Error('Ação não informada.');
    if (!sheet) throw new Error('Aba não informada.');

    if (action === 'getData') return jsonResponse({ ok: true, sheet, data: getSheetData(sheet) });
    if (action === 'append') return jsonResponse({ ok: true, ...appendRow(sheet, body.data || {}) });
    if (action === 'update') return jsonResponse({ ok: true, ...updateRow(sheet, body.row, body.data || {}) });
    if (action === 'deactivate') return jsonResponse({ ok: true, ...deactivateRow(sheet, body.row) });
    throw new Error(`Ação não reconhecida: ${action}`);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}
