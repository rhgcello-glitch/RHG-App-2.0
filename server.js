require('dotenv').config();
const http = require("http");
const fs = require("fs");
const path = require("path");

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
- Perfis de cliente: comercial, baixa, comum, alta, alto padrão. Só use a classificação quando informada.
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
  "message":"..."
}
`;

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

const description =
  payload?.serviceDescription ||
  payload?.description ||
  payload?.solicitacao ||
  JSON.stringify(payload);

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
    40
  );

const baseServicos =
  filterRHGRecords(
    todosServicos,
    searchTerms,
    20
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

const contextoBase = {

  materiais:
    materiaisContexto,

  servicos:
    servicosContexto,

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

const input = `Responda em JSON. A resposta desta solicitação deve ser JSON válido.
${JSON.stringify({
  solicitacao: payload,
  base_rhg: contextoBase
})}`;
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
  "CONFLITOS E DUPLICIDADES"
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
  // RHG CATALOG - CACHE DE MATERIAIS E SERVIÇOS
  // =========================================================
  if(req.method==="GET" && req.url.split("?")[0]==="/api/rhg/catalog") {
    try {
      const forceRefresh = new URL(req.url, `http://${req.headers.host || "localhost"}`).searchParams.get("refresh") === "1";
      const now = Date.now();
      if (!forceRefresh && rhgCatalogCache.data && now - rhgCatalogCache.updatedAt < RHG_CATALOG_TTL) {
        return send(res,200,{ok:true,...rhgCatalogCache.data,cached:true,updatedAt:rhgCatalogCache.updatedAt});
      }
      const [materials, services] = await Promise.all([
        callRHGSheets("MATERIAIS"),
        callRHGSheets("SERVIÇOS")
      ]);
      rhgCatalogCache = {
        updatedAt: now,
        data: {materials:Array.isArray(materials)?materials:[],services:Array.isArray(services)?services:[]}
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
        _sheetRow:index+2, // linha 1 = cabeçalho
        id:String(row["ID Interno"]||""),
        quoteNumber:String(row["Número do Orçamento"]||""),
        date:row["Data"]||"",
        updatedAt:row["Data"]||"",
        status:String(row["Status"]||"Em análise"),
        client:{
          name:String(row["Cliente"]||""),
          phone:"",
          type:"Residencial",
          profile:"Comum",
          address:""
        },
        description:String(row["Observações"]||""),
        quoteDescription:String(row["Observações"]||""),
        discount:Number(String(row["Desconto"]||0).replace(',','.'))||0,
        conditions:"",
        subtotal:Number(String(row["Subtotal"]||0).replace(',','.'))||0,
        total:Number(String(row["Total"]||0).replace(',','.'))||0,
        services:parseJsonField(row["Serviços"],[]),
        materials:parseJsonField(row["Materiais"],[]),
        idCliente:String(row["ID Cliente"]||""),
        fonteDocumento:String(row["Fonte do Documento"]||""),
        tipoRegistro:String(row["Tipo de Registro"]||"")
      })).filter(q=>q.id || q.quoteNumber);
      return send(res,200,{ok:true,quotes});
    }catch(e){
      return send(res,502,{ok:false,error:e.message});
    }
  }

  if(req.method==="POST" && req.url==="/api/rhg/quotes"){
    let raw="";
    req.on("data",c=>raw+=c);
    req.on("end",async()=>{
      try{
        const body=JSON.parse(raw||"{}");
        const d=body.quote||body.data||{};
        if(!d.id) throw new Error("Orçamento sem ID.");

        // Lê a aba atual para localizar o ID Interno. Isso impede que
        // cada salvamento crie uma nova linha do mesmo orçamento.
        const rows=await callRHGSheets("ORÇAMENTOS");
        const rowsArray=Array.isArray(rows)?rows:[];
        const existingIndex=rowsArray.findIndex(row=>String(row["ID Interno"]||"")===String(d.id));
        const sheetRow=existingIndex>=0 ? Number(rowsArray[existingIndex]._row || existingIndex+2) : null;

        const data={
          "ID Interno":String(d.id),
          "Número do Orçamento":String(d.quoteNumber||""),
          "Data":String(d.date||new Date().toISOString()),
          "ID Cliente":String(d.client?.id||d.clientId||d.idCliente||""),
          "Cliente":String(d.client?.name||""),
          "Serviços":JSON.stringify(d.services||[]),
          "Materiais":JSON.stringify(d.materials||[]),
          "Subtotal":Number(d.subtotal ?? 0),
          "Desconto":Number(d.discount||0),
          "Total":Number(d.total ?? 0),
          "Status":String(d.status||"Em análise"),
          "Observações":String(d.observations||d.description||d.quoteDescription||""),
          "Fonte do Documento":String(d.source||"RHG-App"),
          "Tipo de Registro":String(d.recordType||"ORÇAMENTO")
        };

        const action=sheetRow ? "update" : "append";
        const result=await writeRHGSheets("ORÇAMENTOS",action,data,sheetRow);
        return send(res,200,{ok:true,action,row:sheetRow,result});
      }catch(e){
        return send(res,502,{ok:false,error:e.message});
      }
    });
    return;
  }

  try{
    if(req.method==="GET" && req.url.split("?")[0]==="/health"){
      return send(res,200,{ok:true,app:"RHGonçalves Web App",status:"online"});
    }

    if(req.method==="POST" && (req.url==="/api/rhg/interpret" || req.url==="/api/rhg/assistant" || req.url==="/api/rhg/quote-description")){
      let raw="";
      req.on("data",c=>raw+=c);
      req.on("end",async()=>{
        let body;
        try{body=JSON.parse(raw||"{}")}catch{return send(res,400,{error:"JSON inválido."})}
        try{
          const mode=req.url.endsWith("/interpret")?"interpret":req.url.endsWith("/quote-description")?"quote-description":"assistant";
          const result=await callRHGBot({mode,...body});
          send(res,200,result);
        }catch(e){
          send(res,e.code==="NOT_CONFIGURED"?503:502,{error:e.message});
        }
      });
      return;
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
