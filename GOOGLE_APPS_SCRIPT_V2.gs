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
  'CONFLITOS E DUPLICIDADES',
  'HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS'
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


// =====================================================
// FOTOS DOS ORÇAMENTOS — armazenamento compartilhado no Drive
// A pasta é criada automaticamente na primeira utilização.
// =====================================================
function getRHGPhotosFolder() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('RHG_PHOTOS_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { props.deleteProperty('RHG_PHOTOS_FOLDER_ID'); }
  }
  const folder = DriveApp.createFolder('RHG App 2.0 - Fotos dos Orçamentos');
  props.setProperty('RHG_PHOTOS_FOLDER_ID', folder.getId());
  return folder;
}
function getRHGPhotoMetadata(file) {
  let meta = {};
  try { meta = JSON.parse(file.getDescription() || '{}'); } catch (e) {}
  return { id:file.getId(), quoteId:String(meta.quoteId || ''), name:meta.name || file.getName(), description:meta.description || '', createdAt:meta.createdAt || file.getDateCreated().toISOString(), mimeType:file.getMimeType() };
}
function handleRHGPhotoAction(action, body) {
  const folder = getRHGPhotosFolder();
  if (action === 'photo_upload') {
    const quoteId = String(body.quoteId || '').trim();
    const dataUrl = String(body.dataUrl || '');
    if (!quoteId) throw new Error('ID do orçamento não informado.');
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (!match) throw new Error('Imagem inválida. Envie um arquivo de imagem.');
    const mimeType = match[1];
    const bytes = Utilities.base64Decode(match[2]);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Imagem excede o limite de 8 MB após otimização.');
    const name = String(body.name || 'foto.jpg').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const blob = Utilities.newBlob(bytes, mimeType, name);
    const file = folder.createFile(blob);
    const meta = { quoteId, name, description:'', createdAt:new Date().toISOString() };
    file.setDescription(JSON.stringify(meta));
    return { ok:true, photo:getRHGPhotoMetadata(file) };
  }
  const photoId = String(body.photoId || '').trim();
  if (action === 'photo_list') {
    const quoteId = String(body.quoteId || '').trim();
    if (!quoteId) throw new Error('ID do orçamento não informado.');
    const photos = []; const files = folder.getFiles();
    while (files.hasNext()) { const file = files.next(); const photo = getRHGPhotoMetadata(file); if (photo.quoteId === quoteId) photos.push(photo); }
    photos.sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return { ok:true, photos };
  }
  if (!photoId) throw new Error('ID da foto não informado.');
  const file = DriveApp.getFileById(photoId);
  let belongsToRHGFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) { if (parents.next().getId() === folder.getId()) belongsToRHGFolder = true; }
  if (!belongsToRHGFolder) throw new Error('Foto não encontrada na pasta compartilhada da RHG.');
  if (action === 'photo_get') {
    const blob = file.getBlob();
    return { ok:true, dataUrl:'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  }
  const meta = getRHGPhotoMetadata(file);
  if (action === 'photo_update') {
    meta.description = String(body.description || '').slice(0, 1000);
    file.setDescription(JSON.stringify({ quoteId:meta.quoteId, name:meta.name, description:meta.description, createdAt:meta.createdAt }));
    return { ok:true, photo:getRHGPhotoMetadata(file) };
  }
  if (action === 'photo_delete') { file.setTrashed(true); return { ok:true, deleted:true }; }
  throw new Error('Ação de foto não reconhecida.');
}


// =====================================================
// ORÇAMENTOS OFICIAIS — gravação com histórico de versões
// A aba de auditoria é criada automaticamente, sem apagar dados existentes.
// =====================================================
const RHG_QUOTE_EXTRA_HEADERS = [
  'Telefone do Cliente','Tipo de Cliente','Perfil do Cliente','Endereço do Cliente',
  'Descrição do Serviço','Descrição do Orçamento','Condições Comerciais','Atualizado em','Versão'
];
const RHG_QUOTE_AUDIT_HEADERS = [
  'ID Alteração','ID Interno','Número do Orçamento','Data e Hora','Operação','Versão Anterior','Nova Versão','Dados Anteriores','Dados Atualizados'
];
function ensureHeaders(sheet, requiredHeaders) {
  if (sheet.getLastColumn() < 1) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders.slice();
  }
  let headers = getHeaders(sheet);
  requiredHeaders.forEach(header => {
    if (!headers.includes(header)) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });
  return headers;
}
function quoteSnapshotFromRow(headers, values) {
  const out = {};
  headers.forEach((h,i) => { if (h) out[h] = values[i]; });
  return out;
}
function saveOfficialQuote(quote) {
  if (!quote || !quote.id) throw new Error('Orçamento sem ID interno.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('ORÇAMENTOS');
    if (!sheet) throw new Error('A aba ORÇAMENTOS não foi encontrada.');
    const headers = ensureHeaders(sheet, RHG_QUOTE_EXTRA_HEADERS);
    const idCol = headers.indexOf('ID Interno') + 1;
    if (!idCol) throw new Error('A aba ORÇAMENTOS precisa da coluna ID Interno.');
    const lastRow = sheet.getLastRow();
    let rowNumber = 0;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getDisplayValues().flat();
      const idx = ids.findIndex(v => String(v) === String(quote.id));
      if (idx >= 0) rowNumber = idx + 2;
    }
    const isUpdate = rowNumber > 0;
    let previous = {};
    let previousVersion = 0;
    if (isUpdate) {
      const oldValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      previous = quoteSnapshotFromRow(headers, oldValues);
      previousVersion = Number(previous['Versão'] || 1);
    }
    let quoteNumber = isUpdate ? String(previous['Número do Orçamento'] || quote.quoteNumber || '').trim() : '';
    if (!isUpdate) {
      const prefix = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMyy');
      const numberCol = headers.indexOf('Número do Orçamento') + 1;
      const nums = lastRow >= 2 ? sheet.getRange(2, numberCol, lastRow - 1, 1).getDisplayValues().flat() : [];
      const max = nums.reduce((m,v) => {
        const match = String(v).match(new RegExp('^' + prefix + '-(\\d+)$'));
        return match ? Math.max(m, Number(match[1]) || 0) : m;
      }, 0);
      quoteNumber = prefix + '-' + String(max + 1).padStart(3, '0');
    }
    if (isUpdate && previous['Número do Orçamento']) quoteNumber = String(previous['Número do Orçamento']);
    const version = isUpdate ? previousVersion + 1 : 1;
    const now = new Date();
    const values = {
      'ID Interno':String(quote.id),'Número do Orçamento':quoteNumber,
      'Data':quote.date || now,'ID Cliente':String(quote.client && quote.client.id || ''),
      'Cliente':String(quote.client && quote.client.name || ''),
      'Serviços':JSON.stringify(quote.services || []),'Materiais':JSON.stringify(quote.materials || []),
      'Subtotal':Number(quote.subtotal || 0),'Desconto':Number(quote.discount || 0),
      'Total':Number(quote.total || 0),'Status':String(quote.status || 'Em análise'),
      'Observações':String(quote.description || ''),'Fonte do Documento':'RHG-App 2.0',
      'Tipo de Registro':'ORÇAMENTO','Telefone do Cliente':String(quote.client && quote.client.phone || ''),
      'Tipo de Cliente':String(quote.client && quote.client.type || ''),
      'Perfil do Cliente':String(quote.client && quote.client.profile || ''),
      'Endereço do Cliente':String(quote.client && quote.client.address || ''),
      'Descrição do Serviço':String(quote.description || ''),
      'Descrição do Orçamento':String(quote.quoteDescription || ''),
      'Condições Comerciais':String(quote.conditions || ''),
      'Atualizado em':now,'Versão':version
    };
    const rowValues = headers.map(h => Object.prototype.hasOwnProperty.call(values,h) ? values[h] : (isUpdate ? previous[h] : ''));
    if (isUpdate) sheet.getRange(rowNumber, 1, 1, headers.length).setValues([rowValues]);
    else { sheet.appendRow(rowValues); rowNumber = sheet.getLastRow(); }

    const audit = ss.getSheetByName('HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS') || ss.insertSheet('HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS');
    ensureHeaders(audit, RHG_QUOTE_AUDIT_HEADERS);
    const operation = isUpdate ? 'EDIÇÃO' : 'CRIAÇÃO';
    const auditRow = {
      'ID Alteração':'ALT-' + Utilities.getUuid(), 'ID Interno':String(quote.id),
      'Número do Orçamento':quoteNumber,'Data e Hora':now,'Operação':operation,
      'Versão Anterior':isUpdate ? previousVersion : 0,'Nova Versão':version,
      'Dados Anteriores':isUpdate ? JSON.stringify(previous) : '',
      'Dados Atualizados':JSON.stringify(values)
    };
    const auditHeaders = getHeaders(audit);
    audit.appendRow(auditHeaders.map(h => Object.prototype.hasOwnProperty.call(auditRow,h) ? auditRow[h] : ''));
    return {quote:Object.assign({}, quote, {quoteNumber, updatedAt:now.toISOString(), version, isOfficial:true, _sheetRow:rowNumber}), action:isUpdate?'update':'append', row:rowNumber, version};
  } finally { lock.releaseLock(); }
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
    if (action === 'saveQuote') return jsonResponse({ok:true, ...saveOfficialQuote(body.quote || {})});
    if (String(action || '').indexOf('photo_') === 0) return jsonResponse(handleRHGPhotoAction(action, body));
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
