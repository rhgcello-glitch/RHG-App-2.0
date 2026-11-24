require('dotenv').config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const RHG_BOT_ENDPOINT = process.env.RHG_BOT_ENDPOINT || "";
const RHG_SHEETS_URL = process.env.RHG_SHEETS_URL || "";
const RHG_SHEETS_API_KEY = process.env.RHG_SHEETS_API_KEY || "";

const mime = {
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".svg":"image/svg+xml"
};

function send(res,status,body,type="application/json"){
  res.writeHead(status,{"Content-Type":type});
  res.end(Buffer.isBuffer(body) ? body : (typeof body==="string" ? body : JSON.stringify(body)));
}
async function callRHGSheets(sheet) {

  if (!RHG_SHEETS_URL) {
    throw new Error("RHG_SHEETS_URL não configurada.");
  }

  const response = await fetch(RHG_SHEETS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "getData",
      sheet,
      apiKey: RHG_SHEETS_API_KEY
    })
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "Resposta inválida do Google Apps Script."
    );
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.error ||
      `Google Apps Script retornou HTTP ${response.status}`
    );
  }

  return data.data || [];
}


async function writeRHGSheets(sheet, action, data = {}, row = null) {

  if (!RHG_SHEETS_URL) {
    throw new Error("RHG_SHEETS_URL não configurada.");
  }

  const response = await fetch(RHG_SHEETS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action,
      sheet,
      data,
      row,
      apiKey: RHG_SHEETS_API_KEY
    })
  });

  const text = await response.text();

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      "Resposta inválida do Google Apps Script."
    );
  }

  if (!response.ok || result.ok === false) {
    throw new Error(
      result.error ||
      `Google Apps Script retornou HTTP ${response.status}`
    );
  }

  return result;
}
async function callRHGSheetsAction(action, payload = {}) {
  if (!RHG_SHEETS_URL) throw new Error("RHG_SHEETS_URL não configurada.");
  const response = await fetch(RHG_SHEETS_URL, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({...payload, action, apiKey:RHG_SHEETS_API_KEY})
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Resposta inválida do Google Apps Script."); }
  if (!response.ok || data.ok === false) throw new Error(data.error || `Google Apps Script retornou HTTP ${response.status}`);
  return data;
}

async function callRHGPhotoAction(action, payload = {}) {
  if (!RHG_SHEETS_URL) {
    throw new Error("RHG_SHEETS_URL não configurada.");
  }

  const response = await fetch(RHG_SHEETS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...payload,
      action: `photo_${action}`,
      apiKey: RHG_SHEETS_API_KEY
    })
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "Resposta inválida do Google Apps Script ao acessar fotos."
    );
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.error || `Google Apps Script retornou HTTP ${response.status}`
    );
  }

  return data;
}
function readJsonRequest(req, limit = 18 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "", size = 0;
    req.on("data", chunk => { size += chunk.length; if (size > limit) { reject(new Error("Arquivo muito grande. Tente uma imagem menor.")); req.destroy(); return; } raw += chunk.toString("utf8"); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("JSON inválido.")); } });
    req.on("error", reject);
  });
}

function xmlDecode(value) {
  return String(value || '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function unzipEntries(buffer) {
  // Leitor ZIP mínimo para arquivos Office Open XML (.xlsx/.xlsm), sem dependências externas.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo Excel inválido: estrutura ZIP não encontrada.');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i=0; i<count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else { offset += 46 + nameLength + extraLength + commentLength; continue; }
    entries.set(name, data.toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function extractXlsxText(buffer) {
  const entries = unzipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml') || '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => xmlDecode(t[1])).join(''));
  const workbook = entries.get('xl/workbook.xml') || '';
  const names = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*>/g)].map(m=>xmlDecode(m[1]));
  const sheets = [...entries.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]));
  const output=[];
  sheets.forEach((key,index)=>{
    const xml=entries.get(key)||'';
    const rowTexts=[];
    for(const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
      const cells=[];
      for(const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
        const attrs=cellMatch[1], body=cellMatch[2];
        const type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||'';
        const value=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
        let text='';
        if(type==='s'&&value!==undefined) text=shared[Number(value)]||'';
        else if(type==='inlineStr') text=[...body.matchAll(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>xmlDecode(m[1])).join('');
        else if(value!==undefined) text=xmlDecode(value);
        cells.push(text.replace(/\s+/g,' ').trim());
      }
      if(cells.some(Boolean)) rowTexts.push(cells.join(' | '));
    }
    if(rowTexts.length) output.push(`ABA: ${names[index]||`Planilha ${index+1}`}\n${rowTexts.slice(0,500).join('\n')}`);
  });
  if(!output.length) throw new Error('Não foi possível extrair linhas da planilha Excel.');
  return output.join('\n\n').slice(0,120000);
}
function prepareAssistantAttachments(attachments=[]) {
  const prepared=[];
  let combinedText='';
  for(const attachment of attachments.slice(0,4)){
    const name=String(attachment.name||'arquivo').slice(0,180);
    const type=String(attachment.type||'').toLowerCase();
    const base64=String(attachment.dataBase64||'').replace(/\s/g,'');
    if(!base64) throw new Error(`O arquivo ${name} chegou vazio.`);
    if(base64.length>11*1024*1024) throw new Error(`O arquivo ${name} excede o limite permitido de 8 MB.`);
    const buffer=Buffer.from(base64,'base64');
    if(!buffer.length) throw new Error(`Não foi possível ler ${name}.`);
    const ext=path.extname(name).toLowerCase();
    if(['.csv','.txt'].includes(ext)||type.includes('text/')){
      combinedText += `\n\nARQUIVO: ${name}\n${buffer.toString('utf8').slice(0,45000)}`;
      prepared.push({name,type,kind:'text'});
    } else if(['.xlsx','.xlsm'].includes(ext)||type.includes('spreadsheet')){
      combinedText += `\n\nARQUIVO: ${name}\n${extractXlsxText(buffer)}`;
      prepared.push({name,type,kind:'spreadsheet'});
    } else if(ext==='.pdf'||type==='application/pdf'){
      prepared.push({name,type:'application/pdf',kind:'pdf',dataUrl:`data:application/pdf;base64,${base64}`});
    } else if(/^image\//.test(type)||/\.(png|jpe?g|webp)$/i.test(name)){
      const imageType=type.startsWith('image/')?type:({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext]||'image/jpeg');
      prepared.push({name,type:imageType,kind:'image',dataUrl:`data:${imageType};base64,${base64}`});
    } else throw new Error(`Formato não suportado: ${name}.`);
  }
  return {attachments:prepared,documentText:combinedText.slice(0,120000)};
}

function approvalSigningPayload(proposal) {
  return {
    operation: proposal.operation || 'update', sheet: proposal.sheet || '',
    recordId: proposal.recordId || '', name: proposal.name || proposal.itemName || '',
    unit: proposal.unit || '', field: proposal.field || '',
    currentValue: proposal.currentValue === undefined ? null : proposal.currentValue,
    proposedValue: proposal.proposedValue, reason: proposal.reason || '',
    confidence: proposal.confidence || '', sourceName: proposal.sourceName || '',
    supplier: proposal.supplier || ''
  };
}
function signApprovalProposal(proposal) {
  if (!RHG_SHEETS_API_KEY) throw new Error('RHG_SHEETS_API_KEY não configurada para proteger as aprovações.');
  const signed = { ...proposal, _approvalExpiresAt: Date.now() + 30 * 60 * 1000 };
  signed._approvalToken = crypto.createHmac('sha256', RHG_SHEETS_API_KEY).update(JSON.stringify(approvalSigningPayload(signed))).digest('hex');
  return signed;
}
function verifyApprovalProposal(proposal) {
  if (!RHG_SHEETS_API_KEY || !proposal._approvalToken || Number(proposal._approvalExpiresAt) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', RHG_SHEETS_API_KEY).update(JSON.stringify(approvalSigningPayload(proposal))).digest('hex');
  const suppliedBuffer = Buffer.from(String(proposal._approvalToken));
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function nextSequentialId(rows, field, prefix) {
  const max = (rows||[]).reduce((n,row)=>{
    const match=String(row[field]||'').match(new RegExp('^'+prefix+'-(\\d+)$','i'));
    return match?Math.max(n,Number(match[1])||0):n;
  },0);
  return `${prefix}-${String(max+1).padStart(3,'0')}`;
}

const RHG_BOT_PRICING_KNOWLEDGE = `
CONHECIMENTO TÉCNICO-COMERCIAL RHG — REFERÊNCIA 2026
A BASE RHG é sempre a fonte principal para preços já cadastrados. A tabela regional a seguir é apenas referência externa secundária (mão de obra, região SUDESTE); não substitui automaticamente os preços da Base nem representa cotação confirmada pela RHG.

MÉDIAS REGIONAIS DO SUDESTE (preço médio calculado pela média aritmética dos limites da apostila):
${[
['Troca dos condutores do chuveiro',127.5,'serviço'],['Troca de disjuntor simples',82.5,'serviço'],['Instalação de disjuntor DR',200,'serviço'],['Instalação de ponto de tomada',55,'serviço'],['Instalação de tomada 220V',85,'serviço'],['Instalação de interruptor simples',49.5,'serviço'],['Instalação de interruptor paralelo',80,'serviço'],['Instalação de ponto de iluminação',70,'serviço'],['Troca de chuveiro elétrico',102.5,'serviço'],['Instalação de luminária de teto',75,'serviço'],['Instalação de perfil de LED embutido (por metro)',127.5,'serviço por metro'],['Instalação de ventilador de teto',122.5,'serviço'],['Instalação de arandela de parede',70,'serviço'],['Reparo de curto-circuito',185,'serviço'],['Instalação de campainha elétrica',85,'serviço'],['Instalação de sensor de presença',127.5,'serviço'],['Instalação de fiação para ar-condicionado',337.5,'serviço'],['Instalação de dimmer',80,'serviço'],['Instalação de tomada USB',70,'serviço'],['Passagem de conduíte em parede',27.5,'por metro'],['Troca de lâmpada de LED',19,'por unidade'],['Instalação de interruptor remoto (Wi-Fi)',127.5,'serviço']
].map(x=>`- ${x[0]}: R$ ${x[1].toFixed(2).replace('.',',')} (${x[2]}, mão de obra referencial).`).join('\n')}

REGRAS DE PRECIFICAÇÃO E ORÇAMENTO:
1. Identifique escopo, quantidade, unidade, local, condições de execução, acabamento e o que já existe antes de fechar o preço.
2. Separe mão de obra, materiais, infraestrutura, deslocamento, equipamentos, impostos/encargos, contingência e lucro. Declare inclusões e exclusões.
3. Preço por ponto/unidade para pontos e dispositivos; por metro para infraestrutura linear; por quadro para quadros; diária para trabalhos curtos/manutenção; empreitada global para escopo definido; unitária para quantidades medidas; mista quando partes têm medição diferente.
4. Não some diária e preços unitários cobrando duas vezes a mesma execução. Explique a composição quando combinar modalidades.
5. Empreitada: estime MO (diária x dias ou horas), materiais, despesas, encargos, contingência e lucro. Apostila sugere contingência de 10%–20% e lucro de 15%–30%; trate como parâmetros ajustáveis, nunca como padrão obrigatório.
6. Diária: considerar remuneração líquida, encargos/reservas, custos operacionais, impostos/taxas e margem para investimentos. Use os custos reais do profissional quando fornecidos.
7. Projetos sem medições precisas: a apostila sugere reserva de 10%–15%; explique que é margem de incerteza e evite duplicar contingência.
8. Materiais: consulte Materiais Associados na Base primeiro; inclua quantidades, unidades, especificações e sobra adequada. Não invente marca, bitola, modelo ou quantidade exata sem dados.
9. Fatores preliminares da apostila (não substituem medição/dimensionamento): tomada simples 4m eletroduto/8m fio 2,5mm²; tomada dupla 5m/10m fio 2,5mm²; iluminação 6m eletroduto/12m fio 1,5mm²; chuveiro 8–12m cabo 6mm²; circuito de força 8–12m cabo 4mm²; split 15–25m cabo 4–6mm². A apostila contém divergência quanto a metros de eletroduto por ponto (2,5m em passagem interna vs 8–12m de estimativa geral); explicite a hipótese e confirme pelo trajeto real.
10. Preços de serviço na apostila normalmente são mão de obra; materiais, conduítes, cabos, caixas, novos circuitos, rasgos e acabamentos civis devem ser discriminados à parte quando aplicáveis.
11. A referência da apostila para conexão ao circuito existente varia entre aproximadamente 2m e 3,2m; não trate como regra RHG. Pergunte/registre a distância ou sinalize como variável.
12. Considere deslocamento, combustível, alimentação, hospedagem, aluguel de ferramentas e tempo de execução quando aplicáveis.
13. Adicionais sugeridos pela apostila: noturno 25%–30%; fim de semana 30%–50%; feriado cerca de 50%; emergência pode variar (20%–50% em um trecho e 25%–100% em outro); altura/difícil acesso 10%–40% conforme risco. Há divergência de percentuais na fonte. Nunca aplique automaticamente: apresente faixa, motivo e peça aprovação do responsável.
14. Fornecimento de materiais pelo prestador pode envolver taxa operacional/risco sugerida de 10%–15%, mas deve ser justificada e não confundir com lucro ou margem já incluída.
15. Grandes metragens podem permitir desconto por volume; a apostila sugere 5%–15% acima de 200m. Avalie custos e não aplique automaticamente.
16. Perfis C/B/A/AA mudam a forma de apresentar as opções, não justificam discriminação nem multiplicador automático. C: pacote essencial/econômico e opcionais; B: equilíbrio custo-benefício; A: acabamento, qualidade, prazo e atendimento personalizado; AA: soluções personalizadas, integração, automação e manutenção especializada. Os valores de exemplos por perfil da apostila não devem substituir a tabela de serviços nem a Base RHG.
17. Tipo do cliente (Residencial/Comercial) é diferente do perfil comercial (C/B/A/AA). Nunca confunda as duas informações.
18. Prazos: estime duração de execução conforme quantidade, produtividade/equipe, complexidade, infraestrutura, acesso, disponibilidade de material e dependências. Diferencie duração estimada de data de início. Não prometa prazo certo sem confirmação.
19. Proposta deve conter cliente/local/data, escopo detalhado, quantidades e especificações, inclusões/exclusões, mão de obra, materiais, deslocamento/adicionais, subtotal, desconto, total, prazo, validade, pagamento, garantia e condições para aditivos.
20. Alterações de escopo devem gerar revisão do preço e prazo, preferencialmente mediante aprovação/aditivo.
21. Indique referências normativas quando aplicáveis (NR-10, NBR 5410, NBR 5419); não afirme conformidade nem substitua análise técnica, projeto, laudo ou ART.
22. Os percentuais e preços acima são orientativos da apostila 2026, não uma determinação legal ou garantia de preço de mercado local. Reavalie com custos reais, cidade, concorrência, qualificação e histórico RHG.

PERFIL DO CLIENTE: Tipo = Residencial ou Comercial. Perfil = C, B, A ou AA. Use o perfil apenas para adaptar a proposta e as opções; o preço base deve continuar vindo da BASE RHG ou de estimativa técnica justificada.`;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}


function getSearchTerms(text) {

  const normalized = normalizeText(text);

  const stopwords = new Set([
    "para",
    "com",
    "sem",
    "uma",
    "uns",
    "umas",
    "dos",
    "das",
    "que",
    "por",
    "sobre",
    "este",
    "esta",
    "esse",
    "essa",
    "cliente",
    "servico",
    "servico",
    "instalacao",
    "fazer",
    "fazer"
  ]);

  return normalized
    .split(/[^a-z0-9]+/)
    .filter(word =>
      word.length >= 4 &&
      !stopwords.has(word)
    );
}


function filterRHGRecords(records, terms, limit = 40) {

  if (!Array.isArray(records)) {
    return [];
  }

  if (!terms.length) {
    return records.slice(0, limit);
  }

  const scored = records.map(record => {

    const text = normalizeText(
      Object.values(record)
        .filter(value => value !== null && value !== undefined)
        .join(" ")
    );

    let score = 0;

    terms.forEach(term => {

      if (text.includes(term)) {
        score++;
      }

    });

    return {
      record,
      score
    };

  });


  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.record);
}
// RHG-Bot JSON input fix — v1.9
async function callRHGBot(payload){
  // Preferred production path: an OpenAI-compatible Responses API endpoint.
  // The key remains server-side and is never sent to the browser.
  const apiKey = process.env.RHG_AI_API_KEY || "";
  const model = process.env.RHG_AI_MODEL || "";
  const apiUrl = process.env.RHG_AI_URL || "https://api.openai.com/v1/responses";

  if(!apiKey || !model){
    const e = new Error("Backend configurado, mas faltam RHG_AI_API_KEY e RHG_AI_MODEL.");
    e.code = "NOT_CONFIGURED";
    throw e;
  }

  let instructions = `
Você é o RHG-Bot da RHGonçalves Serviços Elétricos.
Atue exclusivamente neste domínio. O usuário é Rafael, responsável pelos serviços.

REGRAS:

- O RHG-Bot sugere; Rafael decide.
- Não invente preços históricos.
- R$ 0,00 pode significar preço pendente, material do cliente ou item a providenciar.
- Taxa de disponibilidade sobre custo-base: até R$500 = 20%; acima de R$500 até R$1.000 = 15%; acima de R$1.000 = 10%.
- Tipo de cliente e perfil comercial são campos diferentes: Tipo = Residencial ou Comercial; Perfil = C, B, A ou AA. Nunca misture os dois. C/B/A/AA orientam apenas a apresentação de opções; não aplicam multiplicador automático nem alteram o preço da Base.
- Quando o usuário pedir uma estimativa, não peça confirmação antes de apresentar uma estimativa preliminar se houver informação suficiente para estimar.
- Para uma solicitação de orçamento com descrição suficiente do serviço, o modo "interpret" deve obrigatoriamente tentar preencher valores estimados quando não houver preços na BASE RHG.
- A ausência de detalhes secundários, como marca, modelo da luminária, distância exata até o quadro ou método definitivo de instalação, não deve impedir uma estimativa preliminar.
- Quando faltarem detalhes secundários, produza uma faixa de preço mais ampla e registre esses detalhes em "alerts" ou "notes".
- Só deixe o preço em 0 quando faltar uma informação essencial que torne a estimativa realmente inviável.
- No modo "interpret", nunca retorne um serviço com "unit":0 quando for possível produzir uma estimativa razoável.
- No modo "interpret", quando um serviço puder ser estimado, preencha obrigatoriamente "priceMin", "priceMax", "unit" e "source".
- No modo "assistant", quando o usuário pedir uma estimativa ou apresentar uma situação que claramente envolva orçamento, apresente a estimativa preliminar diretamente antes de solicitar informações adicionais.
- Informações adicionais devem ser apresentadas como fatores que podem alterar a estimativa, e não como pré-requisitos, quando for possível estimar sem elas.
- Exemplo de comportamento esperado: para "instalação de 5 pontos de iluminação no jardim, ao longo de 5 metros, criando infraestrutura elétrica", trate como um único serviço principal de instalação de iluminação externa com infraestrutura. Gere uma estimativa preliminar do serviço e sugira os materiais necessários separadamente. Não transforme a infraestrutura em um segundo serviço e não aguarde informações adicionais para fornecer uma primeira estimativa.

BASE RHG E PREÇOS:
- A BASE RHG é a fonte prioritária de preços quando houver correspondência adequada.
- Nunca invente um preço quando existir um preço cadastrado na BASE RHG.
- Para materiais, quando houver correspondência na BASE RHG, use "Preço Unitário" como referência.
- Para serviços, quando houver correspondência na BASE RHG, use "Preço Base" como referência.
- "Preço Unitário" e "Preço Base" são referências internas e não representam automaticamente o preço final cobrado do cliente.
- Quando houver preço médio ou último preço disponível, use-os apenas como informação auxiliar para análise.
- Os preços encontrados na BASE RHG são referências internas e podem ser alterados pelo usuário antes do fechamento do orçamento.
- Nunca invente um material ou serviço como se estivesse cadastrado na BASE RHG.
- A BASE RHG enviada no contexto é uma seleção dos registros potencialmente relevantes para a solicitação.
- Nunca presuma que um item está cadastrado na BASE RHG apenas porque ele não aparece na seleção fornecida.
- Se um material ou serviço necessário não existir na BASE RHG, ele pode ser sugerido, mas deve ser identificado como sugestão não cadastrada.

ESTIMATIVAS:
- A ausência de um preço na BASE RHG não significa que o orçamento deva ficar automaticamente pendente.
- Quando não houver preço na BASE RHG, faça uma estimativa usando seu conhecimento e o contexto disponível, desde que exista informação suficiente para uma estimativa razoável.
- Toda estimativa deve ser identificada claramente como "ESTIMATIVA_RHGBOT".
- Quando fizer uma estimativa, use "source":"ESTIMATIVA_RHGBOT".
- Quando usar um preço encontrado na BASE RHG, use "source":"BASE_RHG".
- Para serviços sem preço na BASE RHG, estime uma faixa de preço considerando natureza do serviço, quantidade, complexidade, infraestrutura envolvida e contexto fornecido.
- Para materiais sem preço na BASE RHG, estime uma faixa de preço quando houver especificação suficiente.
- Prefira uma faixa de preço (priceMin e priceMax) em vez de um valor único quando houver incerteza.
- Para uma estimativa, "priceMin" e "priceMax" devem representar uma faixa plausível.
- "unit" deve representar um valor de referência dentro da faixa, preferencialmente próximo ao ponto médio.
- Para preços encontrados na BASE RHG, use "referencePrice" e mantenha "priceMin" e "priceMax" iguais ao preço de referência, salvo quando houver justificativa clara.
- Nunca apresente uma estimativa como preço cotado, cadastrado ou confirmado pela RHGonçalves.
- Informe em "notes" quando a estimativa depender de quantidade, marca, dificuldade de instalação, distância, infraestrutura ou outra variável relevante.
- Quando a especificação do material for insuficiente para uma estimativa confiável, indique a especificação necessária e não invente uma marca ou modelo.
- Se houver informação insuficiente até mesmo para uma estimativa razoável, use 0 e explique o motivo em "notes" e "alerts".
- Não deixe "unit", "priceMin" e "priceMax" em 0 apenas porque não existe preço na BASE RHG quando houver informação suficiente para estimar.

INTERPRETAÇÃO DE SERVIÇOS:
- Identifique primeiro o serviço principal solicitado pelo cliente.
- Não transforme automaticamente uma etapa, infraestrutura ou característica do mesmo trabalho em um segundo serviço.
- Quando uma infraestrutura fizer parte da execução do serviço principal, trate-a como parte desse serviço e identifique os materiais necessários separadamente.
- Um único serviço pode ter vários materiais associados.
- Só crie mais de um serviço quando o pedido do cliente representar claramente serviços diferentes e independentes.
- Preserve a unidade cadastrada para materiais e serviços.

MATERIAIS ASSOCIADOS:
- Use "Materiais Associados" da BASE RHG como referência para identificar materiais normalmente utilizados naquele serviço.
- Se um serviço encontrado na BASE RHG possuir "Materiais Associados", considere esses materiais antes de sugerir materiais genéricos.
- Os materiais associados são sugestões e não são obrigatórios: avalie se fazem sentido para a solicitação específica.
- Se a BASE RHG não tiver os materiais associados ou seus preços, o RHG-Bot pode complementar com sugestões e estimativas.
- Nunca transforme automaticamente uma sugestão em item obrigatório.

ORGANIZAÇÃO DA RESPOSTA:
- Separe serviços, materiais, alertas e referências.
- Relacione cada grupo de materiais ao serviço correspondente quando houver relação.
- Materiais são sugestões editáveis, nunca obrigatórios.
- Se faltar informação essencial para definir o serviço ou a quantidade, marque como pendente.
- Preserve a distinção entre preço cadastrado na BASE RHG e estimativa do RHG-Bot.

COMUNICAÇÃO:
- Mensagens para cliente devem ser profissionais, claras e adequadas para WhatsApp.
- Nunca exponha ao cliente margem, custo-base, taxa interna ou classificação interna.

COMPOSIÇÃO DO ORÇAMENTO:

- O modo "interpret" deve produzir uma composição completa do orçamento, e não apenas identificar o serviço.
- Depois de identificar o serviço principal, determine os materiais necessários para sua execução.
- Para determinar os materiais, consulte primeiro "Materiais Associados" do serviço correspondente na BASE RHG.
- Quando houver materiais associados na BASE RHG, use-os como referência prioritária.
- Quando os materiais associados não forem suficientes para o serviço descrito, o RHG-Bot pode complementar com materiais necessários que não estejam cadastrados.
- Materiais complementares que não estejam na BASE RHG devem ser identificados como sugestões não cadastradas.
- Quando não houver correspondência na BASE RHG, utilize o conhecimento técnico do RHG-Bot para sugerir os materiais normalmente necessários para a execução do serviço.
- Cada material deve informar a qual serviço está relacionado por meio do campo "relatedService".
- O fato de um material não estar cadastrado na BASE RHG não impede sua sugestão.
- O modo "interpret" deve retornar pelo menos um serviço e, quando o serviço exigir materiais, deve retornar também os materiais necessários ou indicar em "alerts" por que não foi possível determinar algum material.
- Não retorne apenas o serviço quando for tecnicamente razoável identificar materiais necessários para sua execução.
- Quando a quantidade de material depender de uma medida ainda não informada, faça uma estimativa baseada nas informações disponíveis e indique que a quantidade precisa ser confirmada.

FORMATO PARA "interpret":

Retorne SOMENTE JSON válido, sem markdown e sem texto antes ou depois.

{
  "services": [
    {
      "qty": 1,
      "desc": "...",
      "unit": 0,
      "unitLabel": "...",
      "source": "BASE_RHG|ESTIMATIVA_RHGBOT|SUGESTAO_NAO_CADASTRADA",
      "referencePrice": 0,
      "priceMin": 0,
      "priceMax": 0,
      "confidence": "alta|media|baixa",
      "notes": "..."
    }
  ],
  "materials": [
    {
      "qty": 1,
      "desc": "...",
      "unit": 0,
      "unitLabel": "...",
      "supply": "RHGonçalves|Cliente|Sem preço",
      "source": "BASE_RHG|ESTIMATIVA_RHGBOT|SUGESTAO_NAO_CADASTRADA",
      "referencePrice": 0,
      "priceMin": 0,
      "priceMax": 0,
      "referenceSupplier": "",
      "relatedService": "...",
      "confidence": "alta|media|baixa",
      "notes": "..."
    }
  ],
  "alerts": [],
  "references": []
}

REGRAS OBRIGATÓRIAS PARA OS PREÇOS:

- "unit" é sempre o preço unitário correspondente à unidade indicada em "unitLabel".
- "priceMin" e "priceMax" também são valores UNITÁRIOS, não o total do item.
- Se qty=5 e o serviço custa aproximadamente R$180 a R$320 por ponto, use:
  "qty":5,
  "priceMin":180,
  "priceMax":320,
  "unit":250.
- Nunca coloque o valor total do serviço em "unit" quando "qty" for maior que 1.
- Para estimativas, "unit" deve ser aproximadamente o ponto médio entre priceMin e priceMax.
- Se houver preço na BASE RHG, use esse preço como "unit", "referencePrice", "priceMin" e "priceMax".
- Se não houver preço na BASE RHG, mas houver informação suficiente para estimar, NÃO use zero. Faça uma estimativa.
- Só use "unit":0, "priceMin":0 e "priceMax":0 quando realmente não houver informação suficiente para uma estimativa razoável.
- Quando usar estimativa, obrigatoriamente use "source":"ESTIMATIVA_RHGBOT".
- Quando usar preço da BASE RHG, obrigatoriamente use "source":"BASE_RHG".
- Quando sugerir item que não está cadastrado na BASE RHG, use "source":"SUGESTAO_NAO_CADASTRADA".
- Para materiais, "qty" deve representar a quantidade estimada do material e "unit" seu preço unitário.
- Para materiais cuja quantidade dependa de uma medida ainda não confirmada, estime com base nas informações disponíveis e registre a necessidade de confirmação em "notes" ou "alerts".

REGRAS DE COMPOSIÇÃO:

- Primeiro identifique o serviço principal.
- Não transforme infraestrutura, passagem de cabos, eletrodutos, fixações ou outras etapas necessárias em um segundo serviço quando forem parte do mesmo trabalho.
- Depois do serviço principal, identifique os materiais necessários para executá-lo.
- Consulte primeiro os "Materiais Associados" do serviço na BASE RHG.
- Se os materiais associados forem insuficientes, complemente com materiais necessários.
- Materiais sugeridos não precisam existir na BASE RHG.
- Materiais não cadastrados devem ser identificados como "SUGESTAO_NAO_CADASTRADA".
- Cada material deve informar "relatedService".
- Não retorne apenas o serviço quando for possível determinar materiais necessários.
- Materiais são sugestões editáveis e não obrigatórios.
- Se faltar uma informação secundária, faça uma estimativa mais ampla e registre a variável em "notes" ou "alerts".
- Não peça confirmação antes de fornecer uma estimativa preliminar quando houver informação suficiente para estimar.

REGRA ESPECÍFICA PARA O EXEMPLO DE ILUMINAÇÃO:

Para uma solicitação como:
"instalação de 5 pontos de iluminação no jardim, ao longo de 5 metros, criando a infraestrutura elétrica",

considere:

- um único serviço principal;
- quantidade do serviço compatível com os 5 pontos;
- materiais necessários para a infraestrutura;
- estimativa para o serviço;
- estimativa para os materiais quando houver informação suficiente;
- tipo de luminária, distância até a alimentação, método de instalação e necessidade de escavação devem ser tratados como fatores de ajuste, não como motivo automático para deixar todos os preços em zero.

Nunca apresente uma estimativa como preço cadastrado, cotado ou confirmado pela RHGonçalves.
FORMATO PARA "assistant":
{
  "advice":"...",
  "message":"...",
  "documentSummary":"...",
  "suggestedUpdates":[{"operation":"update|insert","sheet":"MATERIAIS|SERVIÇOS","recordId":"ID existente ou vazio para novo cadastro","name":"nome exato do item","unit":"unidade","field":"Preço Unitário|Preço Base","currentValue":0,"proposedValue":0,"reason":"motivo e referência do arquivo","confidence":"alta|media|baixa"}]
}
REGRAS PARA ARQUIVOS E ATUALIZAÇÃO DA BASE:
- Ao receber arquivo, leia seus dados e resuma o que encontrou em documentSummary.
- Se o arquivo trouxer preços/cadastros, compare com os registros relevantes fornecidos da BASE RHG e proponha somente diferenças identificáveis.
- suggestedUpdates deve ficar vazio quando não houver dado confiável para propor alteração.
- Não invente preço, nome, unidade, fornecedor, linha ou identificador. Não invente um ID/recordId. Para registro existente, use exatamente o ID encontrado na BASE RHG; para novo registro use operation=insert e recordId vazio.
- Para MATERIAIS, field deve ser Preço Unitário; para SERVIÇOS, field deve ser Preço Base. proposedValue deve ser numérico positivo e extraído do arquivo. currentValue deve refletir a Base enviada, ou null se novo.
- Não proponha atualização se nome/unidade/descrição não permitirem identificar o item com segurança. Use baixa confiança ou descreva a pendência em advice.
- Cada proposta precisa ter reason com página/aba/linha/fornecedor/data do arquivo se disponível. Preserve o preço anterior e nunca alegue que a Base já foi atualizada.
- Não use o perfil C/B/A/AA para alterar os valores cadastrados.
- O usuário precisa aprovar explicitamente cada proposta antes de qualquer escrita na Base RHG.
{
  "advice":"...",
  "message":"...",
  "documentSummary":"...",
  "suggestedUpdates":[]
}
`;

  if(payload?.mode !== "quote-description") instructions += "\n\n" + RHG_BOT_PRICING_KNOWLEDGE;

  if(payload?.mode === "quote-description") {
    instructions += `

MODO ESPECIAL: DESCRIÇÃO FINAL DO ORÇAMENTO
- Gere uma única descrição profissional, clara e comercial do trabalho, baseada EXCLUSIVAMENTE nos serviços e materiais finais recebidos no orçamento.
- Não invente serviços, quantidades, materiais, marcas, medidas, condições ou resultados que não estejam no contexto.
- Não mencione preços, margens, custos internos, estimativas ou a BASE RHG.
- Não transforme cada item em uma lista; produza um texto corrido, objetivo e profissional, adequado para a seção "Descrição do serviço" de um orçamento.
- Se houver serviços diferentes, integre-os em um único texto coerente.
- O texto deve ser compreensível para o cliente e tecnicamente fiel ao orçamento.
- Retorne SOMENTE este JSON válido, sem markdown, sem comentários e sem texto antes ou depois:
{
  "description":"..."
}
`;
  }

    // Consulta a Base RHG antes de enviar a solicitação à IA.
  // Neste primeiro momento buscamos materiais e serviços.
  // =====================================================
// CONSULTA COMPLETA À BASE RHG
// =====================================================

const description = [
  payload?.situation,
  payload?.serviceDescription,
  payload?.description,
  payload?.documentText,
  payload?.solicitacao
].filter(Boolean).join("\n\n") || JSON.stringify({ ...payload, attachments:(payload.attachments||[]).map(a=>({name:a.name,type:a.type,kind:a.kind})) });

const searchTerms = getSearchTerms(description);

let todosMateriais = [];
let todosServicos = [];
let materiaisAssociados = [];
let historicoMateriais = [];
let historicoServicos = [];
let regrasRHG = [];
let perfisCliente = [];

async function carregarAba(nome) {
  try {
    return await callRHGSheets(nome);
  } catch (e) {
    console.log(
      `Aviso: não foi possível consultar ${nome}:`,
      e.message
    );
    return [];
  }
}

// -----------------------------------------------------
// 1. CADASTROS PRINCIPAIS
// -----------------------------------------------------

todosMateriais = await carregarAba("MATERIAIS");
todosServicos = await carregarAba("SERVIÇOS");

// -----------------------------------------------------
// 2. RELAÇÃO SERVIÇO → MATERIAIS
// -----------------------------------------------------

materiaisAssociados =
  await carregarAba("MATERIAIS ASSOCIADOS");

// -----------------------------------------------------
// 3. HISTÓRICO DE PREÇOS
// -----------------------------------------------------

historicoMateriais =
  await carregarAba("HISTÓRICO DE PREÇOS");

historicoServicos =
  await carregarAba("HISTÓRICO DE PREÇOS SERVIÇOS");

// -----------------------------------------------------
// 4. REGRAS E PERFIS
// -----------------------------------------------------

regrasRHG =
  await carregarAba("REGRAS RHG");

perfisCliente =
  await carregarAba("PERFIS CLIENTE");

// -----------------------------------------------------
// 5. FILTRA OS REGISTROS MAIS RELEVANTES
// -----------------------------------------------------

const baseMateriais =
  filterRHGRecords(
    todosMateriais,
    searchTerms,
    payload?.attachments?.length ? 90 : 40
  );

const baseServicos =
  filterRHGRecords(
    todosServicos,
    searchTerms,
    payload?.attachments?.length ? 70 : 20
  );

// -----------------------------------------------------
// 6. MATERIAIS
// -----------------------------------------------------

const materiaisContexto =
  baseMateriais.map(item => ({
    id: item["ID Material"],
    material: item["Material"],
    categoria: item["Categoria"],
    unidade: item["Unidade"],
    marca: item["Marca"],
    fornecedor: item["Fornecedor/Loja"],
    cidade: item["Cidade"],

    preco_unitario:
      item["Preço Unitário"],

    preco_medio:
      item["Preço Médio"],

    ultimo_preco:
      item["Último Preço"],

    tipo_preco:
      item["Tipo de Preço"],

    data_cotacao:
      item["Data da Cotação"],

    fonte_cotacao:
      item["Fonte da Cotação"],

    observacoes:
      item["Observações"],

    ativo:
      item["Ativo"]
  }));

// -----------------------------------------------------
// 7. SERVIÇOS
// -----------------------------------------------------

const servicosContexto =
  baseServicos.map(item => ({
    id: item["ID Serviço"],

    nome:
      item["Nome do Serviço"],

    categoria:
      item["Categoria"],

    descricao:
      item["Descrição"],

    unidade:
      item["Unidade de Cobrança"],

    materiais_associados:
      item["Materiais Associados"],

    perfil_cliente:
      item["Perfil de Cliente"],

    preco_base:
      item["Preço Base"],

    tipo_preco_base:
      item["Tipo de Preço Base"],

    origem_preco_base:
      item["Origem do Preço Base"],

    data_ultimo_historico:
      item["Data do Último Histórico"],

    id_ultimo_historico:
      item["ID Último Histórico"],

    observacoes:
      item["Observações"],

    ativo:
      item["Ativo"]
  }));

// -----------------------------------------------------
// 8. MATERIAIS ASSOCIADOS
// -----------------------------------------------------

const materiaisAssociadosContexto =
  materiaisAssociados.map(item => ({
    id_servico:
      item["ID Serviço"],

    servico:
      item["Serviço"],

    id_material:
      item["ID Material"],

    material:
      item["Material"],

    quantidade:
      item["Quantidade"],

    unidade:
      item["Unidade"],

    observacoes:
      item["Observações"],

    ativo:
      item["Ativo"]
  }));

// -----------------------------------------------------
// 9. HISTÓRICO DE MATERIAIS
// -----------------------------------------------------

const historicoMateriaisContexto =
  filterRHGRecords(
    historicoMateriais,
    searchTerms,
    40
  );

// -----------------------------------------------------
// 10. HISTÓRICO DE SERVIÇOS
// -----------------------------------------------------

const historicoServicosContexto =
  filterRHGRecords(
    historicoServicos,
    searchTerms,
    30
  );

// -----------------------------------------------------
// 11. CONTEXTO COMPLETO DA BASE RHG
// -----------------------------------------------------

const hasVisualAttachment = Array.isArray(payload.attachments) && payload.attachments.some(file => file.kind==='pdf' || file.kind==='image');
const catalogoParaLeituraVisual = hasVisualAttachment ? {
  materiais: todosMateriais.filter(item=>String(item['Ativo']||'SIM').toUpperCase()!=='NÃO' && String(item['Ativo']||'SIM').toUpperCase()!=='NAO').slice(0,500).map(item=>({id:item['ID Material'],name:item['Material'],unit:item['Unidade'],currentPrice:item['Preço Unitário']})),
  servicos: todosServicos.filter(item=>String(item['Ativo']||'SIM').toUpperCase()!=='NÃO' && String(item['Ativo']||'SIM').toUpperCase()!=='NAO').slice(0,300).map(item=>({id:item['ID Serviço'],name:item['Nome do Serviço'],unit:item['Unidade de Cobrança'],currentPrice:item['Preço Base']}))
} : null;

const contextoBase = {

  materiais:
    materiaisContexto,

  servicos:
    servicosContexto,

  catalogo_para_comparacao_de_arquivos: catalogoParaLeituraVisual,

  materiais_associados:
    materiaisAssociadosContexto,

  historico_materiais:
    historicoMateriaisContexto,

  historico_servicos:
    historicoServicosContexto,

  regras_rhg:
    regrasRHG,

  perfis_cliente:
    perfisCliente
};

const { conversation: _conversation, ...payloadForModel } = payload;
const safePayload = { ...payloadForModel, attachments: (payload.attachments||[]).map(a=>({name:a.name,type:a.type,kind:a.kind})) };
const conversationText = Array.isArray(payload.conversation) ? payload.conversation.slice(-12).map(m=>`${m.role==='assistant'?'RHG-Bot':'Usuário'}: ${String(m.text||'').slice(0,5000)}`).join("\n\n") : '';
const requestText = `Responda em JSON. A resposta desta solicitação deve ser JSON válido.
CONTEXTO DA CONVERSA:
${conversationText}

SOLICITAÇÃO ATUAL E BASE RHG:
${JSON.stringify({ solicitacao: safePayload, base_rhg: contextoBase })}`;
const inputContent = [{type:'input_text',text:requestText}];
if (Array.isArray(payload.attachments)) {
  for (const attachment of payload.attachments) {
    if (attachment.kind==='pdf' && attachment.dataUrl) inputContent.push({type:'input_file',filename:attachment.name,file_data:attachment.dataUrl});
    else if (attachment.kind==='image' && attachment.dataUrl) inputContent.push({type:'input_image',image_url:attachment.dataUrl,detail:'high'});
  }
}
const input = [{role:'user',content:inputContent}];
  const body = {
    model,
    instructions,
    input,
    // Force the Responses API to return a JSON object for every RHG-Bot mode.
    // This removes the browser-dependent symptom where the model occasionally
    // returned prose/markdown instead of the object expected by the Web App.
    text: {
      format: { type: "json_object" }
    }
  };

  const r = await fetch(apiUrl,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+apiKey
    },
    body:JSON.stringify(body)
  });

  const text = await r.text();
  let data;
  try { data=JSON.parse(text); } catch { data={raw:text}; }
  if(!r.ok) throw new Error(data.error?.message || data.error || `IA retornou HTTP ${r.status}`);

  const outputText = data.output_text ||
    data.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join("") || "";

  if(!outputText) throw new Error("A IA retornou uma resposta sem texto.");

  function parseAIJson(text) {
    const raw = String(text || '').trim();
    const candidates = [];

    if (raw) {
      candidates.push(raw);
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenced) candidates.push(fenced[1].trim());

      // Procura um objeto JSON mesmo quando a IA colocou uma pequena
      // introdução antes dele. O scanner respeita strings e chaves aninhadas.
      let start = raw.indexOf('{');
      while (start >= 0) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < raw.length; i++) {
          const ch = raw[i];
          if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
          }
          if (ch === '"') { inString = true; continue; }
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              candidates.push(raw.slice(start, i + 1));
              break;
            }
          }
        }
        start = raw.indexOf('{', start + 1);
      }
    }

    // Some responses can contain an array or a JSON value wrapped in prose.
    // Try every balanced JSON object/array we can find, not only the first one.
    let arrayStart = raw.indexOf('[');
    while (arrayStart >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = arrayStart; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) {
            candidates.push(raw.slice(arrayStart, i + 1));
            break;
          }
        }
      }
      arrayStart = raw.indexOf('[', arrayStart + 1);
    }

    // Prefer the longest valid candidate: when the model adds explanatory
    // text around JSON, this is normally the complete structured response.
    candidates.sort((a,b)=>String(b).length-String(a).length);
    for (const candidate of candidates) {
      try { return JSON.parse(candidate); } catch {}
    }

    throw new Error("A resposta da IA não veio no JSON esperado.");
  }

  let result = parseAIJson(outputText);

  // No modo de descrição final, se a IA retornar texto puro em vez do JSON,
  // aproveitamos o texto em vez de descartar uma descrição válida.
  if (payload?.mode === "quote-description" && typeof result !== "object") {
    result = { description: String(result) };
  }

// Normaliza faixas de preço para o Web App.
// Se a IA fornecer priceMin/priceMax mas deixar unit vazio,
// usamos o ponto médio como valor de referência.
if (Array.isArray(result.services)) {
  result.services = result.services.map(item => {
    const min = Number(item.priceMin) || 0;
    const max = Number(item.priceMax) || 0;
    let unit = Number(item.unit) || 0;

    if (!unit && min > 0 && max > 0) {
      unit = (min + max) / 2;
    }

    return {
      ...item,
      unit
    };
  });
}

if (Array.isArray(result.materials)) {
  result.materials = result.materials.map(item => {
    const min = Number(item.priceMin) || 0;
    const max = Number(item.priceMax) || 0;
    let unit = Number(item.unit) || 0;

    if (!unit && min > 0 && max > 0) {
      unit = (min + max) / 2;
    }

    return {
      ...item,
      unit
    };
  });
}

return result;
}

function parseJsonField(value,fallback=[]){
  if(Array.isArray(value)) return value;
  if(value===null || value===undefined || value==='') return fallback;
  try{return JSON.parse(String(value));}catch{return fallback;}
}

const RHG_CATALOG_TTL = 3 * 60 * 1000;
let rhgCatalogCache = {updatedAt:0,data:null};

const server=http.createServer(async(req,res)=>{
    // =====================================================
    // RHG DATABASE API
    // =====================================================

    const allowedSheets = [
  "MATERIAIS",
  "FORNECEDORES",
  "SERVIÇOS",
  "CLIENTES",
  "ORÇAMENTOS",
  "COTAÇÕES",
  "REGRAS RHG",
  "HISTÓRICO DE PREÇOS",
  "HISTÓRICO DE PREÇOS SERVIÇOS",
  "MATERIAIS ASSOCIADOS",
  "PERFIS CLIENTE",
  "ORIGENS E TIPOS",
  "CONFLITOS E DUPLICIDADES",
  "HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS"
];


    // -----------------------------------------------------
    // CONSULTAR UMA ABA
    // -----------------------------------------------------

    if(
      req.method === "GET" &&
      req.url.startsWith("/api/rhg/data/")
    ){

      try {

        const sheet = decodeURIComponent(
          req.url
            .split("/api/rhg/data/")[1]
            .split("?")[0]
        );

        if(!allowedSheets.includes(sheet)){

          return send(res,400,{
            ok:false,
            error:"Aba não autorizada."
          });

        }

        const data = await callRHGSheets(sheet);

        return send(res,200,{
          ok:true,
          sheet,
          data
        });

      } catch(e){

        return send(res,502,{
          ok:false,
          error:e.message
        });

      }
    }


    // -----------------------------------------------------
    // GRAVAR / ATUALIZAR / DESATIVAR
    // -----------------------------------------------------

    if(
      req.method === "POST" &&
      req.url === "/api/rhg/data"
    ){

      let raw = "";

      req.on("data",chunk=>{
        raw += chunk;
      });

      req.on("end",async()=>{

        try {

          const body = JSON.parse(
            raw || "{}"
          );

          const {
            action,
            sheet,
            data,
            row
          } = body;


          if(!allowedSheets.includes(sheet)){

            return send(res,400,{
              ok:false,
              error:"Aba não autorizada."
            });

          }


          if(![
            "append",
            "update",
            "deactivate"
          ].includes(action)){

            return send(res,400,{
              ok:false,
              error:"Ação de escrita não autorizada."
            });

          }


          const result =
            await writeRHGSheets(
              sheet,
              action,
              data || {},
              row
            );


          return send(res,200,result);

        } catch(e){

          return send(res,502,{
            ok:false,
            error:e.message
          });

        }

      });

      return;
    }
  // =========================================================
  // FOTOS DOS ORÇAMENTOS — armazenamento compartilhado no Google Drive
  // =========================================================
  if (req.url.split("?")[0] === "/api/rhg/photos" && (req.method === "GET" || req.method === "POST")) {
    try {
      const body = req.method === "POST" ? await readJsonRequest(req) : {};
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const action = req.method === "GET" ? "list" : body.action;
      const payload = req.method === "GET" ? { quoteId: url.searchParams.get("quoteId") || "" } : body;
      if (! ["list", "upload", "get", "delete", "update"].includes(action)) return send(res, 400, { ok:false, error:"Ação de fotos inválida." });
      const result = await callRHGPhotoAction(action, payload);
      return send(res, 200, result);
    } catch (e) { return send(res, e.message.includes("muito grande") ? 413 : 502, { ok:false, error:e.message }); }
  }

  // =========================================================
  // RHG CATALOG - CACHE DE MATERIAIS E SERVIÇOS
  // =========================================================
  if(req.method==="GET" && req.url.split("?")[0]==="/api/rhg/catalog") {
    try {
      const forceRefresh = new URL(req.url, `http://${req.headers.host || "localhost"}`).searchParams.get("refresh") === "1";
      const now = Date.now();
      if (!forceRefresh && rhgCatalogCache.data && now - rhgCatalogCache.updatedAt < RHG_CATALOG_TTL) {
        return send(res,200,{ok:true,...rhgCatalogCache.data,cached:true,updatedAt:rhgCatalogCache.updatedAt});
      }
      const [materials, services, clients] = await Promise.all([
        callRHGSheets("MATERIAIS"),
        callRHGSheets("SERVIÇOS"),
        callRHGSheets("CLIENTES")
      ]);
      rhgCatalogCache = {
        updatedAt: now,
        data: {
          materials:Array.isArray(materials)?materials:[],
          services:Array.isArray(services)?services:[],
          clients:Array.isArray(clients)?clients:[]
        }
      };
      return send(res,200,{ok:true,...rhgCatalogCache.data,cached:false,updatedAt:now});
    } catch(error) {
      return send(res,502,{ok:false,error:error.message});
    }
  }

  // =========================================================
  // RHG ORÇAMENTOS - HISTÓRICO COMPARTILHADO
  // Estrutura da aba ORÇAMENTOS:
  // ID Interno | Número do Orçamento | Data | ID Cliente | Cliente |
  // Serviços | Materiais | Subtotal | Desconto | Total | Status |
  // Observações | Fonte do Documento | Tipo de Registro
  // =========================================================
  if(req.method==="GET" && req.url.split("?")[0]==="/api/rhg/quotes"){
    try{
      const rows=await callRHGSheets("ORÇAMENTOS");
      const quotes=(Array.isArray(rows)?rows:[]).map((row,index)=>({
        _sheetRow:Number(row._row||index+2), id:String(row["ID Interno"]||""),
        quoteNumber:String(row["Número do Orçamento"]||""), date:row["Data"]||"",
        updatedAt:row["Atualizado em"]||row["Data"]||"", version:Number(row["Versão"]||1),
        status:String(row["Status"]||"Em análise"),
        client:{id:String(row["ID Cliente"]||""),name:String(row["Cliente"]||""),phone:String(row["Telefone do Cliente"]||""),type:String(row["Tipo de Cliente"]||"Residencial"),profile:String(row["Perfil do Cliente"]||""),address:String(row["Endereço do Cliente"]||"")},
        description:String(row["Descrição do Serviço"]||row["Observações"]||""),
        quoteDescription:String(row["Descrição do Orçamento"]||""),
        discount:Number(row["Desconto"]||0), conditions:String(row["Condições Comerciais"]||""),
        subtotal:Number(row["Subtotal"]||0),total:Number(row["Total"]||0),
        services:parseJsonField(row["Serviços"],[]),materials:parseJsonField(row["Materiais"],[]),
        fonteDocumento:String(row["Fonte do Documento"]||""),tipoRegistro:String(row["Tipo de Registro"]||"")
      })).filter(q=>q.id || q.quoteNumber);
      return send(res,200,{ok:true,quotes});
    }catch(e){return send(res,502,{ok:false,error:e.message});}
  }

  if(req.method==="POST" && req.url==="/api/rhg/quotes"){
    try{
      const body=await readJsonRequest(req);
      const d=body.quote||body.data||{};
      if(!d.id) throw new Error("Orçamento sem ID.");
      if(!d.client?.name?.trim()) throw new Error("Nome do cliente não informado.");
      const quote={...d,subtotal:Number(d.subtotal||0),discount:Number(d.discount||0),total:Number(d.total||0)};
      const result=await callRHGSheetsAction("saveQuote",{quote});
      return send(res,200,{ok:true,...result});
    }catch(e){return send(res,502,{ok:false,error:e.message});}
  }

  try{
    if(req.method==="GET" && req.url.split("?")[0]==="/health"){
      return send(res,200,{ok:true,app:"RHGonçalves Web App",status:"online"});
    }

    if(req.method==="POST" && (req.url==="/api/rhg/interpret" || req.url==="/api/rhg/assistant" || req.url==="/api/rhg/quote-description")){
      try {
        const body=await readJsonRequest(req,18*1024*1024);
        const mode=req.url.endsWith("/interpret")?"interpret":req.url.endsWith("/quote-description")?"quote-description":"assistant";
        if(mode==='assistant' && Array.isArray(body.attachments) && body.attachments.length){
          const prepared=prepareAssistantAttachments(body.attachments);
          body.attachments=prepared.attachments;
          body.documentText=[body.documentText||'',prepared.documentText].filter(Boolean).join('\n\n').slice(0,120000);
        }
        const result=await callRHGBot({mode,...body});
        if(mode==='assistant' && Array.isArray(result.suggestedUpdates) && result.suggestedUpdates.length){
          const sourceFiles=(body.attachments||[]).map(a=>a.name).filter(Boolean).join(', ');
          result.suggestedUpdates=result.suggestedUpdates.map(proposal=>signApprovalProposal({...proposal,sourceName:proposal.sourceName||sourceFiles||'Análise RHG-Bot'}));
        }
        return send(res,200,result);
      } catch(e) {
        return send(res,e.message.includes('limite')?413:(e.code==="NOT_CONFIGURED"?503:502),{error:e.message});
      }
    }

    // Aprovação explícita e validada de alterações sugeridas pelo RHG-Bot.
    if(req.method==="POST" && req.url==="/api/rhg/assistant/approve"){
      try {
        const body=await readJsonRequest(req,1024*1024);
        const updates=Array.isArray(body.updates)?body.updates:[];
        if(!updates.length||updates.length>30) throw new Error('Selecione entre 1 e 30 propostas para aprovação.');
        const results=[];
        for(const proposal of updates){
          const proposalKey=String(proposal._proposalKey||'');
          try {
          if(!verifyApprovalProposal(proposal)){results.push({ok:false,proposalKey,name:proposal.name||'',message:'Proposta inválida ou expirada. Faça uma nova análise do arquivo antes de aprovar.'});continue;}
          const sheet=proposal.sheet;
          if(!['MATERIAIS','SERVIÇOS'].includes(sheet)) {results.push({ok:false,proposalKey,name:proposal.name||'',message:'Aba não permitida.'});continue;}
          const value=Number(proposal.proposedValue);
          if(!Number.isFinite(value)||value<=0||value>100000000) {results.push({ok:false,proposalKey,name:proposal.name||'',message:'Preço proposto inválido.'});continue;}
          const rows=await callRHGSheets(sheet);
          const isMaterial=sheet==='MATERIAIS';
          const idField=isMaterial?'ID Material':'ID Serviço';
          const nameField=isMaterial?'Material':'Nome do Serviço';
          const priceField=isMaterial?'Preço Unitário':'Preço Base';
          if(proposal.field && proposal.field!==priceField){results.push({ok:false,proposalKey,name:proposal.name||'',message:'Campo de preço não corresponde à aba indicada.'});continue;}
          if(proposal.confidence==='baixa'){results.push({ok:false,proposalKey,name:proposal.name||'',message:'Confiança baixa. Revise o cadastro manualmente antes de aprovar.'});continue;}
          const itemName=String(proposal.name||proposal.itemName||'').trim();
          if(!['insert','update'].includes(proposal.operation||'update')){results.push({ok:false,proposalKey,name:itemName,message:'Operação da proposta não reconhecida.'});continue;}
          if(!itemName){results.push({ok:false,proposalKey,name:'',message:'Nome do item não informado.'});continue;}
          if(proposal.operation==='insert'&&!String(proposal.unit||'').trim()){results.push({ok:false,proposalKey,name:itemName,message:'A unidade é obrigatória para cadastrar um item novo.'});continue;}
          let record=null;
          if(proposal.operation==='insert'){
            const duplicate=(rows||[]).find(r=>normalizeText(r[nameField])===normalizeText(itemName));
            if(duplicate){results.push({ok:false,proposalKey,name:itemName,message:`Já existe na Base com ID ${duplicate[idField]||'sem ID'}. A proposta precisa ser convertida em atualização.`});continue;}
          } else {
            const recordId=String(proposal.recordId||'').trim();
            record=(rows||[]).find(r=>recordId&&String(r[idField]||'').trim()===recordId);
            if(!record&&itemName) record=(rows||[]).find(r=>normalizeText(r[nameField])===normalizeText(itemName));
            if(!record){results.push({ok:false,proposalKey,name:itemName,message:'O item correspondente não foi encontrado na Base. Atualização cancelada.'});continue;}
            if(itemName&&normalizeText(record[nameField])!==normalizeText(itemName)){results.push({ok:false,proposalKey,name:itemName,message:'O identificador e o nome da proposta não correspondem ao mesmo registro. Atualização cancelada.'});continue;}
            const current=Number(String(record[priceField]||'0').replace(',','.'))||0;
            if(proposal.currentValue!==undefined&&proposal.currentValue!==null&&proposal.currentValue!==''){
              const expected=Number(String(proposal.currentValue).replace(/[^0-9,.-]/g,'').replace(',','.'));
              if(Number.isFinite(expected)&&Math.abs(current-expected)>0.01){results.push({ok:false,proposalKey,name:itemName,message:`O preço atual mudou desde a análise (Base: ${current.toFixed(2)}). Atualize a análise antes de aprovar.`});continue;}
            }
          }
          const now=new Date();
          const date=now.toISOString();
          const sourceName=String(proposal.sourceName||proposal.source||'Arquivo enviado ao RHG-Bot').slice(0,180);
          const reason=String(proposal.reason||'Atualização aprovada pelo responsável RHG.').slice(0,900);
          if(isMaterial){
            const materialName=itemName||String(record?.[nameField]||'');
            const materialId=record?.[idField]||nextSequentialId(rows,idField,'MAT');
            const history=await callRHGSheets('HISTÓRICO DE PREÇOS');
            const historyId=nextSequentialId(history,'ID Registro','HIST-MAT');
            const historyRow={'ID Registro':historyId,'Data':date,'Material':materialName,'Fornecedor/Loja':String(proposal.supplier||''),'Unidade':String(proposal.unit||record?.['Unidade']||''),'Preço Unitário':value,'Fonte':sourceName,'Observações':reason,'Tipo de Preço':'REFERÊNCIA DE MERCADO','Tipo de Registro':'Atualização aprovada RHG-Bot'};
            if(proposal.operation==='insert'){
              await writeRHGSheets('MATERIAIS','append',{'ID Material':materialId,'Material':materialName,'Unidade':String(proposal.unit||''),'Preço Unitário':value,'Último Preço':value,'Data da Cotação':date,'Fonte da Cotação':sourceName,'Tipo de Preço':'REFERÊNCIA DE MERCADO','Origem do Preço':sourceName,'Data do Último Histórico':date,'ID Último Histórico':historyId,'Ativo':'SIM'});
            } else {
              await writeRHGSheets('MATERIAIS','update',{'Preço Unitário':value,'Último Preço':value,'Data da Cotação':date,'Fonte da Cotação':sourceName,'Tipo de Preço':'REFERÊNCIA DE MERCADO','Origem do Preço':sourceName,'Data do Último Histórico':date,'ID Último Histórico':historyId},record._row);
            }
            await writeRHGSheets('HISTÓRICO DE PREÇOS','append',historyRow);
            results.push({ok:true,proposalKey,name:materialName,message:`${materialId} atualizado para R$ ${value.toFixed(2).replace('.',',')}.`});
          } else {
            const serviceName=itemName||String(record?.[nameField]||'');
            const serviceId=record?.[idField]||nextSequentialId(rows,idField,'SVC');
            const history=await callRHGSheets('HISTÓRICO DE PREÇOS SERVIÇOS');
            const historyId=nextSequentialId(history,'ID Registro','HIST-SVC');
            const historyRow={'ID Registro':historyId,'Data':date,'ID Serviço':serviceId,'Serviço':serviceName,'Preço Unitário':value,'Quantidade':1,'Valor':value,'Fonte':sourceName,'Tipo de Preço':'REFERÊNCIA DE MERCADO','Observações':reason};
            if(proposal.operation==='insert'){
              await writeRHGSheets('SERVIÇOS','append',{'ID Serviço':serviceId,'Nome do Serviço':serviceName,'Unidade de Cobrança':String(proposal.unit||'unidade'),'Preço Base':value,'Tipo de Preço Base':'REFERÊNCIA DE MERCADO','Origem do Preço Base':sourceName,'Data do Último Histórico':date,'ID Último Histórico':historyId,'Observações':reason,'Ativo':'SIM'});
            } else {
              await writeRHGSheets('SERVIÇOS','update',{'Preço Base':value,'Tipo de Preço Base':'REFERÊNCIA DE MERCADO','Origem do Preço Base':sourceName,'Data do Último Histórico':date,'ID Último Histórico':historyId,'Observações':reason},record._row);
            }
            await writeRHGSheets('HISTÓRICO DE PREÇOS SERVIÇOS','append',historyRow);
            results.push({ok:true,proposalKey,name:serviceName,message:`${serviceId} atualizado para R$ ${value.toFixed(2).replace('.',',')}.`});
          }
          } catch(proposalError) {
            results.push({ok:false,proposalKey,name:proposal.name||proposal.itemName||'',message:proposalError.message||'Falha ao aplicar esta proposta.'});
          }
        }
        rhgCatalogCache={updatedAt:0,data:null};
        return send(res,200,{ok:results.some(r=>r.ok),results});
      } catch(e) { return send(res,502,{ok:false,error:e.message}); }
    }

    let filePath=req.url.split("?")[0];
    if(filePath==="/" || filePath==="") filePath="/index.html";
    const safe=path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
    const full=path.join(__dirname,safe);
    if(!full.startsWith(__dirname)){send(res,403,"Forbidden","text/plain");return}
    if(!fs.existsSync(full) || fs.statSync(full).isDirectory()){send(res,404,"Not found","text/plain");return}
    const ext=path.extname(full);
    send(res,200,fs.readFileSync(full),mime[ext]||"application/octet-stream");
  }catch(e){send(res,500,{error:e.message})}
});

server.listen(PORT,"0.0.0.0",()=>console.log(`RHGonçalves Web App listening on port ${PORT}`));


// RHG_SHARED_HISTORY_API_V15
const RHG_ORCAMENTOS_SHEET = "ORÇAMENTOS";

function rhgNormalizeSheetQuote(row) {
  const parseItems = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try { return JSON.parse(value); } catch (_) { return []; }
  };
  return {
    idInterno: row["ID Interno"] || "",
    numeroOrcamento: row["Número do Orçamento"] || "",
    data: row["Data"] || "",
    idCliente: row["ID Cliente"] || "",
    cliente: row["Cliente"] || "",
    servicos: parseItems(row["Serviços"]),
    materiais: parseItems(row["Materiais"]),
    subtotal: Number(row["Subtotal"] || 0),
    desconto: Number(row["Desconto"] || 0),
    total: Number(row["Total"] || 0),
    status: row["Status"] || "Em Análise",
    observacoes: row["Observações"] || "",
    fonteDocumento: row["Fonte do Documento"] || "",
    tipoRegistro: row["Tipo de Registro"] || ""
  };
}

async function rhgGetOrcamentos() {
  const response = await fetch(`${RHG_SHEETS_URL}?sheet=${encodeURIComponent(RHG_ORCAMENTOS_SHEET)}`);
  if (!response.ok) throw new Error("Falha ao consultar a aba ORÇAMENTOS.");
  const body = await response.json();
  if (!body.ok) throw new Error(body.error || "Falha ao consultar a aba ORÇAMENTOS.");
  return Array.isArray(body.data) ? body.data.map(rhgNormalizeSheetQuote) : [];
}

async function rhgAppendOrUpdateOrcamento(payload) {
  // The Apps Script API supports append/update by row number, but the backend
  // does not know the row until it queries the sheet. We use ID Interno as the
  // stable key and update an existing row when found.
  const current = await rhgGetOrcamentos();
  const existing = current.find(x => x.idInterno === payload["ID Interno"]);

  const action = existing && existing._row ? "update" : "append";
  const body = action === "update"
    ? {action: "update", sheet: RHG_ORCAMENTOS_SHEET, row: existing._row, data: payload}
    : {action: "append", sheet: RHG_ORCAMENTOS_SHEET, data: payload};

  const response = await fetch(RHG_SHEETS_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Falha ao gravar o orçamento na Base RHG.");
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Falha ao gravar o orçamento.");
  return result;
}



// Shared history routes
if (typeof app !== "undefined" && app.post && app.get) {
  app.get("/api/orcamentos", async (req, res) => {
    try {
      const data = await rhgGetOrcamentos();
      res.json({ok: true, data});
    } catch (error) {
      res.status(500).json({ok: false, error: error.message});
    }
  });

  app.post("/api/orcamentos", async (req, res) => {
    try {
      const result = await rhgAppendOrUpdateOrcamento(req.body || {});
      res.json({ok: true, ...result});
    } catch (error) {
      res.status(500).json({ok: false, error: error.message});
    }
  });
}

const RHG_JSON_RESPONSE_INSTRUCTION = "Return the answer as JSON. The word JSON is required because the response format is JSON.";
