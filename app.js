const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const services=$('#services'),materials=$('#materials'),draftKey='rhgDraft',historyKey='rhgHistory';
const DEFAULT_STATUS='Em análise';

let sharedHistoryCache=[];
let historySyncTimer=null;
function normalizeQuoteFromServer(q){
  return {
    ...q,
    id: q.id || Date.now(),
    quoteNumber:q.quoteNumber||null,
    date:q.date||new Date().toISOString(),
    updatedAt:q.updatedAt||q.date||new Date().toISOString(),
    status:q.status||DEFAULT_STATUS,
    client:{name:'',phone:'',type:'Residencial',profile:'Comum',address:'',...(q.client||{})},
    services:Array.isArray(q.services)?q.services:[],
    materials:Array.isArray(q.materials)?q.materials:[],
    discount:Number(q.discount||0),
    description:q.description||'',
    quoteDescription:q.quoteDescription||'',
    conditions:q.conditions||''
  };
}
function dedupeHistory(list){
  const map=new Map();
  (list||[]).forEach(item=>{
    const q=normalizeQuoteFromServer(item);
    const key=String(q.id||q.quoteNumber||'');
    if(!key)return;
    const old=map.get(key);
    if(!old || String(q.updatedAt)>String(old.updatedAt)) map.set(key,q);
  });
  return [...map.values()].sort((a,b)=>String(b.updatedAt||b.date).localeCompare(String(a.updatedAt||a.date)));
}
async function syncQuoteToServer(d){
  try{
    const r=await fetch('/api/rhg/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quote:d})});
    const data=await r.json();
    if(!r.ok || !data.ok) throw new Error(data.error||'Não foi possível sincronizar o orçamento.');
    return true;
  }catch(e){
    console.warn('Histórico compartilhado indisponível:',e.message);
    return false;
  }
}
async function loadSharedHistory(){
  try{
    const r=await fetch('/api/rhg/quotes',{cache:'no-store'});
    const data=await r.json();
    if(!r.ok || !data.ok) throw new Error(data.error||'Não foi possível carregar o histórico compartilhado.');
    sharedHistoryCache=dedupeHistory(data.quotes||[]);
    localStorage.setItem(historyKey,JSON.stringify(sharedHistoryCache));
    renderHistory();
    return sharedHistoryCache;
  }catch(e){
    sharedHistoryCache=dedupeHistory(JSON.parse(localStorage.getItem(historyKey)||'[]'));
    renderHistory();
    return sharedHistoryCache;
  }
}
function scheduleHistorySync(d){
  clearTimeout(historySyncTimer);
  historySyncTimer=setTimeout(()=>syncQuoteToServer(d),350);
}

const PHOTO_DB_NAME='rhgAppPhotos';
const PHOTO_DB_VERSION=1;
let photoObjectUrls=[];

function openPhotoDB(){
 return new Promise((resolve,reject)=>{
   const req=indexedDB.open(PHOTO_DB_NAME,PHOTO_DB_VERSION);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true})};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||new Error('Não foi possível abrir o armazenamento de fotos.'));
 });
}
async function savePhotoBlob(quoteId,blob,name,description=''){
 const db=await openPhotoDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction('photos','readwrite');
   const req=tx.objectStore('photos').add({quoteId,blob,name,description:String(description||'').trim(),createdAt:new Date().toISOString()});
   req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
 });
}
async function getPhotos(quoteId){
 if(!quoteId)return [];
 const db=await openPhotoDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction('photos','readonly');
   const req=tx.objectStore('photos').getAll();
   req.onsuccess=()=>resolve(req.result.filter(x=>x.quoteId===quoteId).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))));
   req.onerror=()=>reject(req.error);
 });
}
async function deletePhoto(photoId){
 const db=await openPhotoDB();
 return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');const req=tx.objectStore('photos').delete(photoId);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)});
}
async function deletePhotosForQuote(quoteId){
 if(!quoteId)return;
 const db=await openPhotoDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction('photos','readwrite');
   const store=tx.objectStore('photos');
   const req=store.getAll();
   req.onsuccess=()=>{
     (req.result||[]).filter(photo=>photo.quoteId===quoteId).forEach(photo=>store.delete(photo.id));
   };
   req.onerror=()=>reject(req.error);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
 });
}
async function updatePhotoDescription(photoId,description){
 const db=await openPhotoDB();
 return new Promise((resolve,reject)=>{
   const tx=db.transaction('photos','readwrite');
   const store=tx.objectStore('photos');
   const req=store.get(photoId);
   req.onsuccess=()=>{const photo=req.result;if(!photo)return reject(new Error('Foto não encontrada.'));photo.description=String(description||'').trim();store.put(photo);};
   req.onerror=()=>reject(req.error);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
 });
}
function revokePhotoUrls(){photoObjectUrls.forEach(url=>URL.revokeObjectURL(url));photoObjectUrls=[];}
async function renderPhotos(quoteId){
 const gallery=$('#photoGallery'); if(!gallery)return;
 revokePhotoUrls(); gallery.innerHTML='';
 if(!quoteId){$('#photoStatus').textContent='Salve o orçamento para começar a anexar fotos.';return}
 try{
   const photos=await getPhotos(quoteId);
   $('#photoStatus').textContent=photos.length?`${photos.length} foto${photos.length===1?'':'s'} anexada${photos.length===1?'':'s'} a este orçamento.`:'Nenhuma foto anexada.';
   photos.forEach(photo=>{
     const card=document.createElement('div');card.className='photo-item';
     const img=document.createElement('img');img.alt=photo.name||'Foto do serviço';const url=URL.createObjectURL(photo.blob);photoObjectUrls.push(url);img.src=url;
     const description=document.createElement('textarea');description.className='photo-description';description.placeholder='Descreva esta foto (opcional)';description.value=photo.description||'';description.rows=2;description.addEventListener('change',async()=>{await updatePhotoDescription(photo.id,description.value)});
     const btn=document.createElement('button');btn.type='button';btn.className='photo-remove';btn.textContent='×';btn.title='Remover foto';btn.onclick=async()=>{await deletePhoto(photo.id);await renderPhotos(quoteId)};
     card.append(img,description,btn);gallery.appendChild(card);
   });
 }catch(e){$('#photoStatus').textContent='Não foi possível carregar as fotos: '+e.message}
}
async function handlePhotos(files){
 if(!files?.length)return;
 let d=JSON.parse(localStorage.getItem(draftKey)||'null');
 if(!d){d=saveDraft();}
 const quoteId=d.id;
 try{
   for(const file of files){if(file.type.startsWith('image/'))await savePhotoBlob(quoteId,file,file.name,'')}
   await renderPhotos(quoteId);
 }catch(e){$('#photoStatus').textContent='Não foi possível salvar as fotos: '+e.message}
}

function addRow(type,d={}){
 const row=$(type==='service'?'#serviceTpl':'#materialTpl').content.firstElementChild.cloneNode(true);

 row.querySelector('.qty').value=d.qty??1;
 row.querySelector('.desc').value=d.desc??'';
 row.querySelector('.unit').value=d.unit??0;

 if(type==='material'&&d.supply){
   row.querySelector('.supply').value=d.supply;
 }

 const sourceEl=row.querySelector('.source');

 if(sourceEl){
   const source=d.source||'';

   if(source==='BASE_RHG'){
     sourceEl.textContent='BASE RHG';
     sourceEl.dataset.source='base';
   }else if(source==='ESTIMATIVA_RHGBOT'){
     sourceEl.textContent='ESTIMATIVA RHG-BOT';
     sourceEl.dataset.source='estimate';
   }else if(source==='SUGESTAO_NAO_CADASTRADA'){
     sourceEl.textContent='SUGESTÃO NÃO CADASTRADA';
     sourceEl.dataset.source='suggestion';
   }else{
     sourceEl.textContent='';
     sourceEl.dataset.source='';
   }
 }

 row.querySelectorAll('input,select').forEach(e=>e.addEventListener('input',calc));

 row.querySelector('.remove').onclick=()=>{
   row.remove();
   calc();
 };

 (type==='service'?services:materials).appendChild(row);
 if (typeof rhgAttachAutocomplete === 'function') rhgAttachAutocomplete(row,type);
 calc();
}
function calc(){
 let st=0,mt=0;
 $$('.service-grid.row').forEach(r=>{let v=(+r.querySelector('.qty').value||0)*(+r.querySelector('.unit').value||0);st+=v;r.querySelector('.line').textContent=money(v)});
 $$('.material-grid.row').forEach(r=>{let b=(+r.querySelector('.qty').value||0)*(+r.querySelector('.unit').value||0),v=r.querySelector('.supply').value==='RHGonçalves'?b:0;mt+=v;r.querySelector('.line').textContent=money(v)});
 let d=+$('#discount').value||0,t=Math.max(0,st+mt-d);$('#serviceTotal').textContent=money(st);$('#materialTotal').textContent=money(mt);$('#grandTotal').textContent=money(t);
}
function collect(){
 const existing=JSON.parse(localStorage.getItem(draftKey)||'null');
 return {id:existing?.id||Date.now(),quoteNumber:existing?.quoteNumber||null,date:existing?.date||new Date().toISOString(),status:$('#quoteStatus')?.value||existing?.status||DEFAULT_STATUS,
 client:{name:$('#clientName').value,phone:$('#clientPhone').value,type:$('#clientType').value,profile:$('#clientProfile').value,address:$('#clientAddress').value},
 description:$('#serviceDescription').value,quoteDescription:existing?.quoteDescription||'',quoteDescriptionFingerprint:existing?.quoteDescriptionFingerprint||'',services:$$('.service-grid.row').map(r=>({qty:+r.querySelector('.qty').value||0,desc:r.querySelector('.desc').value,unit:+r.querySelector('.unit').value||0})),
 materials:$$('.material-grid.row').map(r=>({qty:+r.querySelector('.qty').value||0,desc:r.querySelector('.desc').value,unit:+r.querySelector('.unit').value||0,supply:r.querySelector('.supply').value})),
 discount:+$('#discount').value||0,conditions:$('#conditions').value};
}
function nextQuoteNumber(){
 const h=JSON.parse(localStorage.getItem(historyKey)||'[]');
 const now=new Date();
 const prefix=String(now.getMonth()+1).padStart(2,'0')+String(now.getFullYear()).slice(-2);
 const nums=h.filter(x=>x.quoteNumber?.startsWith(prefix+'-')).map(x=>Number(x.quoteNumber.split('-')[1])||0);
 return prefix+'-'+String((nums.length?Math.max(...nums):0)+1).padStart(3,'0');
}
function ensureQuoteNumber(d){if(!d.quoteNumber)d.quoteNumber=nextQuoteNumber();return d;}
function saveDraft(){
 const before=JSON.parse(localStorage.getItem(draftKey)||'null');
 const wasNew=!before?.quoteNumber;
 const d=ensureQuoteNumber(collect());
 $('#quoteNumberLabel').textContent=`Orçamento ${d.quoteNumber}`;
 localStorage.setItem(draftKey,JSON.stringify(d));
 if(wasNew)showSavedToast(d.quoteNumber);
 let h=dedupeHistory([d,...JSON.parse(localStorage.getItem(historyKey)||'[]')]);
 localStorage.setItem(historyKey,JSON.stringify(h));
 sharedHistoryCache=h;
 renderHistory();
 scheduleHistorySync(d);
 return d;
}

function loadDraft(){
 const d=JSON.parse(localStorage.getItem(draftKey)||'null');if(!d){$('#quoteNumberLabel').textContent='Ainda não salvo';renderPhotos(null);return;}
 $('#quoteNumberLabel').textContent=d.quoteNumber?`Orçamento ${d.quoteNumber}`:'Ainda não salvo';$('#clientName').value=d.client.name||'';$('#clientPhone').value=d.client.phone||'';$('#clientType').value=d.client.type||'Residencial';$('#clientProfile').value=d.client.profile||'Comum';$('#clientAddress').value=d.client.address||'';$('#serviceDescription').value=d.description||'';$('#quoteStatus').value=d.status||DEFAULT_STATUS;$('#discount').value=d.discount||0;$('#conditions').value=d.conditions||$('#conditions').value;
 services.innerHTML='';materials.innerHTML='';(d.services||[]).forEach(x=>addRow('service',x));(d.materials||[]).forEach(x=>addRow('material',x));calc();renderPhotos(d.id);
}
function showSavedToast(number){
 let el=$('#saveToast');
 if(!el){el=document.createElement('div');el.id='saveToast';el.className='save-toast';document.body.appendChild(el)}
 el.textContent=`Orçamento ${number} salvo com sucesso.`;
 el.classList.add('show');
 clearTimeout(window.__saveToastTimer);
 window.__saveToastTimer=setTimeout(()=>el.classList.remove('show'),3200);
}
async function clearAll(){
 const previous=JSON.parse(localStorage.getItem(draftKey)||'null');
 localStorage.removeItem(draftKey);
 $('#quoteNumberLabel').textContent='Ainda não salvo';
 $('#quoteStatus').value=DEFAULT_STATUS;
 $('#clientName').value='';
 $('#clientPhone').value='';
 $('#clientAddress').value='';
 $('#serviceDescription').value='';
 $('#discount').value=0;
 services.innerHTML='';
 materials.innerHTML='';
 $('#interpretStatus').textContent='A integração real será conectada ao agente.';
 const result=$('#interpretResult');
 if(result) result.classList.add('hidden');
 const advice=$('#interpretAdvice');
 const message=$('#interpretMessage');
 if(advice) advice.textContent='';
 if(message) message.textContent='';
 if(previous?.id){
   try{await deletePhotosForQuote(previous.id);}catch(e){console.warn('Não foi possível limpar as fotos do orçamento:',e);}
 }
 revokePhotoUrls();
 await renderPhotos(null);
 addRow('service');
 addRow('material');
 calc();
}
function renderHistory(){
 const q=$('#historySearch').value.toLowerCase(),status=$('#historyStatus').value;
 const h=dedupeHistory(sharedHistoryCache.length?sharedHistoryCache:JSON.parse(localStorage.getItem(historyKey)||'[]'));
 const list=h.filter(x=>(!status||x.status===status)&&(`${x.client?.name||''} ${x.description||''} ${x.quoteNumber||''}`.toLowerCase().includes(q)));
 $('#historyList').innerHTML=list.length?list.map(x=>`<div class="history-item"><strong>Orçamento ${x.quoteNumber||'—'} · ${x.client?.name||'Cliente sem nome'}</strong><small>${new Date(x.date).toLocaleString('pt-BR')}</small><span class="status-badge status-${String(x.status||'').toLowerCase().replace(/[^a-zà-ÿ0-9]+/gi,'-')}">${x.status||DEFAULT_STATUS}</span><div>${x.description||'Sem descrição'} · <b>${money((x.services||[]).reduce((a,s)=>a+s.qty*s.unit,0)+(x.materials||[]).filter(m=>m.supply==='RHGonçalves').reduce((a,m)=>a+m.qty*m.unit,0)-x.discount)}</b></div><button class="btn ghost" onclick="openHistory('${String(x.id).replace(/'/g,"\\'")}')">Abrir</button></div>`).join(''):'<p class="hint">Nenhum orçamento encontrado.</p>';
}
window.openHistory=async id=>{
  let h=sharedHistoryCache.length?sharedHistoryCache:dedupeHistory(JSON.parse(localStorage.getItem(historyKey)||'[]'));
  let d=h.find(x=>String(x.id)===String(id));
  if(!d){await loadSharedHistory();h=sharedHistoryCache;d=h.find(x=>String(x.id)===String(id));}
  if(!d)return;
  localStorage.setItem(draftKey,JSON.stringify(d));
  loadDraft();showPage('quote');
};

function showPage(id){$$('.page').forEach(p=>p.classList.toggle('hidden',p.id!==id));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));if(id==='history')renderHistory()}
$$('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('#addService').onclick=()=>addRow('service');$('#addMaterial').onclick=()=>addRow('material');$('#discount').oninput=calc;$('#saveBtn').onclick=()=>saveDraft();
$('#newBtn').onclick=async()=>{if(confirm('Começar um novo orçamento?'))await clearAll()};
loadSharedHistory();
$('#historySearch').oninput=renderHistory;$('#historyStatus').onchange=renderHistory;$('#quoteStatus').onchange=()=>{if(localStorage.getItem(draftKey))saveDraft()};
$('#photoInput').onchange=async e=>{await handlePhotos(e.target.files);e.target.value=''};

$('#interpretBtn').onclick=async()=>{
 const q=$('#serviceDescription').value.trim();
 if(!q){$('#interpretStatus').textContent='Descreva o serviço primeiro.';return}
 $('#interpretBtn').disabled=true;$('#interpretStatus').textContent='Consultando o RHG-Bot...';
 try{
   const d=collect();
   const r=await fetch('/api/rhg/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     description:q,
     context:{client:d.client,services:d.services,materials:d.materials,discount:d.discount}
   })});
   const data=await r.json();
   if(!r.ok) throw new Error(data.error||'Falha na integração');
   // A interpretação é cumulativa: nunca apagamos serviços ou materiais já adicionados.
   // Cada nova interpretação apenas acrescenta os itens retornados pelo RHG-Bot.
   const existingServiceKeys=new Set($$('.service-grid.row').map(r=>`${r.querySelector('.desc').value.trim().toLowerCase()}|${r.querySelector('.unit').value}|${r.querySelector('.qty').value}`));
   const existingMaterialKeys=new Set($$('.material-grid.row').map(r=>`${r.querySelector('.desc').value.trim().toLowerCase()}|${r.querySelector('.unit').value}|${r.querySelector('.supply').value}|${r.querySelector('.qty').value}`));
   let addedServices=0,addedMaterials=0;
   (data.services||[]).forEach(x=>{
     const key=`${String(x.desc||'').trim().toLowerCase()}|${x.unit??0}|${x.qty??1}`;
     if(String(x.desc||'').trim() && !existingServiceKeys.has(key)){addRow('service',x);existingServiceKeys.add(key);addedServices++;}
   });
   (data.materials||[]).forEach(x=>{
     const key=`${String(x.desc||'').trim().toLowerCase()}|${x.unit??0}|${x.supply||''}|${x.qty??1}`;
     if(String(x.desc||'').trim() && !existingMaterialKeys.has(key)){addRow('material',x);existingMaterialKeys.add(key);addedMaterials++;}
   });
   $('#interpretStatus').textContent=`Interpretação recebida: ${addedServices} serviço(s) e ${addedMaterials} material(is) adicionados. Os itens anteriores foram preservados.`;
   saveDraft();
 }catch(e){
   $('#interpretStatus').textContent='Não foi possível consultar o RHG-Bot: '+e.message;
 }finally{$('#interpretBtn').disabled=false}
};

const RHG_PDF_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA8MAAAI3CAYAAAC/AYmNAAAABmJLR0QA/wD/AP+gvaeTAAAgAElEQVR4nOzdd5xkVZ338e+ZGYackyIKioJiANQVEyomjCiYMIsBA+qqaw5r3lXXNeCqq/voYwB91owBMxjXCIqrICooIJJznvR5/rjVzp1LdXfdqltV3TOf9+vly9vV9/zO75zqHvpX995zEkmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEnrozLtBCRJ0oYH2DXJ05LcJMkvkny6lHLtVJOSJEmSJGkcgG2BtwPXsK4/A/ecdn6SJEmSJHUG2AR4GXAxs1sJ3GXauUqSJEmSNBJgCfA04Kw5iuAZfwS2n3bOkiRJkiQNDbg/8KsBimCAi4C9pp2zJEmSJElDAf4BOH7AIhjgWuAe085bkiRJkqTWgD2BzwBrWhTCa4AnTjt3SZIkSZJaAXYA3gZc16IInvGyaecvSZIkSVMFHAQsn3YeGgywOfAK4PIhimCA/5r2GCRJkiRpqoA39AqkPwCPmXY+mh2wEXAEcO6QRTDAccCylv22Ol+SJEmSFrRaIVz3beC2085N6wIeTLUF0ihOBLZo2e8zgKuBh41rbJIkSZI0MbMUwjNWAO8Ftp52nhs6YBfgcyMWwQBnAru06LcAb6m1vwS40TjHKkmSJEljNU8hXHcR8I/A0mnnvCECHgtc3LLoPRF4c6/tY6huq/4v4HYt+t0YOKZP7PeOc7ySJEmSNDYtCuG6k4ADpp37hgLYBji65Xt0HvDYDvreDvj+LH2c0sX4JEmSJGmihiyE674C7DbtcazPgPsBZ7V8Xy4A9uig71sAp87Rz2+7GKMkSZIkTQyjF8Izru7F2nTaY1qfAJsA7wbWDPGeHNJB//sD58/Tz5u7GKskSZIkTQTdFcJ1ZwNPAcq0x7fYAfsCvxvyffhdB/0fQvUhx1wuAbbrYrySJEmSNHaMpxCu+x6wz7THuVgBTwSuGWH+3zFi//8IrB6gn3/qasySJEmSNFaMvxCesRr4BLDTtMe8WADLgHd1MPfPGiGHhw7Yx5nAJl2OX5IkSZLGAvjnDgqtti4BXgAsm/b4FzJgCfDJjub8OSPksfeAfTyly/FLkjZsS6adgCRpvbfzFPrcNslRSX4LPGQK/S8W70zypI5i3WqEtn8a4Jz/TXLMCH1IkiRJ0uRQ7Rd7UUdXH4f1FTrY8md9Aryu4zl+4wi5bDJA/Ad3OX5JkiRJGjuqW5anbQXwXmCrac/HtAEHAKs6nNsvAktHyGfPeeKf0OX4JUmSJGkigKXAbzosvkbxN+AIYIN8VAjYhmohqq4cD2w8Yk7PmyP+GuAuXY1fkiRJkiYKuH+HBVgX3jvtOZkG4NMdzuEvgC1HzGc5cNocffx3V2OXJEmSpKkAvtRhITaq3017PiYNeHqH8/dHYOTF0YA3ztHHCmCUhbkkSZIkafqAWwDXdliQjWINsM2052RSgD2AKzqau3OA3UfMZyPgLfP084GOhi9JkiRJ0wX8a0cFWRfuP+35mARgGfDTjubsMmCfFn3vBhwM7AXsDNwReAlz3xoNcCVwo3HOiyRJkiRNDLAF1ZXFheA1056PSaC7DyCuAe7Zot/bAWcP2dcbxjglkiRJkjR5wFM7Ks5G9eVpz8W40d02SquAQ1r0ex+qq8jDuAC3wJIkSZK0vgEK3d22O4oLpj0X40R32yitAQ5v0e8hjPZs+JHjnBdJkiRJmhrgTsDqDgq1Ud182nMxDsDWdPeBw9ta9Pt8RntfzwCWj3NuJEmSJGmqgI93UqqN5vETGuuuwNHAfwH7j7mvpcBXO5yji4F7zdNnAd7QQV+PHefcSJIkSdLUUa0ufHkHBdQo3jOhsb641uca4GPAjh3GL7XjcazYfS3wuFn6XkZV5I/qh9TGIUmSJEnrLeBVHRRRo/jJhMZ5ZJ++LwaeDSwZMfZBwJd6xzcHrhvTXK0Bnt7oe3Pgax3EXgncYZR5kCRJkqRFA1gO/KGDYmpY1wEbT2CcB82Rw0+BOw0Rs1B9mLAKeGnvtQ+Neb5WAY/o9bUD8POO4r6l6zmXJEmSpAUNeGRHBdWw7jKBMe4+Tw5rgM8Btx0w3la982fckupZ4QvGMkPruhLYm2qRri72jD4JF82SJEmStCECvtFBUTWsF05gfEsYbLuh1cD3qG6r3rVPnEK1ddHZtTbXUxXC+3c7LXM6iepZ4cNGjHMdcPtxz78kSZIkLUjAbameG52GL05ojL8fIreLgBOAY4BPAKf0OecPvfiPHyL+X4HvAL+k/fy/vNfvcUP0O+Mlk5h7SZIkSVqwgKNGKKpGdRRjXskY+OOYcv9lL/5LW7RZARxBbfEu4EbA+6lu2R7EpcB2wF3bJFvzA0ZcPEySJEmSFj1gW+DCIQurLvznOIsz4LIx5X1KL/7LWrR5/Rx5PpHqdu1BvKHX5mctc74M2G1ccy1J0nz8NFaStGCUUi5NMmuRNgHPTvJJYFnXgYFdkmzdddyezXv/f3WLNh+e7RullGOSvHPAOM8Alib5jxZ9J8kLSylntmwjSZIkSesnqoWgTm55lbFrXwY26XhcTxljviuBLZh7+6a6NcxzS3gv3uUDxjsA2J7Bb6/+TJdzK0nSMLwyLElaUEopq5O8aMppPDzJccAWHcY8vMNYTcuS3CXJr5IwwPklyZy3KJdSrkpywoD9P6CUcnGSUwY49/dJnjVgXEmSxsZiWJK04JRSTkjy+SmncWCqgnirUQMBByW5z8gZze2epZQLkvx6wPMfM8A55w8Y6w69///hPOddluTgUsrlA8aVJGlsLIYlSQvVS5JcM+UcDkhyPLDDsAGAnZP8n+5SmtXje7c+f2rA819Fn32MG24xYKyZ8/40xznXJnlMKeWPA8aUJGmsLIYlSQtSKeWsJO+edh5J7pTk+1QLYLXSa/PNJPMVnV24dZJ7Jfl4qsJzPtsm+Qpwo37fBPbL4FezN+39/yWzfP/yJAeVUr4zYDxJkiRJ2rABt6BafOq9wC+BVQMu0tS1M4BBr5QG2A84Z8I5frbX97+1aHM+8Ex6z0cDS4CH0y733/faPq3P986jKqwlSZIkScOiWuX4nsA/Ap/pFVuTciZwq3nyuxXwMaZTtK+hmpvtqIrcNlYCfwEuHaLfb/fG3tzn+BsMcUVdkiRJkjQAYBeqq5lvA34EXDtEQTeo84A79Mlhd+BrwOox9j2IXwPLgMdOsM/39+bgvb2vrwBcMVqSJEmSJgnYGHjlGIu/i4A7N/oswPvG2OegLgdu3cvpPyfU54N7/f2k9785r55LkiRJksYIeOMYC8Argfv26fMNY+xzPn8AblvLZWPghDH3eUGvny2BfwKWTvZdliRJkiTdAPCOMRaCV1PtIdzs89Vj7HM2x9JnT2SqIvVnY+z3+ZN5JyVJkiRJA6O6fXmctwtfDzyqT7/PZTLPD6+kuho963aJVAXxd8fQ9y+Bjcb7DkqSJEmShkK1XdDRYygGZ6wCntan3ydRFavjchZwjwHnYGPgIx32/TdgEvsnS5IkSZKGBSyl2oppXNYAL+jT7+OAFWPo7wvAdkPMQxcLi51DnxW1JUmSJEkLELAcOK6DYnA2a4CX9un3IcA1HfVxGXDEkOPfDPjViP1/B7jp6O+GJEmSJGliegXh90csCOfztj793ptq/91RfJ0Rbk0Gjhmx/wtxtWhJkiRJWpyArYBfjFgYzuc/gNLo9+7ApUPEOgM4bMQxv7ijce0z2uxLkiRJksauV4B+ndr+u73Xt2H0W4bn8yEaqzwD+1HtzTuIi6iK2OUjzsE96G4hr/1GyUWSJEmSNEbArsAnqJ7jBTgf2Ktxzk7AqR0VibP5NI3th4BbA2fP0eYM4BXANh3Mw3ZUq0534QQaV7slSZIkSQsAsDnVvrv9Fqw6C9itcf5NgT93VCzO5ivAJo1+96AqemespFrc61Dm2DO45VwU4EsdjeFcYJcu8pIkSZIkdaRX+D29V7TN5ffAzo22t6TaN3ecjge2aPS7K/BF4IXATmOYk66eE14BHNB1fpIkSZKkEQB3AH7corj7DY09eoHbUz2jO04/BLae0JzsC1zfUd7/NImcJUmSJEkDoNom6Q1DFn0/A7ZsxNuX4VZ7buNEYIcxz8ty4OSO8v0xHd22LUmSJEkaEfBw4C8jFno/AjZvxL07cNWIcedzCnCTPmNaBhxA46r1EHPzLx3meuAouUiSJEmSOgDsSPWcbVe+RmPrIuAgurvFeDYnA0trfW4BfK/3vTOBWww5P/vT3TZKV476fkmSJEmSRkRVpJ7TUaFX9wVgWaOvR9JdUdl0DXD/Wl9bUj1PXPcnWm6tBGxEddW5Kxd09d5JkiRJklqi2i7pQx0Wef18jMYeusCTgNUd9zNIITzjDS3n6ciOc11J40MCSZIkSdIEADehWnRqEt7fp//DgTUdxW9TCAP8rMU8bQmc11Gedbfu6r2UJEmSJA2AanXns8dQ4M3l3X3y+McO4rYthAFObTFXb+0gx34e3dX7KUmSJEmaB3AocPWYCrz5vLpPPm8cIV6zEN4cOGGAdscNOFdbAZeNkN9cPtzl+ypJkiRJmgXwXLq7NbmtbwMPnCWvdwwRr98V4R8N2PafBpyvlw2R16AuwueGJUmSJGm8gBcw+UJ4JXAMsN88uRXggy3ijlIIXwZsNcB8bQSc1SKnYRzcxXsrSZIkSeoDeAmTL4S/DdyhRY5LgKMHiHs1wxfCUM3DO4HN5snn0JbjHcaJNFbaliRJkiR1AHjpBIq6um8Bdx4y16XAZ+aIfTVwv9r5bQvhuiuBL1NtLfXfwGMauXx+yLhtHTrqeyxJkiRJqgGezOSuCJ8NPKWDnJcDx/WJ3yyENwe+12H+t6jF3ha4rsPYc/kTsOmo8yZJkiRJSgI8nOqZ3XFbAbwX2KLD3DcDvl/rY9yF8ImN/o/oMPYg3tTV3EmSJEnSBgu4J9UiU+P2E2DPMY1hK+DnjL8QBnhto+9vdBx/PtcDtx7HPEqSJEnSBgHYC7hkAsXbqxnz1kDA9sA9al9vCfx4DOO5fa2PLYBrx9DHfL6Hi2lJkiRJUntUz7qeNuai7RRgnymMbRxXhAHOo1aEMplVpGfz+EnPqyRJXVsy7QQkSRsWYGmSo5OM5bblni8muVsp5eQx9nEDwOZJvpbk3mMI/51SCrWvHzqGPgb1yin2LUlSJyyGJUmT9q4kDxlT7FVJXllKObSUcvmY+uirVwgfl/EUwkny3cbX9+t71mTshbdKS5IWubE+QyVJUh3wzCQvHFP4i5M8opTy4zHFnxWwZZJvJLn7GLs5vtbfLZLs1nF8kpyQ5KtJTk5yVpI1SXZIcuve/26VZJvc8Cq1JEmSJKkf4B6Mb0/c04G9pji2949pXDN+1+jvmR3H/y5wu2nNnyRJ0+Bt0pKksQN2T/Uc78ZjCP+TJPuXUk4bQ+xBbT/m+J9ufP2gDmO/Jcn9Sym/7TCmJEmSJG3YqLYAOrnjK5kzvg9ssQDGuBPw2zGNEeCWtb62oru9md81y3g2B24zuRmUJEmSpPUIUIDPd1S4NX0D2HTaY5wB7Agc28hxNfAl4JXAmiHH+T+Nfp4x9Iyt64vAkkbs/YGvU+UN8IaJTqIkSZIkrQ+A13ZUuDV9Ddhk2uPrB9gdOBi4N7Bz7fWjhxzr8xvxT+hg/q4Fdm3EfSawos+5r5/U3EmSJEnSogccBKzqoHBr+j4LtBCeC/DwIca6AtixFmNX1l61HcV7Grk9lLnfKwtiSZIkSZoPsCdwWQdFW9NvgW2nPb5hUN1G3dYXGzFe3sEcrgZuXou5BDhlgHZvm/ysSZIkSdIiAWwJ/K6Doq3pbOCm0x7fsICbDDHmhzdidLEQ2dcaMQ9t0dYrxJIkSZLURHWV8csdFGxNFwN7T3t8owDu0nLM5wLLau336WguD2nk9b2W7S2IJUmSJKkOeFNHBVvdtcA9pz22UQFvbznudzTaH9XBXF5O43lr4F7AVS3jWBBLkiRJUpIAj2b47YNmswo4dNpjGxWwDDir5dj3rrXfhOrq+Kg+Okt+D6D93sUWxJIkSZI2bMAjges7KNaajpz22LoAPKbluD/YaP/EjubzgXPkaEEsSZIkSYMCnkH//WlH9W/THltXgG+2GPd/AqXR/vgO5vMCas8gz5KnBbEkSZIkzQVYCry7gyKtn88CS6Y9xi4Am1M99zyIE4CljfY3p5vbz98/YL4WxJIkSZLUD9X2SeNYNRrg58Bm0x5jV6gWqBrESmDXPu3f2tG8HtgiZwtiSZIkSaoDtgFO6qhAa/ojsOO0x9gl4OkDjv3YPm2XAud0MK8XMc8t0n36tiCWJK3X1otb0CRJkwFsnOS4JPuNIfzVSR5RSrlwDLGnabsBz/tVn9cenGSXDnL4cillVZsGpZRvJ3lEkmtbNHuDBbEkabGwGJYktfH8JHcbU+wjSymnjCn2NK0e8LwVfV47vKMcvjRzABQaew3PplcQPzLtC+J/bpmfJEmSJC1cwCkd3LLbz6emPbZxAQ4bcA6+3mi3PXBdB3N7NbVnsIE7Ad8CNm0xhgfS/pZpC2JJkiRJix+wCd2satx0CbDztMc3LsDtBpyHjzTavbij+f18I+6/9F7/PrB5i3H4DLEkSZKkDQ/V7bVdLObU9Nxpj22cevP253nmYA2wd63NUqrFxLpwWCOf39e+Z0EsSZIkSfMBXthRgTbjbGD5tMc1bsAb5pmHLzbOf3RH83s1sEUt7r59zrEgliRJkqS5AMuAn45Unq3rpdMe0yQAWwDnzjEPd2uc/5OO5vezjbhvmeU8C2JJkiRJmguwF3DF8PXZ360Gdpj2eCYFeBCwqs88fKdx3r06mNsZj2nEPnWOcy2IJUmSJGkuwIOBlcPVZ3/Xb1/d9RrwXNZdhGwNcKfGOV8dcV5nXEWtuAVuP0AbC2JJkiRJmgvwTEZbXfrd0x7DNABH1Obt6Mb37jnCfDa9rxH7jQO2syCWJEmSpLlQFXarWxZCMx4+7fynpTdv1wF7NF7/0ZBz2bQKuGUt7lLg9Bbt2+5DfBBwbcscX9flnEqSJEnSRAFPoirs2vgrsNG0c58m4A6Nrw9pOYdzaS6c9cghYrS9QvxA2l8h/ueu5lOSJEmSJo7q9t4LWhRBh80fdcNBtUr3KS0Lybk0V6c+Ycg4FsSSJEmSNBdgF+AbAxQ/75l2rgsN8OKWBeRcftQn/mdHiOct05IkSZI0F6AATwfO7FPwXAe8EijTznMhAW4KXDl8rXoD9+vTx1LgmBFieoVYkiRJkuYDbAw8HvgI8BngdcDu085rIQK+NEKR2vStOfqxIJYkSZIkTR/dLpq1Bth/nv4siCVJkiRJ0wPsAJwzQmHa9LkB+51GQdz2GWILYkmSJEla31A9W33sCAVp0yrg1i36tyCWJEmSJE0WcOQIhWg//zFEDhbEkiRJkqTJAG5L++do53IxsMOQuVgQS5IkSZLGC9gaOHWE4rOf5zX6eCrw6BY5LWOy+xA/DFjdso/XtplnSZIkSdICQXUV9qsjFJ39/BZYVutjW+B8YCULuyD+xBB9WBBLkiRJ0mIDvGeEYnM292708b7a9xZsQQw8ecg+LIglSZIkabEAnjlCkTmboxt97EO1qnTdgiyIgceP0IcFsSRJkiQtdMDBwIoRir9+Lgd2qfVRgB/Mcu6CK4iBd44QHyyIJUmSJGnhAu5P+9WTB/HcRj9Pmuf8BVMQA5sD540Qe8aLR31/JEmSJEkdA+4OXNlB0df0c2BprZ+tgL8N0G5BFMTA+0eIWbcaOLSr90uSJEmSNCKqQvjyjoq+uhXAvo2+2txyPNWCGHjpCLH6uRi4SZfvnSRJkiRpCFS3Ro/jijDAa/r093xgTYsYUymI6b4QnvHf3b6DkiRJkqRWqJ7d7XqxrBk/pnZ7dKPfhV4QnzZC2/msAfbr7l2UJEmSJA0MeBntCtI2rgBuMU//R7TsfxXwhBbjWwocM4axdeEjo7+DkiRJkqSBAUuAd4+52HvKgLks9CvE43IlsNnw76IkSZIkaWDAcuDTYy703tEypw21IL5j+3dQkiRJktQKsCXwzTEXeF9llueE58ltQyyI79x2niRJkiRJLQA3Bf53zMXdicDmI+S4oT1DbDEsSZIkSeMC7AecM+bC7k/ALh3kuiFdIbYYliRJkqRxAB4AXD7mou5MYPcOc95QrhBbDEuSWlky7QQkSVoMgCOSHJdkqzF2c2aSe5dS/tJVwFLKh5O8MAkDNlma5OMMeIW4lLI6ya+GTE+SJEmStBABmwEfncCVzbOYZy/hEccxlivEwIvHMRlD8MqwJEmSJHUBuCPwuwkUcqcCN5vAeDp7hhgowOu7n4qhWQxLkiRJ0iiAzYG3UV0dHbefAztOcGzDFMQvBzbrtV8C3Bs4oeN5GJXFsCRJkiQNA9gReAXwtwkVcN8FtpzCONsWxADXA6cz/gXEhmUxLElqZdm0E5AkaVqApUn2S3JgkvsmuU+STSbU/UeTPLeUsmJC/f1dKeU/gCQ5KkkZsNnyJGN7prkDK6edgCRJkiQtaMAmwOuAC6ZwBXMV8KJpz0Ey9BXihegKYONpz6ckaXHxyrAkaYNCtYfv15LsPYXuL0tyWCnlm1Po+wZ6V4hXJPnPDH6FeCE6tpRy/bSTkCQtLhbDkqQNBrBTku8l2W0K3Z+W5BGllNOm0PesSikfBpan3S3TC82npp2AJEmSJC1YwGemdBvvN4Btpj3+udB+H+KF4o/AkmnPnyRp8fE/HpKkDQLV7dF998wds/ckeWgp5bIp9D2wUsqHk7wwCdPOpaV/L6WsmXYSkqTFx9ukJUkbintksrcBX5/keaWUj06wz5EswmeI/5jkI9NOQpK0OFkMS5I2FEsn2Ne5SR5VSvnJBPvsxCJ7hvilpRS3VJIkSZKk2QC3mtAzrCcCN5v2eEfFwn+G+NPTniNJkiRJWhSAH4+5QPso69F+tyzcfYjPAnaY9vxIkiRJ0qIAHDim4mwl8IJpj28cWHhXiFcA95j2vEiSJEnSogJ8ouPi7CLgftMe1zixcAri1cBh054PSZIkSVp0gK2BMzsqzk4Gdpv2mCaB6d8yvQZ43rTnQZIkSZIWLWA/4KoRi7NfAdtPeyyTxPSuEK8CnjXt8UuSJEnSogc8muq222H8gQ2sEJ7B5K8QXwo8dNrjliRJkqT1BnA47QviK4DbTjv3aQKOHGLehnEisMe0xytJkiRJ6x3gOS0Ku5XAg6ad80JAdWX9mjEVwdcCrwY2mvY4JUmSJGm9BRw6YGF35LRzXUiAvYFfdFgEr6Za7XuDWJRMkiRJkqYOuDPwx1mKtDXAi6ad40IELAWeMsfcDeIS4D3ALac9HkmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEnqXJl2ApIkSTOAfZMckuTSJB8spVw/5ZQkSZIkSRov4ETWevy085Ekrb+WTTsBSRoGsCTJw5LsnWSbAZpcm+SqJFcmuSzJOUn+t5RyxQg5PDLJnZMcV0r5n2HjDNDPHVNdKftdKeX/dRRz+yQHJjkgyR5JbpJkq963r01yfpI/J/lZkuNLKad30a80gC1qx1tOLQtJkiRpIQKOYnRrgNOBTwEHA8tb9L9fLc7VwKZjGucS4OJaX/caIVYBDgI+D6xoOVc/BZ4FbNLl+KQm4LTaz90R085HkiRJWlCAc1oWc4O4CHg7sO0A/T+40XbnMY1z00Y/jxsyzp2AH3YwR2cDzwGWdj1WKbEYliRNjrdJS1p0gJJkp9pL1yQZZJGdbTL3woHbJ3l5kqcCh5dSvj58lgsD1e3kb0ryqiRL+pxyZZITk5yR5MJU87hpkt2S7Jlkn6w7Z7sm+WCSw4AnlFL+Nr7sJUmSJEl/ByxtXK18QYu2mwK7UV3ZfTnwLWBlnyugq4BnzRFnwV8ZBjYHju0ztquAjwAHAHN+KArsDrwUOKVPnPOBvUcfpbSWV4YlSZKkWYxSDM8SbwfgNcCVfQrih8zSZkEXw8Ay4BuNtmuAjwM3HiKPJcATgL81Yv4VuHn7kUn9WQnSy3UAACAASURBVAxLkiRJs+i6GK7FvTHwg0bsc4Gt+5y70Ivh1zTaXUcH29RQfXBwXCP2L6hux5ZGZjEsSZoU/3iRpJ5SyrlJHpTku7WXb5TkH6eT0XCAHVI9IzxjdZKDSymfHjV2KeWiJI9M8o3ay3dOYtEiSZIWFYthSaoppVyT5MlJLq+9/MxFduXzhUk2r339xlLKt7oKXkpZkeRxSc6tvfxWYKtZmkiSJC04i+mPO0maiN4V4nfVXrppkn2nlE4rwBZJnl976Q9J3tp1P6WUK5K8tPbSdkme3nU/kiRJ42IxLEn9fbbx9V2mkkV7Byep75P8jlLKmjH19ekkp9e+fsqY+pEkSeqcxbAk9VFKOTXr3gbcegXmKTm4dnxxkqPH1VEphSQfq720H7DruPqTJEnqksWwJM3unNrxTlPLop271o6/XEq5fsz9fabx9R3H3J8kSVInLIYlaXYX1463mVoWAwK2TbJb7aXvT6DbP2bdxcYWxbPVkiRJy6adgCQtYPX9hS+dWhaD263x9W/H3WEpBeDXSe7de+l2w8YCNkry0CQHJjkg1bZW2yVZmuqDiQuS/CTJCUmOLaVcO0LqAV6V5L5JTkzyqt5t3/Xv753k8b189kqyQ5LrklyS5MwkP0jylVLKj0fJY5bcliZ5cJL7Jblnkl1SzcWyXv8XJvlp1s7FVV3nUMtlxySHJLlXkn/o5bFdqrm4ONVcfD/Jt0opPxhXHm30thf7UpLtk/xLKeWTY+jjtUmemuSMJIf0VqIfJs69kjww1e/Qbqly3jTV3F6c5KQk30vyxVLKhaNnfoP+d0pyWKrfuX1S/Zxvm+TaJJclOTvV7923k3x9jGsQSJIkaT7AUtb1gjH0UYALan28qfH9Bzdy2LnrHHr9bNro53FznPugxrk3G0dOffp9ea3P1w7RfhnwIuAsBnc+8Apg+ZA5b9uIt0/te7sAXwTWDJjLj4A7D5NHn7yWAM8DzmgxFxcB/wxs0kUOtVx2BN4PXN0il18ADx6x39Nq8Ybavxp4ai3GFcDm87dqFX/PxrgPGiLGocCvWszt1cBRwPYdjWGzXrxrWuTwJ+b4N0iSJEljxmSK4ds2+nhU4/sLsRg+pHFupwXAPHnuAdxqiHY3A37Y4o/xpp8ANx2i3xs14ty19/pjgUuGyONa4Klt82jktAvwnRHm4kRgj1FyqOVyIHDOkHmsAd5FdaV/mL67KIZvxbofZjxxmDhzxH9zLfb1VFeiB227BfDxIecW4Ex6P68j5L8L8OsRcvgQi2vvdUnqy9ukJam/emGzJpN5/nZUG9eOV5RSrp5Ux6WU0+c/a13AjVPdaty8vfu0JF9P8sskFyVZnerW0dsnOShJ/SrsXZP8CLhrb3/ooQHPSPJfSUrt5TNTbbN1cpLzk2yUZOdUt5QekrXPkm+S5CPAeaWUbw7R9w6pbnnes/Gt85N8K8kvUt0avSrVLcq3S3L/JLepnXvHrJ2LM9vmUMvlvqnmv37VfU2qW3VPSHJqqufEl6daWO5uSR6W6lbupJq/Fye5MfCE5u3nk1BK+SPws6xdUO7JSY7pIjZQkjyh9tLXSikXDdh2eZIvp7r1vu6KVLch/0+q9/z6JFul+nk4MOtu7XazJMcD9yul/GSI/Dfr5bBP/eUkP0z1Hp+e5OpUP+s79c57UNa+v0lyRKqfgZe37V+SJEkjYMxXhoHtWffq4PF9zlmIV4YfXztvqOcXJ4Xq1uhfNsZ2BvCwXrExV9u7Ayc12p5Ii1umueGV4WcBK2pfXwQ8Y65cgK2BDzTiXARs2XIulnDDq+MXAk+fb0zA/YHfNtr+jqrgaY3qCv9ljXhfAfaap91y4Jl92r5xiBxGvjLci/PcWpzVwE2GjdWIe0BjjI9s0fb/NNpeC7wS2GqedvsB3220vYDh7op4ayPOicDt52mzEdXvw+WNtvu37V+SJEkjYPzFcLPAeUifcyyGRwAc0RjX8fMVBI32y4FPN2Ic2aJ9sxj+VO34dODmLWK9oxHrZYO27bV/QqP9b6iumg/afhPgM40Yr2iTQy1Wc05f3bL97qz7vPN1wO4tY3RVDG/b63/GPw0bqxH3Q7WYFwEbz98qAe7IurdunwsMvOAc1Ycmb2u8Px9rmft2wFW19j+jxQcnwJ0a7b/Wpn9JkiSNiDEWw8DhjT9Yf0qfq4NYDA+NanGy+mJZp9HyamovzvLeH/P14mKgx3+4YTH8dOBU4Fhgl/kjrBNrI+D3tVj/27L9qbW2F9CiEK7FWE61kNeMS4BNW8bYi+oK6oz3t82jF+eWrFswfbhl+06K4V6sz9Vi/XqUWL14y6kK4BlHtWj7hVq7FcBQe3IDx9TirAJu2aJt/d+IlcBt5m91gxivaoyj9e+uJC0UPjMsSamKoyTvSPKkrH1m9Lokzxj0mUeqKywvTdLF7ZiXJ3l3qq1N1jf7Jqnf3vnKUsqVbYOUUlYAL0313HFSbcV01yQ/GiKnU0oprQuDXh4rgQ8keW/vpdsCOwzyHCnVomO3rr301mGefe7NxYuT/Lz30raptur5RoswD0sysyjSpUlarwzey+VPwLtr7Q8Gnj2NZ4eTfDLJzOJ3+wB3KKX8ZoR4D0/1/Ho9/ryorh4/sPbSR0opJw2Zw8uSPDLJZqm2HXt4qn8rBnG32vEPSymnDtH/B5O8udf3Rqm2/vr6EHEkSZLUFiNeGaa6kncTqufwnta7YtNv+5hnzRHjBleGgTf1iTGKL7J+Xhl+aS3Pi6n21B0l3p9r8d4wYJu+q0mPkMOtG/GaCyTN1u45tTargG1HzKP+/PA7W7Y9rtb2/46Yxx6N+dhn/lZ/b9vlleFlwHm1eP82Yrwv1WKd0qLdvRvzMdKztlT/NswY+FZl1r2d/h0j9F/fEup5w8aRpGlzWXxJ6zXgfsAfqN3+mWRFkr8mOSnJ/021KnD9ubnVSV5USvmvlt1tM/8pU423UOxeO/5RKWX1iPF+UDvuZGuhIZyWpP4BxKB7we5eOz65lHLpiHnUVz1vOxf1XL43ShK91cX/WnvpFqPEGyGPVUk+U3vpCQz54QuwXapVlWd8okXz+jPoV6VaKX0U36sdt5nb+h2Bo6w2f07tuJN9jyVpGrxNWtL67r1J2ux/+9skR5ZSfjDvmTf0oST7Jxl4z9E5XJPk7R3EaQ14YZKHpt0Hpn9L8tVSymcHOHfH2vE5s57Vru9+sSemlAJwadZ+qDLoFd6FNBfjyGXXIXPp0ieSzNw9skuS+6Xarqqtw7J2+7I1abdVU33853XwAVD9/dmpRbuLa8etno1vOC3VvxHJ+vkoh6QNhMWwpPXdIIsInZnkO0mOTbVn6JphOiql/C5VMdwZWi6C1EF/N83aZ1/begrVvrKfnue8+qrRVwzZV93lteOtO4g3rKtqx4Nefex6LupXY+fcoqqP+kJI6837Ukr5JfDbVHszJ9Wew8MUw0+qHX+3lHJ2i7Zdz229AB14FfYk9cXdDgKWDlmYvy7V3tsrknxuiPaStCBYDEta3304ydtqX1+U5IVJLukdn1dK6eIq2PpipOd3kzw6yXzFcN00FlUal1HH0sVcfDbVQmJb9o7baFs8z6c+nq5jt3VMkn/tHR8CbNlm0TZgj1SLs81oc4v0DcKN0LZfjDZz+53a8W5Jnp8hPvwqpVyT0eZAkhYEi2FJ67t3JTk4yd17X++QZN9SylD7sK7vSil/odpbdr8Wze6Utc8t3qj7rDSoXpEyldvrF7hPJnlLqg97Nk+1TkCbYu7JWVt0Xp3kS51mNyGllFOA7yS5f++ldwLXllJabX8lSesLi2FJ67XetjeHpVosa+ZZ3pcBPymlLMo/aMetlPKv85+1FvCfSZ4907z7jKTRlFLOAY5P8oDeS09Ou2L48bXjz5ZSrpr1zIXvRam24Nos1d+BHwKekuTfkhxXSlk5zeQkaZJcTVrSeq/3bN9TUy16k1QF20eBm8/eStJ6pr4n8H17z8fPC7h7kj1rL3VyezDwLqrttFrLurc7X9+m397aBk9ItY/6jHukutp9HvAJ4HBgz74BJGk9YjEsaYNQSjku694+um2S/wY2nqWJpPXLF5LMPCe8JOte7Z3Lk2vHZ2Xd7atGcXhGf0Y/SX7ftkEp5dgkByZp7pW8XarxfjTJaVR7NH8eOALoYpV8SVpQLIYlbUhem3WvqPxDkndMKZdxWFU73hiY1KMw/rdEC14p5epUBfGMp87XBlie5DG1lz457GrzfbQuYvu4Msmrh2lYSvlpkn1TPeLw61lO2znJoam2jTsX+BzwD8P0J0kLkc8MS9pglFLWAE9K9fzwzB6bLwR+Vkr51BRT60r9tsclqa5+XziBfrerHV87gf6kYX0ia4vgvYH9Sim/muP8hyTZvvb10R3m8qAkd87wz9lfn+S3pZRLh02g93zwh5N8GNgnyUFJHphqwcHmtm7LkjwqyaOAjyd5SSnlkmH7lqSFwGJY0gallHI+8IRUV4hn/g38EHBSKaWLKzXT1PyjePtMphiu3z559QT6k4Z1QpK/JNm99/WTk8xVDNdvkf5pl/9GlFIuT/LdruKNqpRycqq9g98BbJJqK6kDk9w31f7pG9VOf2qSuwIPaLnfsiQtKN7aJmmDU0r5fpLX117aIslngOaVkMWm+UfppBYI26l27J7NWrBKKSSp3wXyxNkeJwC2TfLQ2ksbzL66pZTrSinfK6W8vpRyQJKbpNqf/YzaaXslOXaCj2NIUucshiVtqP41ybG1r2+f5D1TyqUrf01S3/LlvuPuENgu6660e8Zs50oLxMeT0DveKWu3W2p6bJKZBfZWJPnMmPNasEopF5ZS3peqAK7/O7lfqoXAJGlRshiWtEHqXSE6PMmfay8f0dtvc1EqpaxO9Tz0jLEXw70+6ivi/nICfWoWwB7A2cAK4CXTzmchKqX8IdU+uzOePMup9de/Ukq5eHxZtQNsCfwKWN3b53uQNo8EjgZeBwz1nHIpZVWSlyT5eu3lxw0TS5IWAothSRus3sIzh6W66jPjA8Btp5RSF75dO94X2HvM/T2sdnxt1i0yZlNf6KuLW9M3mSX2YtD1XDw8ya6pnu88rGXb+uJni/2RgfnU9xw+BNi6/k1gt1SLSM0Y9Rbprt/nu6VaCXpJkicN2OZDSZ6Y5E1J7jBsx70PEt/fyEWSFiWLYUkbtFLKz5O8vPbS5km+AGw5pZRG9fmsvQV0SZLXjKsj4CZZt+D6Zm/7mvlcVDvesYNU6jEmsWBYl7qei5vUjv/Wsm19ZeDtZj1r/OqF42Zj6uPTqVZjTqoPUw5tfP8pWbvK84VZ90roMLp+n3euHQ/6M0/t+MYj9n9q7XgzYKsR40nSVFgMS9rglVLem+RztZf2TLXdyKJTSjk1yVdrLz0O2HdM3b08a5+pTJIPDNju3NrxHTvIY79ZYi8G9Xz36WAxovp7fWbLthfUjm8/Yh6juLJ2vMOsZ42gtyXQcbWXmrdKP7F2/KneFkSjOK92vCNwsxHj1a/sDvozXy+ad5n1rME0f0672ntZkibKYliSKocnqW+bchjwrGklM6I3Zu1VoKVJPtu8DXRUwP2SHFl76SellG/Pdn7DD2vHtwb2GiGPnZPcpfbSj4aNNSX1udg6yX2GDdRbzOxetZe+3zLEz2rH9xs2j5rVteOls551Q/XCcZ8O8phN/dbn+wC7Jwmwf6qFovqdN6wfZ935eMSwgYAlqW6Hr8cexOm14/sM239P/cOSq0opV816piQtYBbDkpSk98fcY5NcU3v5KKCLK5cTVUo5MeuulH3LJJ8DtukiPrBfkv+XdQuc189yej8/zLr7Eb9xhHReU8tjVRbQvq0D+nnWvT35DcMubpTktUmW946vS/Ktlu1/UDu+1zB3FAB3B44C9sm6zyBv0SLMibXjA8f4yMLXsvb25ZLkCb3j+lXiU0opJ2VEvcW3flF76RXAsLeAPzHrFuvHzXZiQ/3n4ZDeB0nDelrt+CcjxJEkSVIbwFLW9YIOYz+jEfuP/a6qAg9unDfKH5Zz5bNpo5+BVm4FbgT8rdH2FODOI+RSgKcD1zTifnyIWP/WiPGPQ8R4OLCqFuMjLdreqNH/Xdv23yfmqbV4z2nR7vWNXP5liL4PBlbWYhw1RIyNGz8zJwGbzN/y7+0fCFzba3s88OFarEFvoZ8pqOte1XYsLfp6X62f04DlwIW1114+f5SB+3psY1zHAm2umAe4A3BJLcZvBo0B7ApcV2v7OaqrzG3H8ZjGOJ7dNoYkSZKGxBiL4V78/9uIf4P9RVngxXCv7b7AeY32a6i2Vxn49lNgCfAg4Ofc0PeB1qvjAtsBF9firAbeCmw0QNsCvIC1hRdUBfrAz2GysIrhLYFzG/l8hAGuiPbm4kWsW+RcBgy1SBPwsj7v75w/270cnsW6H5J8HnhF7esT54rRJ+Zva22vAx4yzHgG6OcujfG+qXa8Gti1w74K8LNGf98ABnp+F3gc6/7O0HZegHc22n+G6vb6Qdsfxrq/d38ANp6/pSRJkjrB+IvhTaj28Jy1DxZBMdxrv2ufP8Bn/Ax4DXAgsDewE7AZcFPgTsCjgfcAZ87S/uO0uHLYJ7d7s24RB3AG8BLg1n3OvynwTODXjTargUe37HvBFMO9tvsDVzdyugj4V+AewPLauQW4DXAk8LtGmxXAQSOMYRnwvUbMK4F/p/o52bZ33kbAblRF8E8b518M7A4c0Hj9WQx4CzjwiEbbVVQfENyL4W8vnq2vUxr9zPhml/30+roZcE5jbFcDHwDu1xwbcAvg8D5zDPD2IfrfGji5EefC3vt7D+AGt7MD21PtUfz1RrvrgHuPMh+SJElqiTEXw70+9gKuqPVxPbVbjFkkxXAvxsbAG7lhsTWsC+hocTGqoufyWfq5Evgz1a3ql85yzvUMcZsmC6wY7rU/iHVvgW26rDf3K2f5/tVA272F++VxI+DEOfJYSXWHQT+XA3frxdkIOKvx/VOANzPYVe//mCOHq6k+LHhLB+N91Sx9PGH+1kP1d3uqD31mcwXV+7xijnM+yJDPlgM7A/87S9zVvb7/RPV7d+Es510HNLejkiRJ0rhxw2L4+WPq53GNfv5n5g9QqtuG63YaUw7NYvixI8TaFfgEsxdT8zmX6jbSTvcUBfaguh23rVOpVv4dps+dG7GGitOIWS+Gh3qOkurK4beHmIuTgNuNOoZaHptRPfPb5mflJOA2jTiH0b9wftoAORTgtcxdFF7RwVh37dPH+XR8BbrR59ZUv4urW8zvTF6tPxDr0/8mwDsY7t+CU6kW0ZMkSdI0sPY25tXAPcfYz7/X/ghcQ+/5PqqiZeYZyb/QciGcljnM3Aq7gkaxMWS8Xaie5/wOcNUcf/SupHp28yjgIYy+B+58ed0DOIYbLvxVdznwVeAQhlj8p9bXMtbe/n0hLZ6bnCPmF2o/J/cZMdb+VMVS85baukuAL1LdpTDsCtTz5XFz4O1Uz4v3K5yuA75FVfT2/R2guvrfvDX3AS1y2B14L9UCV02f7Wic/8zaov0q4MFdxB2g31tRLeL1hzne52uBHwDPZojn8+fpf1eqD7hOZfar/VD9W3c81SJgY/13QJImaSz/8ZSkcaN6tu2OSc4upfx5zH3dNsmNk5xbSvld7fUbJdkzycmllMvH2P/MWM8opfx1DPF3TbJLkpkrvtcluTjJ6aWUFV33N2BOt0w159un2jrpkiQXJPl9KWX1XG1b9LF1kjskObWUctF85w8Qb+Mkd0pyUSnlD6PGq8XdI9X7876s3Xf3oCTfKaWs6aqfAfLYNMmOSWY+ODivlHLeHE2a7XdO9Z5eXUr545A5bJdkpySbJ7m0lHLGMHFmiX2rJLsm+U1vK6SJAm6c5OapfuY3SXJ5qp/5U0sp10+g/21T/T7smGTbJCuTXJrkb0l+XUpZOe4cJEmSJGkdwFasXcX35GnnI0nS+mDoW8wkSdLEPDLV1cIkOWaaiUiSJEmSNBHAV3pXhdcAu087H0mSJEmSxopq5eGZ/ZhXUW179CHgHtPOTZIkSZKksQCePMcqvx8FNpp2jpIkSZIkdQr48hzFMMBR085RkiRJkqROAXeg2mt3W2Bv4IlU+8LOWAXcYtp5SpIkSZI0Vr3niH9fK4iPnHZOkiQtNm6tJEnSIlNKuTzJ+2sv7T6lVCRJWrQshiVJWpzOrB1vMutZkiSpL4thSZIWpzXTTkCSpMXMYliSpMVpi2knIEnSYmYxLEnSAgTsPs8p+9WOLxtjKpIkSZK0sAEHAL8ELgeuB/4KfBBYNu3cNDhgU+B04EPAtn2+f3vg0tpq0odOIKcnAxcAXx93X73+Hg5cBJwP7Dd/i74xbg6c0fvf7h2nOGgOj+1thXUVcE0vl9dNIxdJ0rrKtBOQtH4DdkhysyTbJtk4yaVJLkxyRinFZx47Bnw7yf17X65MslHv+DGllM9NJyu1Bbw5yWt7X16e5CtJfpbkyiR3TfL0JMt73z8/yTOSXN9B16uS/LSUcl2fnD6a5PDel0tKKXTQX1/APkn+J8lmvZceWko5bog4hyT5Qu/Lg0spX+koxTY5nJnq30BSze/M7+Q+pZTfTDofSZIkjRFwG+D9wGnM7lLgOOCpgCvhdqR3BQrgTsBS4F29r1857dw0OOBf5vjdGbfPzpLTR2vnjO3DdGBb4E+1vj43bH/Ao2txHtp1rgP0vwRYSXWXxg7AcuDYXj6PmnQ+kqR1+cywpM4A2wCfSvK7JM9Lsuccp2+T5MFJPpbkbOA54/wDewMyczv0uaWU1Un+1nhdi0Ap5dVJHpTq6uik3WwKfSapisckRyfZo/fSyUmeOsJV6PrfOWO7kj2HkmRpqqv2F5dSVqS6kp/4OylJU+c/xJI6AeyZ5NtZ9w/p1UlOTfKrJBclWZHqtsddk+yfZJfeeTsk+WCSxwGPKqVcMqm810MXJrllkk8BZyR5YO/182dvooWolPLNJN8EbpzkwCQ3TrJjqvf490m+2jv19CRd3QJ/fZK+V4Yn5PVJHtI7vjjJoaWUq0eIV/+AbeKPZZRSVgOXJNk+yZeAK5I8rPft8yadjyRJkjoG3AQ4s3Y74jXAm4Fd52l3V+BoYE2t7UnA9pPKfX0DvLrPba9XAbeadm7qDrBr7f2dyHOw475NGngYsLoXfyVwYAcxH1/L+aAu8hwih4/1+Z38G7DVNPKRJElSh4Cv1P7IOx24dcv2d6da9XjGF+ZvpdkAdwAO6RUCDwK2nnZO6tb6VgwDt2Td1bFf0FHcJ9RiPuD/t3ffcXOVdd7Hv78AISShSQ0dRAGxIQgI+IAUFVDEFyKCjbWXXfSxPZZV0bXtApZlZcW1oIgKugIKKIiACCq9i3RCCy2UAAmp3+eP6xrv6x7umTnnzNwlyef9euU1M/e52pwpmd+52iDKbNCGsL2T0/zlQ23vZdZJAAAAWPrZ3qP4sfmI7UbzDW1vZntWUdZreucClk/LUjDstI3UlUXZPx5g2W8pyt27dw4AwPKEBbQA9OvNxf0jI+KuJoVExJ2SPlz86Z/7aRSApcZxklr7CF8q6T0DLHtc5wwDACY2gmEA/dox31rSSX2WdYqkmfn+nmbuMLA8aA1fvlVpwaxn7HHch/FeTRoAMIERDAPo14x8+1BEzO6noLx9yun54UoaCrQBLLv2k/R2STtFxL0DLrv8nUPPMABgGLZWAtCvBfl2UL0ufyvubzGgMgFMUBFxraRrR6v44j7BMABgGHqGAfSrtX/t2rZXHUB5txb312taSF7BdW3bG9heeQDt6lXfarmugW8504TtFW2vOaCyVs7Pbe2xeH7FazdjjF67VW1vMqjzheZsT8uLgw1q26ExGSZte2r+jKzUJc3KHtDK7rm+jWyvMYjyKtS3ou318r9R70ixvUb+TLISPgAAmLhsH1+s1nrwAMpbyfbXbf/I9oY18z7P9jdtX+Oh/UpbZtn+me0Dbfd9ITD/8D3S9p9sP13U88m2dN+1vcj2N/utM5f3hVzez7uk2cJpb2HbvqhBHZNsH2T75x6+wrfzeb3G9jdccwutHnW+wPa3bF/n4ftO22lP1p/aPmAQwXgOfj9k+7ziPLUstH257f+wPWFHJngZWU26eC3Otv1E22sxz/YFtj9p+1kVy3u/7QX5PXSC7XcV5b3Cw1etbrnB9rSa7Z6W6zrDw7eEOqND+j1tz89pflCnrpx/ZdvvtP1rp1X729+zf3Ha273Wd2aPOl9u+3u2bxnhnN1q+/u2dxtQXevZ/pztiz38+7T1PrjI9mdtN75ACgAAMHC29yt+tFxne5VxaMPqtk/yM4OoTq6z/aKGda1k+6vFD9t232pLf1H++yLbMzqVW+N5zs3lXd8l3e5Fex6rWceOtv9e8TwudgqQagUSbfWtaftkV3/trrb9/D7q29/2QzWe37+7S2/fePEyEAzbfoefGdh18oTtD/eq1/YpRZ57bb+nePyGLuU/t0a732p7dodyruiQ591FmktrnqfXOl0QqmK+7S+5j95bpx7Z8yvWZ9vnuo8gPJ+buT3qaJnndPFkQozAAbD0Y84wgH6dLekGSdtKer6kk20fFhFPjkXl+UfYBZK2LP48V9JfJd2pNKd5HUk7SdooH3++pL/aPigizqpR1xRJv5W0R/HnxyT9WdItkh6V9N22bCdL2lXSCpIOk3RM1fpG8AZJrYsNP+ujnBHZfpOkH0maXPz5PqVz+aDSomabSNpZ0qpKQ1D/SdJLbe9RdwE1pz2pL5C0efHnByVdKOkuSQslrav02j0vH3+RpEtsvz4izqlZ32slnaahobNLJF0t6TpJ85Se9xaSXippWk73CUmb2z4kL/CGAbD9X5I+WP5Jab2AqyU9IWmqpG0kvUTpszNd0jckvcT227u8FkdKuk1prvAfJW1aHLtHadumZ7fluTsibq7YFKPoPwAAIABJREFU7qMkfaz403yl7aCul/SIpFOrlFOV7U9J+rKGz32+VdIVSt83U5Teszvm+5MlfUbSjrZfGxHza9a3g9J3etkTf5ekiyS1FjebIWk3SZvlx3tJusr2nhHR8SJdh/o+JKkcNbNA0mWSblY6t1MkbSVpe6XnNiWnX0/Sp+vUBQAAMCps7+zhQ9uusf2SMah3FdvXFvU+nnsNRuypdBqqeFmR/gnbL6hR3wlF3tm5R2NKjzxreagX+bq6z7GtrPNzOUtsb94l3e5FOyv1DDsNiSx7u6+wvXeHtCs7DT8te1j/ZHuFGs9lutPw1JZ7bB/qDj1atnewfWHba71Njfqe5eHDWc+0vWWHtNNtf8ypF6rlvVXrGgteinuGbX/aw/3M9lYd0m5o+z89fNrDv9Wo6wNFvr5Wp/fw3t2Ftr9ie50GeSv1DDv1QJcjJs62vX2HtKs7DScve1hPqPH0ZHtj2w8U+a+3/apOr7XtfTz8Mzyz6vnI+Z+Xz2PL92yv3yHt2k5TF8r3wV51nh8AAMCosf16Dw+mFtk+1n0ODe5R5yeK+u5yh+CmLc9k2z8p8p1bsa7tih+m97lLMDpC3tOK+l5YNV9bGZsUPwTP65F296K+nsGw0xzhq4o8J9meXCHfBrZvLvL9U43n869FvstdYU9p2yvkH8wtdXr1P1vkO80V5o3b3rc453e7RrA/2ryUBsNOAVfrIsMS2++vmO8AD32/LHCFz3rO98GizTs0aXMuZ5rt+4v6962Zv1Yw7DSX+sEiz5eqnHPbL7T9cJGv8pxep3UaWn7tHhf6cp6pts8p8n2rV54i74+LfJVGzNj+5yLPH6vWBQAAMOps7+LUw1ea67Qw0kAXI3IK4Fo/The5xhxgp3m/VxRt3K5CnnKhsNfVbOtBRd6j6uQtyvhUUcbhPdLuXqStEgzvU6S/3DXmG9re2ik4sO2/9c7xj6C29YN9jmtcMMl5y979SvOHbV9SvFc26p3jH/l+UdT10qr5RpuX3mD4a0UZtaYMOM0Zbjm2Yp5/KfKM2KtasZy3FuXU/gy7fjBcBvGn1Kxr3yLvaRXzrJ8/G7Z9mysEwkXeVZ3mZ9tphFDPlcCdvr9b3wEPuuJaE04rzbcu3C12xYXVAAAAxoTTcL3/8vDhb60fLmfZfo0Hs5rzS4qyO66s3CX/AUX+nnPPPLSi6h2uGQg49Ua3fvjd5wY9jE6Lftn2U+6xhZXrB8PHFOlf26BtJxb5N62Qfuci/dEN6itfu4/1ziF5aIh03cWL3ljU9cHeOcaGOwTDTquNn1Lz3zFV3pMeTDDcCmTmu+ZWVk4XsVqrm99SMc8RRZt7XvTqUs4Pi3I2bpC/bjD8myL9iEPIe+RvXfx5wtVGeZTBfu0pAbY/WuTvebHQadhzy0k16/pMkfeVddsKAAAw6mxv6TTHdqRVl29x6rFpvC+x7X8qyntrg/yrFG37RY+0k4u6ftSwvccVZbyqZt7ti7wnVki/e5G+SjB8bk77tBusBm77sKK+Ayukf2+RfsR5yT3yT/VQb3SlH9Ieujgz4tY3XfK9qGjrF+q2dbR4hGDYqXevqZ4jK9xnMOzUG9jqfTy/4fMuh/L2/P7w8N7kFzepM5fTCi5va5i/bjA8M6etFPSPkP/Ior7nVUh/dJG+5wWtEfJvW+Q/skL6zYr036hZV7kq+FvqthUASqwmDYwDp2Ghr9LwVXurekrSqRExd7CtGqyIuFXS4U6rob43/2stjrKlpP+U9G+2vy7p6w1Wny4Xarm9Qfvm2Z6ltNpsr0Vfyvms93ZM1d2JklrzI9+qtGJrVWWw3zMYbmDtfHt/RMxrkH9mcb/KAjplmjvrVhYRc20/JGmDivVJaaXfdWukb7lbaXXyqZLm1Mw71h5TWv17gwb5Zg2+Oc/wLKWVoaUGn9kR8q2jtPJ0N2XQvqRhndLQZ6Tp57+u1vv0job5634mW89vsdJ7vq6ynVXqe7Rm+tItSq/lJE2Qz6TTfPTtNPz9VtXtEVFp7QoAg0cwDIyPoyS9uY/8H5X09QG1ZVRFxCxJR9r+iqSDJf2L0lY5krS6pC9I+mDuTfhOje1ryhWje/0g7qT1Q6pXD1NZV6OLEBHxF9t/l7S1pNfbXjUierbbaf7uIfnhfZL+0KT+Hqbn26bn8Q5Ji5T+T6lyUaM8n0234JqjFPRVHV1wjaR9lLbm2SAi7quSKSIecZqXPENpi6kJKyKedtququeczTZPRsTC0WhTm+nF/abvtceL+1WeZzklo5+tsabm26f6KKMSpyHrrREaTc9Ta6soq1qbW6/N3IiofdEgX6BarHSxo+dnMiIet32n0vZMe9ueEhFPV6zrGqddAKZExJV12zpoeZTEBRr+vVa3jGdHRNMLRAD60Pe8PQCNLB7n/GMuIhZExEkRsbOkHZT24231Qq4r6ThJv3eD+Xh9GOt9Y1tDeqdKOqhinldqqEf9xIgYzde+0fnIgeVmkraOiIHvfzwgrYWEVpT0bdeYtx4Rd0TEn5sECWMtIhZHxKM1/41FINxurD57g+oZHi9NP5MXK43A2SIiLh9skwamtSfzekp7KVcWEX+bCIFwoZ/vZfeZH0Af6BkGxseHJf1KzYdJL9VDqiLiCknvddov9CuS3qL0o3UvSZfZ3jsirh/PNo6SE5V6wicpDX0+oUKecoh0rYVmxlJEjNXw0aZOkPRxpaD9QEnn2f5ofi9i2VVe9Fgag+HGIqLR/OYx9A1J71Tq4f+I0yrv/xoRjeZJj5eIsNMe1o22zZN0Z0TM7J0MwGggGAbGQUQ8Kun08W7HeIuIeyS9zfb3lAK9jZR6CS6wvUNE3Fm1LNv7SfqQ6o14aW33tKhGnsYiYqbtCyXtIWkP2xtHRMf5eU5blByQH14REdeNQTOXSXkY58GSfi9pDUm7S7rc9jWSzsl/v6jhnGk04LQtzn8rzSWuapPifpUe7UENk8aARcTdtt8m6RSlC8NvlPQG25do6DN5SUSMyfdzPyLiJkk3jXc7ANRHMAxg3EXEhXml1zMk7ay0YNV/S9q3RjEflbRnwyZU2h93QE5UCoYnKc0b/1qXtAdpaK7iaCyctVyJiMtt7yLpe5J2yX9+Uf73cUnzbV8u6Y+SfkWv8ajbTykAamKuhi8S1cnSPkx6mRYRp9veS9L/KK2nMEnSy/K/z0t6MgfH50n6ZUTc3LEwAGiAOcMAJoSImC1pf0kP5D+92vY2NYo4S9JspVVKq/57SKkH4vMDeApV/VJDi3C9rUfa1rYhiyTV3ksZzxQRN0raTdJrJf1G0vzi8MqSdpX0aaVe4yttv2HsW7ncuFRp8bU6n9lHJd0o6Z0VV6CnZ3iCi4iLlIYYv0XpQlQ5f3a60vSZL0u6yfZ5tvcY80YCWGbRMwygEdtbKgWvl0TEQFbZzSv3HiXp6Pyn/ZV++FbJe4ykYwbRjtEUEXNsnybpMEnb5OHgz1jgxvaGSkN5JemsiHigPQ2aySuWnyHpDNvTlM7zXkojC16ooQBqO0m/sH2mpEOrrP6N6nIv3xY9E/ZZTXGfnuEJKi/idpKkk2yvqaHP456StiqSvkJpisn/SPrg0jCEGsDERs8wgKa+mf+dVmdl3gp+Xdx/yQDLnUjKIc9v7ZDmLRrak5Uh0qMkIp6KiLMi4qMRsZ3SyuZvlnRhkWx/SWcO+H2OsUHP8FImr3D+y4j4QERsLWlDpT3ar20lkfQepaHVANAX/mMH0K/1lH6sDMrtGurBWW+A5Y7I9vTeqQbuHEmt1ZcPtb3SCGla+1A/qjScd0KzvaLtKePdjn5FxOyI+GlE7K50MeaGfOjl6j2sHWPA9ip5L94qltueYdsrd/huWapExH0R8Z2IeJHSXuGtPcIPt73rODYNwDKAYBhAU/cU958zwHKXaGh152kDLPcZbB8n6QnbXx/Netrl/Wpb+/GuI+lVbe3aTtIL8sOTI6Kc1zrh2F5F0t2SHpuIP05tf8z2yXnxrMoi4iqlXuEF+U+HDrxxy6/oneSZbO8saY6kO/Jq63XqWRp7hpuepy0kPSLpAdubDrZJ/bE9yfZRtk+yXev/jog4V8M/h3wmAfSFYBhAU+VKuwd0TFXfDA3tv9xtnuxTxf1VG9a1T77doWH+fpxQ3G8fKl0+/vHoN+Uf57LpeXyRpPWVFqDatkZ9UvMLHq22VpnH+2WlVYvfVbeSvP/nn/LDpvuILivKYLLJ74fydW86IuMVSuudbKxqI0f6bfOYi4jFkp7OD5uep92UVqJfU9LmFdK3XpupTaYD2J6qoWkdvT6TG0v6mNK6CbUXqIuICyXdlR++qG5+ACgtFf8xAJiQztTQsMPDbTcNpNq9prjfbRuNh4v7m3RM1UEeZjkjP5xVN3+/IuIGSVfnhwfYXqNoV6u341ZJA1mcrIfWuVzf9soN8m9W3L+nU6IR6pPSD+Na8nDsdUYoq5M5+Xadrqk6eyjfrtkw/7JibnG/yef9EQ19ZzTtrdyouF/lczu7uL92wzrHQ+s91/Q8bVbcr/OZLL8X6yg/x70+k3OK++s2qEsaOj9rNMwPAJIIhgE0FBH3STo9P1xd0nH9lpmH2368+NMvuyS/rrj/qo6pOttZQ72S13VLOIpaC2NNkXRwvr+PUi+rJP04r3w82loL00zR0ArWdbwy31rSNRXSl+d7n46pOttdQ6MHru2WMGvNMXyJ7SbDTlsBySMN8i5LHi3u154akXs8W3Owd204X3+vfHtHxa2V7iruj8cIkKZan5GtbG/WIH/rM/mYpDsrpC8/R00+k2WeXt+nj2nowkrtRRLzZ7gVfC/vn0kAADBebG9j+2kP+VzDYKM1j+zEoqy/dCsrp38wp52f58jVqe83RV1df5DZ3rJI+6916ulR7rq2F+ZyL8x/Oyk/XlL3ORXl7l6097EK6V9dpL+gzmtoe1Pb83LeqyrmWdH2IznPw61e8Rp1nle0d7sK6b9ZpH9lr/RtebewvSjnPatO3tFke6PiOY3JAmu2Dyrq/GzDMo4qyvhczbyvL/IeWzHPGsXr13iUhe1ZuYzfNsz/7qLtl1ZIf0SRvtaqybZfXuQ9uWKeDWwvznmud/UFyloLdd2W8y502hqpV54zivTPrVpXzrt38fy+VScvAADAQNl+v4f7XYMfN2vZ/mVRxnzbPedn2v5Mkeda25WGQdr+VJHvjxXSj0ownMs+M5e7xPYLbD+RH5/fR5m7F+2tEgyvYPu6Is9RrhAQ217V9qVFvsNrtPELRb6zXXF4dlu+8yrm2SmfX9u+xXaloZm2J9v+Q5PnN9o8PsHwOk6fTdt+oOrnra2MzTx0AW2B7ddWzLet7YdyvoW2t65R56+Lc/Xuum3OZYx1MLy604Ui5/fueyrWs5HtO4u6Ki8aZ/unRb7vutp3wCTbPynyHV+xrjcXef7kNCqoSr41bd9Y5J1wC/YBAIDljFNQuqT4gbLY9mm2D7G9epd8G+a89xd5F9k+uFOetvzTbP+9yHtPrnPEXg3bW3l40D3P9vYV6hnNYPiQouwyIH1HH2XuXpTTMxjOefb0UC+1bZ9l+wUd0k6yvb9TYNny107nvUMZq7Xlv9b2K7qk38xpReiWubZfXKO+nxd5b7d9gLssFJTfKxe0tW/FqvWNNo9DMJzrLQOfK2xv1aCM8oLGYtvH2B5xMSzb023/Xw9dJLLtY2rWt33x3l5k+7NOCz7VKWNMg+Gc510e7gfusDK004Wbt3lotIxtn1SzjZvbnl3kP89dPmO2X9j2GbnfdqX5xk7fIZcVea+0vVuPPDs79Vq3nFbn+QHASBoNZwSAdk49PMdp+AI3UppHeofSYlCPK22btKakrfTMVU4flfTuiPjfGvVurrTab7nX8QP5b3dJWihpLaW5adtp6HtvkaTDIuIXFerYUtIt+eFnI+JLVdtXoewpSgsBlUOF50maERGPNyxzd0kX5IePR0SlYci23ynpeA2tCmul+X+XKS2Ks6LS67urhr/Ot0vaNSLur9nOLZVep/WLP98k6Y9KWzUtVFpgZ4dcZ6tdCyUdEhGn1qhrNUnnSnpp8ed7Jf1Z6bWdo7SOxoxc384aeq88pPT8btEEYXtDDS2MNEvSRQMs/oSIGHFIeA5ar9XQwkeLJV0i6e9K75HLe32mnHocf6Thq6bPz+Vcq7Sy8RRJz1VaFblcrOt0SQfl+ceV2T5CUjmk9jFJF0uaqbT68T2Svt1pjr7tWUrv099FxL516s753y3pu/nhZRGxY8V8X5X0yeJPi5U+j1crfZ9OVvoe3U3DFwj7i6S9ImJezXa+XNJZGr6K9ZVKn5NZSt8JMyS9TMPnYM+RtHdEXFajro2VPv9lgH+L0vvgDqX3Qes7ZxcNX83975J2i4hygTQAAIDxY3sV2x8velGqWmD7Z7bbA+mq9a5j+/Qa9d3RqxeirfyyZ/gzTdrYo/zj29p3Qp/l7V6UValnuMi7h4cPs+zlV7bX6qOt63loqHgVt9neqWFdq9n+Hw8fxdDLZa457H8s2J7qoTmeg3Zlj7q39vBe/dIi2z23y7IdTvNin6zYpgW2j3SN0Qcj1Hl4j/pe2iXvmPcMF3kP9fAe224W2/6200W2RpxGRVzavZphLnO6sNWkrg08fP2GKs5yh5EEAAAA485pDup+tr9j+2oPH35rp2BkptOQ5Y+44tC6CvXu6DSUcKRg7gmn+cyH257cu7Rh5U6zfZfTfMm9eueo3e7NnAJ0276m3/ORf2C2fjz/ukH+ybbfnn90zhnhXM60/UM3DEo71Lmz7RNy2e3m5La81fZKA6jrhU4Bw60j1NWq73e2D/YEGhrdzvZxTkHioPVcnMrpPfI+p/nejxR5z3W9BdjWcpoq8Rc/83tisdPn4WtOvYh9c1q07gtOwd7cXM8S2392l4WfnKZ92PanGta7o4cWmju6Qf7ptj/kNCy5VU7pRtvHusGw9Q71he19bf/CaX54u4ds/6/t19R5vbvU93KnBRTvGfkt6YdzffsMoj4AaOELBcCYcJo7vLrSsN1Gw38b1LeO0jDC2ZJmR8SiPspbQdLkusMOa5S/otJw7gcHsZ2SU9A4PSIe7Zm4d7vWkXS9pGdJ+nREfLXf9vWos/XaraS0dUpfr12PutZSGv66ptLw9NmS7q47DHe85PflagMsckmTz2d+v02KiPlNK3bqzVxL6bWYI+nhiJjbPVd/nHqxn67yetueXnE7p075V5a0ckTM6Zm4ezmTlc7TWpKeVDpPjdtVob4o6pOGvk9HZds32+srff5XVxoq/XBE3D0adQEAAABd2f4/RU9do6HsAAAAE03HlTQBAMhaq3v/PiLu6ZoSAAAAAIClndMWKPfmnuG/2f6i7Z3Hu10AAAAAAIyavLDNSH7gPlb2BQAAAABgwnLa/uZcp9Wcb2gLiAe+zRQAAAAAABOO7V1sP5qD4fvZ5gQAAAAAsFxw2hu6Zf3xbg8AAEATrCYNAKjr6uL+tHFrBQAAQB8IhgEAdS0c7wYAAAD0i2AYAFBXOTSawBgAAAAAsGywvbXtb9heqe3vk2yfnecLz7O98ni1EQAAAACAgbEdts/PAe/Ntv/V9mtsH2b7wmLxrJ+Md1sBAAAAABgI26vYPs/d3Wh73fFuKwAAAAAAA5OHQ7/R9jm25xdB8JO2j7W92ni3EQAAoB8x3g0AAExstqdIWldpG6XbI2L+ODcJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDeYrwbAADAaLC9q6Q9Ja0o6XpJ/xsRS/osc09JL5N0dETM77+VSy/bb5S0raRFks6LiItHub6tJR0oabqk2yX9LCLmjWadAAAAAJYxtqfb3s729h3+Pdf22uPdzqZsr2j7KdsL861tHzCAcs/KZe0wiHYurWzvkM/DPNvz83meMcp1Xm57ie05ue7PjGZ9AIBl34rj3QAAwNiyvaKkGyRtUiHtLEmXSPqZpFMjYuEoN29Q1pQ0VdI7JJ0o6RFJzx1AuZPy7QoDKGtptmG+3U7SFElXSdpC0qxRrHMjSd+MiI/YvkSDeT0BAMsxgmEAWP6sqxQIL5Z0dYc003KaGUpDUw+U9Dfb74iIS8aklf1pDZ/dV+m5TJM0d/yas8xpnd+3KQXDkvTUGNS5k+33SNpU0pWjXB8AAACAZYntTfMw08d6pJtkexvbn7H9UM7zhO1dxqqt/bB9jofMsr3VAMr8XS5vp0G0cWlle23bM4vze4XtlUe5zm/kYdLOQ6X3Hc36AAAAACxjqgbDbXnWtH1Bznez7cmj2cZBsb2K7dUGWB7BcMH2qranjmF9k22vOVb1AQCWbZN6JwEALO8i4lGlodL3S3pOvj/hRcS8iJgz3u1YVkXEExExZsPPI2JBfi8CANA3gmEAQCUR8Zik7+aHrxrPtgAAAPSLYBgAUEdrL9nNxrMRAAAA/WI1aQBAHY/n257zcG0/R9IGShdeH5D094hY0qRS21soba0zWdKDuawFFfJtKml1STdExOKKda2qtJL2ypLuj4j7mrS5KG+qpOdJWkNpxeVbI+KhinnXlDQvIp4u/jZF0paS1pf0hKS/RcQTDdu2uqStJa2ay7qxzrBy29tKWhARt9TIU74v7pd0U9X3he31ct4by3PSJf3KkraRtLak+ZLujog7q7YVAAAAwDKkyQJaRd435bxndzi+iu3P2r7XzzTb9jG216pYV9g+om3V4pa5tn9ke6MeZdyS0+9fob4Dbf/J9sK2um6z/TXbG9dZQMv29rZPtz2/rbwlti+1/foe+dewPc/2Bfnx6ra/bvuRtvIW2T7D9vN7takoey/b5+e87WX9wfYeFcpYt3g+z+qRdqrtz7nz++LoXmXkcn6V8/y/Huk2yO+PeSPUd4ftD9lmdBwAAACwPHF/wfBxOe/XRjg2w/Z1RdBxi+3TcgBznYe2xZlpe+se9YTtk9oCmHNs/yaX1QowH7L9vC7lzMrp3tQlzQq2Tyjqmmv7Etu/t32Vh4Ljp2w/kO93DYZtv9v2gpx2nlOQfYpTMD27qOs429GhjA1zmuttb2H7rvz4cacg+3jbp9p+OP/9Sdu7dWtXLvcLxWvxhO1zc9v+kB/b9mLbn+xRzhbF89ikS7oN8nNolftX2z+0/QMPv/gw0z22v/LQdllf6pLm2bbvy+metn210/vw/OIcOp+7FXqdLwAAAADLCDcMhm2v5xQo2vbObccmOfV22vZNtncfIf8LizS3OA337VTXO3O6Wbb3GuH4+jnAse0r3TmgrBIMH5XTPG77fe3tctpW6hMe3iPbMRh26nVdnNMd67aecKftgY7wUK/lhzuUUwbDV+b7R9ue1pZuqlNgbNt3u8t+v7YPz+kWOvXUtpc13fYXPdRj3LH32hWCYacLDZfnNH/2CBdBcjnn5zQ392h/lWD44pzmdKdh1e3H9y7eF//cqRwAAAAAyxg322d4Fdtn53x/GOH4IfnYHbbX6VLOtCKwe3+XdK0A6pVd0ky2/fecbucOaboGw/lcLMj/Xtqprpx2Iw8Nu+4WDLcC/i/2KO81Od1s26uMcLwMhr9t+y1dyppk+7Kc/pAOaVb0UI/pO3q07YM53Q1d0lQJhg/Nx692l/2IbU8p2v/eLum6BsO2X5yP3+oue2Hb3rN1bjulAQAAALCMccVgOAebW+TA6Pac51Gnxaza0/48H393hfr3zWl/2+F45OD0KfcYxmr787msIzoc7xUMH5GP/7BXu3P6rnOGnQJmOw3f7tjDWaQ/N6ffe4Rj/wiGK7bt/Tn9sR2O75aPX1OhrPDQhYbndEhTJRg+JR/vuS+17VfntGd2SdMrGH57Pv7tCvXNdBouPr1XWgDAsonFIwAAkv7Rc3ih8xBZpdV3b5P0X5I2l3SXpFdExO0jZG/N9Ty/QlXnS7Kk53Y4Pklpt4PHK6wA3VrFuOfq1h1sk2/Pa5i/Xes8XBwR8yukb9Xbda5sRa0gd0aH45Vfo4iwpAvyw06vUxWtOi/olqhI0+19UcVK+faRCmlvlRRKK2kDAJZDbK0EAGiZLmkXSa3e2IWSZku6StKZkr7fZTubNfLt7F6VRMTTtp8s8rQfX2x7pqTNbG8aETO7FHempCMk/apXvR202vBww/ydyut5HrLWFkurD6Du1pZIneZit+qo2rbWhYZFjVuUzseSiOg5JD+/L55Sh/dFRXfk2xGHzbf5lKRtI2JWH/UBAJZi9AwDACRJOWD5Zn54u6R1I2JGROwXEd/usa9rawGrqvsILynyjOS0fPsDp712O7X58Yg4NiLurVjvM4oo2jMIdctzvh3E/8fucbxVR690LV+XtEFEjLiNVkVRoz7ltN3eF71crHSBYW+n4f0dy4qISyOi0vB4AMCyiZ5hAEDpU5JeptRDfKLtA/KQ2arC9sGSOgaw2WRJ87oc/4qkN0jaU9Jtto+XdLakv1QcfjzubG8q6ZXqHty1tkKqc47HRH7dl6pe09y7/BFJP1Ya3v/2PB/8DxFx8/i2DgAw0RAMAwD+ISIW5sWmrpL0Gkkfk3RUjSKeK+mUimmv69KOh2y/TNLxkvaT9Mn8b67t8yWdJen0PnqEx8KnJb2nYtpbR7Mhy5OI+Ekebv2fkl6a/ykPvf+t0nvn7IhYMH6tBABMBATDAIBhIuJu22+X9BtJX7H914j4U8XstyoFgb3mwD4l6aQe7bhH0v62ny/pYEl7SdpR0v753zdsf0fSpyPiqYrtG0vHKy3k1GvY742Sfjn6zVl+RMSpeVXq/ZUupuwpaQtJ78v/7rL94Yg4dRybCQAYZwTDAIBniIgzbR8t6eOSTrH9kooLDS2OiK8OuC3XS7pe0udtT5P0cqXg+DCeBBgEAAAHUUlEQVSlxbN2tL3HRBs+HRFXSrpyvNuxvMo9v6fmf7K9mdIFlfcoXVT5le0jImLEragAAMs+FtACAHTyaUkXSVpf0knusedvHba3s71dh2OTbI/YsxwRT0XE7yLinUo9fZcorRz8gUG1bSzZnmL7gIm4163t1W2/zvZKvVNPDLZXtT3ihf6IuDMivh8RO0l6raSnJf2H7XXHtJEAgAmDYBgAMKKIWCTpUKXVeV8h6cguyVvb71QNnM5W5+2QvivpoV5BSu6p/mB+uF/Fetu12l11pFTr+S3scHxhW7pe3ijpdEmHV0zfj1bbqj7XDyut6v2qPupcJGnSIC+kdJJHDcySdHKvtBFxhqQfKG1DtdcoNw0AMEERDAMAOsrzdg+VtFjSp23v2yFpa5/ejXuVaXsNSetI6jSseVWlYHLzCk28Ld+uUyHtSFp77m5QMf2m+fahDscrn4dsy3w7FkO867Ztm3z7ZB91Pqo0Z3r9PsqoapKkaZK2qpj+9ny79ug0BwAw0REMAwC6iog/SPp3pf8zTspzL9tdmm8PqlDk6/Ntp/m0rZWVX16hrG3zbdMtgC7Lt6/rlTAP6362pPsk3dMh2TWSFkja1faMHuVNknRgfjgWc4tbr9F+tqd2S2h7NaVtoRaov7Zdm2/36VHf9Nym+Wq4nklEPCHpfklb265ycaT13rm/SX0AAAAAljK2N3XyWI08k2z/Pue7xPbktuPb215ie67t3bqUs7XtB3I5Iw5ttr1jPj7L9kZdypps+4857REd0szKx9/U4fgath/Nad7Spa7VbV+Z0325U7qc9ic53W9tr9wl3ZdyuhtyYNx+fMN8/Ppu9RXpt83pz+iS5qKc5nsj1ZnTrGD7pJzup13K2sJDNumQ5nX5+G22R9x72vYm+fivbN9oe6E7zFO2fU4u70sdjh+fj59gu+Mq3k5z1p+2Pc/2Wp3SAQAAAFiGuEEwnPOtZ/u+nPdbIxz/Zj423/ZRtl9oeyXbKzoFwZ+z/URO84sedZ2c091n+/22NyyOTba9h+0/5TQ32V6lQzldg+Gc5l05zZIcRO3aKs/2RrbfafuOnOYGp17Tbm3fqDhP19s+zPZ6+dhqtl9dBHXzbe/eoZzRCIZfbHtOTnexU7C6Zj72LNsH2v5rPn6/7Y5Dql0tGJ5k+8/F63SI7bXzsfVtv89DF0feZ/v0fP/NHcrrFQxvYvuRnOZ3tvd2mkvcOr620/uplebznZ4fAAAAgGWMGwbDOe9ethfn/Pu2HZtk+9+dgspufmx7So96pto+tS3fUzmIWVT87W+2n92lnJ7BcE73Aadewm7+7CIo71He1k6BcDcPu0PveC5j4MFwTreL7bt7tO0m2y/oUU7PYDinm+GhAHskS5yDW6dgueXi9vPtHsFwTvOyEZ7fo7Yfb/vbt92hdxwAAADAMshpO5+rbJ/YMP9HnYa1frHD8efb/lau4wGnoO96p6G5u9asa2+nYce3O/Wi2vZDts9z6uEbsUe4yP9zp6G323ZLl9Nu7DR0+S9OQfQjtm+xfYrtN9QNnJx6sN9m+zSnnuVHbN9r+3zbn7D9rB75V7F9qUfohe+QfnXbV9v+TIW002z/i+2zc+D4iO2Ztn/j1FPe9WJFLmNqfo0vcZfh4DntpHwOT8xtvC3n/b7tndvSHmH7svy6bdZ27Av5NTmgR32r5nLOs/1gft/Mz6/DibarzEcHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACS/j8bugwnJG9zZgAAAABJRU5ErkJggg==";

function escapePdfHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatPdfDate(value){
  const d=new Date(value||Date.now());
  return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function imageBlobToJpeg(blob,maxWidth=1200,maxHeight=1000){
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();
    img.decoding='async';
    img.src=url;
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));});
    const iw=img.naturalWidth||img.width;
    const ih=img.naturalHeight||img.height;
    if(!iw||!ih) throw new Error('Dimensões de imagem inválidas.');

    // Redimensiona somente se necessário, mantendo rigorosamente a proporção original.
    const scale=Math.min(1,maxWidth/iw,maxHeight/ih);
    const cw=Math.max(1,Math.round(iw*scale));
    const ch=Math.max(1,Math.round(ih*scale));
    const canvas=document.createElement('canvas');
    canvas.width=cw;
    canvas.height=ch;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,cw,ch);
    ctx.drawImage(img,0,0,cw,ch);
    return {dataUrl:canvas.toDataURL('image/jpeg',0.92),width:cw,height:ch};
  }finally{
    URL.revokeObjectURL(url);
  }
}

async function loadJsPDF(){
  if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;

  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-rhg-jspdf]');
    if(existing){
      existing.addEventListener('load',()=>resolve(window.jspdf.jsPDF));
      existing.addEventListener('error',()=>reject(new Error('Não foi possível carregar o gerador de PDF.')));
      return;
    }

    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.async=true;
    script.dataset.rhgJspdf='1';
    script.onload=()=>{
      if(window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
      else reject(new Error('Biblioteca PDF carregada, mas indisponível.'));
    };
    script.onerror=()=>reject(new Error('Não foi possível carregar a biblioteca PDF. Verifique sua conexão com a internet.'));
    document.head.appendChild(script);
  });
}

function pdfText(doc,text,x,y,size=9,style='normal',color=[35,63,82],options={}){
  doc.setFont('helvetica',style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  // jsPDF aceita arrays como linhas independentes. Não converter o array
  // para String, pois isso transforma as linhas em uma única string com vírgulas.
  const value=Array.isArray(text) ? text : String(text ?? '');
  doc.text(value,x,y,options);
}

function pdfMoney(n){
  return money(n);
}

function pdfWrapped(doc,text,x,y,maxWidth,size=9,style='normal',color=[35,63,82],lineHeight=4.5){
  doc.setFont('helvetica',style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines=doc.splitTextToSize(String(text ?? ''),maxWidth);
  doc.text(lines,x,y);
  return y+(lines.length*lineHeight);
}

function pdfSectionTitle(doc,title,y){
  const navy=[23,50,77],gold=[200,168,78];
  pdfText(doc,title.toUpperCase(),15,y,8.5,'bold',navy);
  doc.setFillColor(...gold);
  doc.rect(15,y+2,28,0.8,'F');
  return y+7;
}

function pdfAddHeader(doc,d,logo){
  const navy=[23,50,77],gold=[200,168,78],light=[245,248,250];
  const pageW=210;

  doc.setFillColor(...navy);
  doc.rect(0,0,pageW,39,'F');

  // Título à esquerda
  pdfText(doc,'RHGONÇALVES',15,11,8.5,'bold',gold);
  pdfText(doc,'ORÇAMENTO',15,21,21,'bold',[255,255,255]);
  pdfText(doc,'SERVIÇOS ELÉTRICOS',15,28,8.5,'bold',[218,229,238]);

  // Logo e dados da empresa à direita
  if(logo){
    try{
      doc.addImage(logo,'PNG',152,3,48,25.9,'rhglogo','FAST');
    }catch(e){}
  }
  pdfText(doc,'RHGonçalves Serviços Elétricos',195,29,7.2,'bold',[255,255,255],{align:'right'});
  pdfText(doc,'CNPJ: 58.261.963/0001-29',195,33.2,6.5,'normal',[218,229,238],{align:'right'});
  pdfText(doc,'(11) 9 9868-4935 · Bragança Paulista - SP',195,36.3,6.1,'normal',[218,229,238],{align:'right'});

  // faixa dourada
  doc.setFillColor(...gold);
  doc.rect(0,39,pageW,2,'F');

  // Meta
  doc.setFillColor(...light);
  doc.rect(15,47,180,18,'F');
  pdfText(doc,'Nº DO ORÇAMENTO',19,53,6.5,'bold',[106,126,143]);
  pdfText(doc,d.quoteNumber||'—',19,60,9,'bold',navy);
  pdfText(doc,'DATA',88,53,6.5,'bold',[106,126,143]);
  pdfText(doc,formatPdfDate(d.date).split(' ')[0]||'—',88,60,9,'bold',navy);
  pdfText(doc,'STATUS',145,53,6.5,'bold',[106,126,143]);
  pdfText(doc,d.status||DEFAULT_STATUS,145,60,8.2,'bold',navy);

  return 73;
}

function pdfEnsureSpace(doc,y,needed,logo,d){
  if(y+needed<=282) return y;
  doc.addPage();
  return pdfAddHeader(doc,d,logo);
}

function quoteDescriptionFingerprint(d){
  const payload={
    services:(d.services||[]).filter(x=>String(x.desc||'').trim()).map(x=>({qty:x.qty,desc:String(x.desc).trim(),unit:x.unit})),
    materials:(d.materials||[]).filter(x=>String(x.desc||'').trim()).map(x=>({qty:x.qty,desc:String(x.desc).trim(),supply:x.supply,unit:x.unit}))
  };
  return JSON.stringify(payload);
}

async function generateQuoteDescription(d){
  const fingerprint=quoteDescriptionFingerprint(d);
  if(d.quoteDescription?.trim() && d.quoteDescriptionFingerprint===fingerprint) return d.quoteDescription.trim();

  const response=await fetch('/api/rhg/quote-description',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      client:d.client,
      services:(d.services||[]).filter(x=>String(x.desc||'').trim()),
      materials:(d.materials||[]).filter(x=>String(x.desc||'').trim()),
      discount:d.discount,
      total:$('#grandTotal').textContent
    })
  });

  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'Não foi possível gerar a descrição do orçamento.');
  const description=String(data.description||'').trim();
  if(!description) throw new Error('O RHG-Bot não retornou uma descrição para o orçamento.');

  d.quoteDescription=description;
  d.quoteDescriptionFingerprint=fingerprint;
  localStorage.setItem(draftKey,JSON.stringify(d));
  const h=JSON.parse(localStorage.getItem(historyKey)||'[]');
  const i=h.findIndex(x=>x.id===d.id);
  if(i>=0){h[i]=d;localStorage.setItem(historyKey,JSON.stringify(h));}
  return description;
}

async function generateRHGQuotePDF(){
  const JSZipPDF=await loadJsPDF();
  const d=saveDraft();
  const generatedDescription=await generateQuoteDescription(d);
  // Usa explicitamente a descrição recém-gerada, mesmo quando o rascunho
  // ainda continha uma versão anterior em memória.
  d.quoteDescription=generatedDescription;
  const photos=await getPhotos(d.id);

  const doc=new JSZipPDF({
    orientation:'portrait',
    unit:'mm',
    format:'a4',
    compress:true
  });

  const logo=RHG_PDF_LOGO||'';
  let y=pdfAddHeader(doc,d,logo);

  // Cliente
  y=pdfEnsureSpace(doc,y,34,logo,d);
  y=pdfSectionTitle(doc,'Cliente',y);
  doc.setDrawColor(219,228,235);
  doc.setFillColor(250,252,253);
  doc.roundedRect(15,y,180,25,1.5,1.5,'FD');
  pdfText(doc,'Nome / Razão Social',19,y+7,6.5,'bold',[106,126,143]);
  pdfText(doc,d.client?.name||'Cliente',19,y+13,9.2,'bold',[35,63,82]);
  pdfText(doc,'Telefone / WhatsApp',110,y+7,6.5,'bold',[106,126,143]);
  pdfText(doc,d.client?.phone||'—',110,y+13,9.2,'bold',[35,63,82]);
  pdfText(doc,'Endereço',19,y+20,6.5,'bold',[106,126,143]);
  pdfText(doc,d.client?.address||'—',45,y+20,8.3,'normal',[35,63,82]);
  y+=33;

  // Descrição final gerada pelo RHG-Bot com base no orçamento pronto.
  // A largura da área útil é calculada para manter o texto dentro da caixa.
  if(d.quoteDescription?.trim()){
    const descriptionText=String(d.quoteDescription).trim().replace(/\r\n/g,'\n');
    const descriptionWidth=172;
    const lines=doc.splitTextToSize(descriptionText,descriptionWidth);
    const lineHeight=4.5;
    const topPadding=7;
    const bottomPadding=7;
    const h=Math.max(16,lines.length*lineHeight+topPadding+bottomPadding);

    // Reserva a altura real antes de desenhar a seção.
    y=pdfEnsureSpace(doc,y,7+h+8,logo,d);
    y=pdfSectionTitle(doc,'Descrição do serviço',y);

    doc.setFillColor(247,249,250);
    doc.roundedRect(15,y,180,h,1.5,1.5,'F');
    pdfText(doc,lines,19,y+topPadding,8.5,'normal',[53,79,99]);
    y+=h+8;
  }

  // Serviços
  y=pdfEnsureSpace(doc,y,34,logo,d);
  y=pdfSectionTitle(doc,'Serviços',y);

  const services=(d.services||[]).filter(x=>x.desc);
  const serviceHeaderY=y;
  const cols=[15,108,132,160,195];
  doc.setFillColor(23,50,77);
  doc.rect(15,y,180,8,'F');
  pdfText(doc,'Serviço',18,y+5.4,7,'bold',[255,255,255]);
  pdfText(doc,'Qtd.',120,y+5.4,7,'bold',[255,255,255],{align:'center'});
  pdfText(doc,'Valor unitário',157,y+5.4,7,'bold',[255,255,255],{align:'right'});
  pdfText(doc,'Valor',192,y+5.4,7,'bold',[255,255,255],{align:'right'});
  y+=8;

  for(const item of services){
    const descLines=doc.splitTextToSize(item.desc,88);
    const rowH=Math.max(8,descLines.length*4.2+4);
    y=pdfEnsureSpace(doc,y,rowH+2,logo,d);
    if(y!==serviceHeaderY+8 && y===pdfAddHeader(doc,d,logo)){
      // Recria o cabeçalho da tabela após uma quebra de página.
      doc.setFillColor(23,50,77); doc.rect(15,y,180,8,'F');
      pdfText(doc,'Serviço',18,y+5.4,7,'bold',[255,255,255]);
      pdfText(doc,'Qtd.',120,y+5.4,7,'bold',[255,255,255],{align:'center'});
      pdfText(doc,'Valor unitário',157,y+5.4,7,'bold',[255,255,255],{align:'right'});
      pdfText(doc,'Valor',192,y+5.4,7,'bold',[255,255,255],{align:'right'});
      y+=8;
    }
    if(Math.round((y*10))%2===0){
      doc.setFillColor(247,249,250);
      doc.rect(15,y,180,rowH,'F');
    }
    pdfText(doc,descLines,18,y+5.5,8,'normal',[38,63,82]);
    pdfText(doc,item.qty,120,y+5.5,8,'normal',[38,63,82],{align:'center'});
    pdfText(doc,pdfMoney(item.unit),157,y+5.5,8,'normal',[38,63,82],{align:'right'});
    pdfText(doc,pdfMoney((+item.qty||0)*(+item.unit||0)),192,y+5.5,8,'bold',[23,50,77],{align:'right'});
    doc.setDrawColor(220,228,234); doc.line(15,y+rowH,195,y+rowH);
    y+=rowH;
  }

  if(!services.length){
    pdfText(doc,'Nenhum serviço informado.',18,y+6,8,'normal',[123,140,153]);
    y+=11;
  }
  y+=8;

  // Materiais
  const materials=(d.materials||[]).filter(x=>x.desc);
  if(materials.length){
    y=pdfEnsureSpace(doc,y,35,logo,d);
    y=pdfSectionTitle(doc,'Materiais',y);

    doc.setFillColor(23,50,77); doc.rect(15,y,180,8,'F');
    pdfText(doc,'Material / especificação',18,y+5.4,6.8,'bold',[255,255,255]);
    pdfText(doc,'Qtd.',103,y+5.4,6.8,'bold',[255,255,255],{align:'center'});
    pdfText(doc,'Fornecimento',128,y+5.4,6.8,'bold',[255,255,255],{align:'center'});
    pdfText(doc,'Unitário',163,y+5.4,6.8,'bold',[255,255,255],{align:'right'});
    pdfText(doc,'Valor',192,y+5.4,6.8,'bold',[255,255,255],{align:'right'});
    y+=8;

    for(const item of materials){
      const descLines=doc.splitTextToSize(item.desc,78);
      const rowH=Math.max(8,descLines.length*4.1+4);
      y=pdfEnsureSpace(doc,y,rowH+2,logo,d);
      if(y===pdfAddHeader(doc,d,logo)){
        doc.setFillColor(23,50,77); doc.rect(15,y,180,8,'F');
        pdfText(doc,'Material / especificação',18,y+5.4,6.8,'bold',[255,255,255]);
        pdfText(doc,'Qtd.',103,y+5.4,6.8,'bold',[255,255,255],{align:'center'});
        pdfText(doc,'Fornecimento',128,y+5.4,6.8,'bold',[255,255,255],{align:'center'});
        pdfText(doc,'Unitário',163,y+5.4,6.8,'bold',[255,255,255],{align:'right'});
        pdfText(doc,'Valor',192,y+5.4,6.8,'bold',[255,255,255],{align:'right'});
        y+=8;
      }
      pdfText(doc,descLines,18,y+5.5,7.8,'normal',[38,63,82]);
      pdfText(doc,item.qty,103,y+5.5,7.8,'normal',[38,63,82],{align:'center'});
      pdfText(doc,item.supply||'—',128,y+5.5,7.2,'normal',[38,63,82],{align:'center'});
      pdfText(doc,pdfMoney(item.unit),163,y+5.5,7.8,'normal',[38,63,82],{align:'right'});
      pdfText(doc,pdfMoney((+item.qty||0)*(+item.unit||0)),192,y+5.5,7.8,'bold',[23,50,77],{align:'right'});
      doc.setDrawColor(220,228,234); doc.line(15,y+rowH,195,y+rowH);
      y+=rowH;
    }
    y+=8;
  }

  // Resumo financeiro
  y=pdfEnsureSpace(doc,y,45,logo,d);
  y=pdfSectionTitle(doc,'Resumo financeiro',y);

  const serviceTotal=(d.services||[]).reduce((a,x)=>a+(+x.qty||0)*(+x.unit||0),0);
  const materialTotal=(d.materials||[]).filter(x=>x.supply==='RHGonçalves').reduce((a,x)=>a+(+x.qty||0)*(+x.unit||0),0);
  const discount=+d.discount||0;
  const total=Math.max(0,serviceTotal+materialTotal-discount);

  doc.setDrawColor(23,50,77); doc.setLineWidth(0.6); doc.line(92,y,195,y);
  pdfText(doc,'Total de serviços',100,y+7,8,'normal',[83,107,124]);
  pdfText(doc,pdfMoney(serviceTotal),192,y+7,8,'bold',[23,50,77],{align:'right'});
  y+=7;
  pdfText(doc,'Total de materiais',100,y+7,8,'normal',[83,107,124]);
  pdfText(doc,pdfMoney(materialTotal),192,y+7,8,'bold',[23,50,77],{align:'right'});
  y+=7;
  if(discount){
    pdfText(doc,'Desconto',100,y+7,8,'normal',[83,107,124]);
    pdfText(doc,'- '+pdfMoney(discount),192,y+7,8,'bold',[160,77,59],{align:'right'});
    y+=7;
  }

  doc.setFillColor(23,50,77); doc.roundedRect(92,y+2,103,17,1.5,1.5,'F');
  doc.setFillColor(200,168,78); doc.rect(92,y+2,4,17,'F');
  pdfText(doc,'PREÇO FINAL',100,y+12.5,9,'bold',[255,255,255]);
  pdfText(doc,pdfMoney(total),192,y+13,14,'bold',[255,255,255],{align:'right'});
  y+=27;

  // Condições
  y=pdfEnsureSpace(doc,y,30,logo,d);
  y=pdfSectionTitle(doc,'Condições comerciais',y);
  const conditionLines=doc.splitTextToSize(d.conditions||'Orçamento válido por 7 dias.\nGarantia de mão de obra: 90 dias.\nPagamento: Pix, cartão ou dinheiro.',170);
  const conditionH=Math.max(18,conditionLines.length*4.3+8);
  doc.setFillColor(247,249,250); doc.roundedRect(15,y,180,conditionH,1.5,1.5,'F');
  pdfText(doc,conditionLines,19,y+7,8,'normal',[53,79,99]);
  y+=conditionH+10;

  // Fotos
  if(photos.length){
    doc.addPage();
    y=pdfAddHeader(doc,d,logo);
    y=pdfSectionTitle(doc,'Registro fotográfico',y);

    const photoW=86;
    const photoH=82;
    const photoGapX=6;
    const photoTextWidth=photoW-8;
    const photoLineHeight=3.6;
    const photoBottomPadding=7;

    // Cada linha é calculada pelo maior texto das duas fotos.
    // Assim, a caixa acompanha a descrição e nunca corta o conteúdo.
    for(let i=0;i<photos.length;i+=2){
      const pair=photos.slice(i,i+2);
      const captionLines=pair.map(photo=>
        photo.description
          ? doc.splitTextToSize(String(photo.description).trim(),photoTextWidth)
          : []
      );
      const maxCaptionLines=Math.max(0,...captionLines.map(lines=>lines.length));
      const captionH=maxCaptionLines ? 6+(maxCaptionLines*photoLineHeight)+photoBottomPadding : 8;
      const cardH=photoH+captionH;
      const rowH=cardH+10;

      // Reserva a altura real da linha antes de desenhá-la.
      y=pdfEnsureSpace(doc,y,rowH,logo,d);

      for(let pairIndex=0;pairIndex<pair.length;pairIndex++){
        const photo=pair[pairIndex];
        const x=pair.length===1 ? 62 : 15+pairIndex*(photoW+photoGapX);
        const top=y;
        const lines=captionLines[pairIndex];

        doc.setDrawColor(215,224,231);
        doc.setFillColor(250,251,252);
        doc.roundedRect(x,top,photoW,cardH,1.5,1.5,'FD');

        try{
          const normalized=await imageBlobToJpeg(photo.blob,1200,1000);
          const ratio=Math.min((photoW-4)/normalized.width,(photoH-4)/normalized.height);
          const dw=normalized.width*ratio,dh=normalized.height*ratio;
          const ix=x+(photoW-dw)/2,iy=top+2+(photoH-dh)/2;
          doc.addImage(normalized.dataUrl,'JPEG',ix,iy,dw,dh,`photo${i+pairIndex}`,'FAST');
        }catch(e){
          pdfText(doc,'Imagem indisponível',x+photoW/2,top+photoH/2,7,'normal',[123,140,153],{align:'center'});
        }

        pdfText(doc,`Foto ${String(i+pairIndex+1).padStart(2,'0')}`,x+4,top+photoH+6,7.5,'bold',[23,50,77]);
        if(lines.length){
          pdfText(doc,lines,x+4,top+photoH+11,7,'normal',[65,86,103]);
        }
      }

      y+=rowH;
    }
  }

  // Assinatura
  y=pdfEnsureSpace(doc,y,32,logo,d);
  const sigY=Math.min(y+8,270);
  doc.setDrawColor(80,101,117);
  doc.line(65,sigY,145,sigY);
  pdfText(doc,'RHGonçalves Serviços Elétricos',105,sigY+6,8.5,'bold',[23,50,77],{align:'center'});
  pdfText(doc,'Responsável pelo orçamento',105,sigY+11,7.2,'normal',[113,132,147],{align:'center'});

  // Rodapé em todas as páginas
  const pageCount=doc.getNumberOfPages();
  for(let p=1;p<=pageCount;p++){
    doc.setPage(p);
    doc.setDrawColor(219,228,235);
    doc.setLineWidth(0.3);
    doc.line(15,286,195,286);
    pdfText(doc,`RHGonçalves Serviços Elétricos · Orçamento ${d.quoteNumber||'—'}`,15,291,6.5,'normal',[123,140,153]);
    pdfText(doc,`Página ${p} de ${pageCount}`,195,291,6.5,'normal',[123,140,153],{align:'right'});
  }

  const filename=`Orcamento_RHGoncalves_${d.quoteNumber||'sem-numero'}.pdf`;
  const blob=doc.output('blob');
  const file=new File([blob],filename,{type:'application/pdf'});

  // Compartilhamento nativo no celular, quando disponível.
  if(navigator.share && navigator.canShare){
    try{
      if(navigator.canShare({files:[file]})){
        await navigator.share({
          title:`Orçamento ${d.quoteNumber||''} · RHGonçalves`,
          text:`Orçamento ${d.quoteNumber||''} da RHGonçalves Serviços Elétricos.`,
          files:[file]
        });
        return;
      }
    }catch(e){
      if(e?.name==='AbortError') return;
    }
  }

  // Fallback: download direto do arquivo PDF.
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
}

$('#pdfBtn').onclick=async()=>{
  const btn=$('#pdfBtn');
  const original=btn.textContent;
  try{
    btn.disabled=true;
    btn.textContent='Gerando PDF...';
    await generateRHGQuotePDF();
    btn.textContent='PDF pronto!';
    setTimeout(()=>btn.textContent=original,1800);
  }catch(e){
    console.error(e);
    alert('Não foi possível gerar o PDF: '+(e?.message||e));
    btn.textContent=original;
  }finally{
    btn.disabled=false;
  }
};
$('#whatsBtn').onclick=()=>{let d=ensureQuoteNumber(collect()),t=`Olá, ${d.client.name||'cliente'}! Segue o resumo do Orçamento ${d.quoteNumber||''} da RHGonçalves Serviços Elétricos.\n\nSERVIÇOS\n`;d.services.filter(x=>x.desc).forEach(x=>t+=`• ${x.qty}x ${x.desc} — ${money(x.unit)} cada\n`);t+=`Total de serviços: ${$('#serviceTotal').textContent}\n\nMATERIAIS\n`;d.materials.filter(x=>x.desc).forEach(x=>{t+=`• ${x.qty}x ${x.desc}`;t+=x.supply==='Sem preço'?' — sem preço':x.supply==='Cliente'?' — fornecido pelo cliente':` — ${money(x.unit)} cada`;t+='\n'});t+=`Total de materiais: ${$('#materialTotal').textContent}\n`;if(d.discount)t+=`Desconto: ${money(d.discount)}\n`;t+=`Total do orçamento: ${$('#grandTotal').textContent}`;window.open('https://wa.me/?text='+encodeURIComponent(t),'_blank')};

$$('.chips button').forEach(b=>b.onclick=()=>$('#assistantInput').value=b.dataset.q);
$('#assistantBtn').onclick=async()=>{
 const q=$('#assistantInput').value.trim();
 if(!q){$('#assistantStatus').textContent='Descreva a situação primeiro.';return}
 $('#assistantBtn').disabled=true;$('#assistantStatus').textContent='Consultando o RHG-Bot...';
 try{
   const d=collect();
   const r=await fetch('/api/rhg/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     situation:q,context:{client:d.client,description:d.description,services:d.services,materials:d.materials,discount:d.discount,total:$('#grandTotal').textContent}
   })});
   const data=await r.json();
   if(!r.ok) throw new Error(data.error||'Falha na integração');
   $('#advice').textContent=data.advice||'';
   $('#message').textContent=data.message||'';
   $('#assistantResult').classList.remove('hidden');
   $('#assistantStatus').textContent='Resposta recebida do RHG-Bot.';
 }catch(e){$('#assistantStatus').textContent='Não foi possível consultar o RHG-Bot: '+e.message}
 finally{$('#assistantBtn').disabled=false}
};
$('#copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('#message').textContent);$('#copyBtn').textContent='Copiado!';setTimeout(()=>$('#copyBtn').textContent='Copiar mensagem',1000)}catch(e){}};

if(!services.children.length)addRow('service');if(!materials.children.length)addRow('material');loadDraft();calc();
// =====================================================
// BASE RHG - GOOGLE SHEETS
// =====================================================

let currentDbSheet = "MATERIAIS";
let currentDbData = [];

const dbLabels = {
  "MATERIAIS": "Materiais",
  "SERVIÇOS": "Serviços",
  "FORNECEDORES": "Fornecedores",
  "CLIENTES": "Clientes"
};


async function loadRHGDatabase(sheet = currentDbSheet) {

  currentDbSheet = sheet;

  const content = document.getElementById("dbContent");
  const status = document.getElementById("dbStatus");

  if (!content || !status) return;

  content.innerHTML = "";
  status.textContent = "Consultando base RHG...";

  try {

    const response = await fetch(
      `/api/rhg/data/${encodeURIComponent(sheet)}`
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error || "Não foi possível consultar a base."
      );
    }

    currentDbData = result.data || [];

    status.textContent =
      `${currentDbData.length} registro(s) encontrado(s).`;

    renderRHGDatabase();

  } catch (error) {

    status.textContent =
      "Erro ao consultar a base.";

    content.innerHTML = `
      <div class="result">
        <strong>Não foi possível consultar a Base RHG.</strong>
        <p>${escapeHTML(error.message)}</p>
      </div>
    `;
  }
}


function renderRHGDatabase() {

  const content =
    document.getElementById("dbContent");

  const search =
    document.getElementById("dbSearch");

  if (!content) return;

  const term =
    (search?.value || "")
      .trim()
      .toLowerCase();

  const filtered = currentDbData.filter(item => {

    if (!term) return true;

    return Object.values(item).some(value =>
      String(value ?? "")
        .toLowerCase()
        .includes(term)
    );
  });


  if (!filtered.length) {

    content.innerHTML = `
      <div class="empty-state">
        Nenhum registro encontrado.
      </div>
    `;

    return;
  }


  const keys =
    Object.keys(filtered[0])
      .filter(key => key !== "_row");


  let html = `
    <div class="db-table-wrap">
      <table class="db-table">
        <thead>
          <tr>
  `;


  keys.forEach(key => {

    html += `
      <th>${escapeHTML(key)}</th>
    `;

  });


  html += `
          </tr>
        </thead>
        <tbody>
  `;


  filtered.forEach(item => {

    html += "<tr>";

    keys.forEach(key => {

      html += `
        <td>${escapeHTML(item[key])}</td>
      `;

    });

    html += "</tr>";

  });


  html += `
        </tbody>
      </table>
    </div>
  `;


  content.innerHTML = html;
}


function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function setupRHGDatabase() {

  const tabs =
    document.querySelectorAll(".db-tab");

  tabs.forEach(tab => {

    tab.addEventListener("click", () => {

      tabs.forEach(t =>
        t.classList.remove("active")
      );

      tab.classList.add("active");

      loadRHGDatabase(
        tab.dataset.db
      );
    });

  });


  const search =
    document.getElementById("dbSearch");

  if (search) {

    search.addEventListener(
      "input",
      renderRHGDatabase
    );

  }


  const refresh =
    document.getElementById("dbRefresh");

  if (refresh) {

    refresh.addEventListener(
      "click",
      () => loadRHGDatabase()
    );

  }


  const add =
    document.getElementById("dbAdd");

  if (add) {

    add.addEventListener(
      "click",
      addRHGDatabaseRecord
    );

  }
}


async function addRHGDatabaseRecord() {

  const fields = {

    "MATERIAIS": [
      "ID Material",
      "Material",
      "Categoria",
      "Unidade",
      "Preço Unitário",
      "Fornecedor/Loja",
      "Ativo"
    ],

    "SERVIÇOS": [
      "ID Serviço",
      "Nome do Serviço",
      "Categoria",
      "Unidade de Cobrança",
      "Preço Base",
      "Ativo"
    ],

    "FORNECEDORES": [
  "ID Fornecedor",
  "Fornecedor/Loja",
  "Cidade",
  "Estado",
  "Endereço",
  "Telefone",
  "WhatsApp",
  "Site",
  "Observações",
  "Ativo"
],

    "CLIENTES": [
      "ID Cliente",
      "Nome/Razão Social",
      "Telefone",
      "Perfil do Cliente",
      "Endereço",
      "Ativo"
    ]

  };


  const selectedFields =
    fields[currentDbSheet] || [];


  if (!selectedFields.length) {

    alert(
      "Esta base ainda não possui formulário configurado."
    );

    return;
  }


  const data = {};


  for (const field of selectedFields) {

    const value =
      prompt(`Informe: ${field}`);

    if (value === null) return;

    data[field] = value;
  }


  try {

    const response = await fetch(
      "/api/rhg/data",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          action: "append",
          sheet: currentDbSheet,
          data
        })
      }
    );


    const result =
      await response.json();


    if (!response.ok || !result.ok) {

      throw new Error(
        result.error ||
        "Não foi possível salvar."
      );
    }


    alert(
      "Registro salvo na Base RHG."
    );


    await loadRHGDatabase(
      currentDbSheet
    );


  } catch (error) {

    alert(
      "Erro ao salvar: " +
      error.message
    );
  }
}
setupRHGDatabase();


// RHG_SHARED_HISTORY_V15
const ORCAMENTOS_SHEET = "ORÇAMENTOS";

function rhgHistoryNormalizeItem(item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    quantidade: Number(item.quantidade ?? item.qtd ?? item.Quantidade ?? 0),
    valorUnitario: Number(item.valorUnitario ?? item.valor ?? item["Valor Unitário (R$)"] ?? 0),
    total: Number(item.total ?? item["Total (R$)"] ?? 0)
  };
}

function rhgHistorySerializeItems(items) {
  return JSON.stringify((Array.isArray(items) ? items : []).map(rhgHistoryNormalizeItem));
}

function rhgHistoryRowFromQuote(q) {
  const services = Array.isArray(q.services) ? q.services : (Array.isArray(q.servicos) ? q.servicos : []);
  const materials = Array.isArray(q.materials) ? q.materials : (Array.isArray(q.materiais) ? q.materiais : []);
  return {
    "ID Interno": q.id || q.idInterno || crypto.randomUUID(),
    "Número do Orçamento": q.number || q.numeroOrcamento || "",
    "Data": q.date || q.data || new Date().toISOString(),
    "ID Cliente": q.clientId || q.idCliente || "",
    "Cliente": q.clientName || q.cliente || "",
    "Serviços": rhgHistorySerializeItems(services),
    "Materiais": rhgHistorySerializeItems(materials),
    "Subtotal": Number(q.subtotal ?? 0),
    "Desconto": Number(q.discount ?? q.desconto ?? 0),
    "Total": Number(q.total ?? 0),
    "Status": q.status || "Em Análise",
    "Observações": q.observations || q.observacoes || q.description || "",
    "Fonte do Documento": q.source || "RHG-App",
    "Tipo de Registro": q.recordType || "ORÇAMENTO"
  };
}

async function saveSharedQuoteV15(quote) {
  const payload = rhgHistoryRowFromQuote(quote);
  const response = await fetch("/api/orcamentos", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Não foi possível salvar o orçamento no histórico.");
  return response.json();
}

async function loadSharedQuotesV15() {
  const response = await fetch("/api/orcamentos");
  if (!response.ok) throw new Error("Não foi possível consultar o histórico compartilhado.");
  const result = await response.json();
  return Array.isArray(result.data) ? result.data : [];
}



// Compatibility aliases for the existing UI.
window.RHGSharedHistory = {
  save: saveSharedQuoteV15,
  load: loadSharedQuotesV15,
  mapRow: rhgHistoryRowFromQuote
};



// =========================================================
// RHG APP 2.0 - AUTOCOMPLETE LOCAL COM CACHE
// =========================================================
let rhgCatalogLocal = null;
let rhgCatalogLocalAt = 0;
let rhgCatalogPending = null;
const RHG_CATALOG_LOCAL_TTL = 5 * 60 * 1000;

function rhgNorm(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.,/ -]/g, ' ').replace(/(\d)[,.](\d)/g, '$1$2').replace(/\s+/g, ' ').trim();
}
function rhgCatalogName(item, type) {
  return type === 'material' ? (item['Material'] || '') : (item['Nome do Serviço'] || item['Serviço'] || '');
}
function rhgCatalogPrice(item, type) {
  return type === 'material' ? Number(item['Preço Unitário'] || item['Último Preço'] || item['Preço Médio'] || 0) : Number(item['Preço Base'] || 0);
}
function rhgCatalogPriceType(item, type) {
  return String(type === 'material' ? (item['Tipo de Preço'] || '') : (item['Tipo de Preço Base'] || ''));
}
async function rhgLoadCatalog(force = false) {
  if (!force && rhgCatalogLocal && Date.now() - rhgCatalogLocalAt < RHG_CATALOG_LOCAL_TTL) return rhgCatalogLocal;
  if (rhgCatalogPending) return rhgCatalogPending;
  rhgCatalogPending = fetch('/api/rhg/catalog' + (force ? '?refresh=1' : ''))
    .then(async response => {
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Falha ao carregar a Base RHG.');
      rhgCatalogLocal = {materials:data.materials || [], services:data.services || []};
      rhgCatalogLocalAt = Date.now();
      return rhgCatalogLocal;
    })
    .finally(() => { rhgCatalogPending = null; });
  return rhgCatalogPending;
}
function rhgCatalogScore(query, name) {
  const q = rhgNorm(query), n = rhgNorm(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 90;
  if (n.includes(q)) return 80;
  const tokens = q.split(' ').filter(Boolean);
  const matched = tokens.filter(token => n.includes(token)).length;
  if (!matched) return 0;
  return Math.round((matched / tokens.length) * 70) + (matched === tokens.length ? 10 : 0);
}
function rhgCatalogPriceLabel(item, type) {
  const price = rhgCatalogPrice(item, type);
  const priceType = rhgCatalogPriceType(item, type).toUpperCase();
  if (!price || price <= 0) return 'Sem preço atual';
  if (priceType.includes('HISTÓR') || (type === 'material' && !Number(item['Preço Unitário'] || 0))) return `Referência histórica: ${money(price)} (não aplicada)`;
  return `Preço de referência: ${money(price)}`;
}
function rhgHideAutocomplete(wrap) {
  const old = wrap.querySelector('.rhg-autocomplete');
  if (old) old.remove();
}
function rhgShowAutocomplete(input, type, items) {
  const wrap = input.closest('.desc-wrap');
  if (!wrap) return;
  rhgHideAutocomplete(wrap);
  const panel = document.createElement('div');
  panel.className = 'rhg-autocomplete';
  const matches = items.map(item => ({item,score:rhgCatalogScore(input.value,rhgCatalogName(item,type))}))
    .filter(x => x.score > 0 && String(x.item['Ativo'] ?? 'Sim').toLowerCase() !== 'não')
    .sort((a,b) => b.score-a.score).slice(0,6);
  matches.forEach(({item}) => {
    const name = rhgCatalogName(item,type);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rhg-autocomplete-option';
    const title = document.createElement('strong'); title.textContent = name;
    const detail = document.createElement('small');
    const category = item['Categoria'] || 'Sem categoria';
    const unit = item['Unidade'] || item['Unidade de Cobrança'] || '';
    detail.textContent = `${category}${unit ? ' · ' + unit : ''} · ${rhgCatalogPriceLabel(item,type)}`;
    button.append(title,detail);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => {
      input.value = name;
      const row = input.closest('.row');
      const unitInput = row?.querySelector('.unit');
      const price = rhgCatalogPrice(item,type);
      const historical = rhgCatalogPriceType(item,type).toUpperCase().includes('HISTÓR') || (type === 'material' && !Number(item['Preço Unitário'] || 0));
      if (unitInput && price > 0 && !historical) unitInput.value = price;
      const source = row?.querySelector('.source');
      if (source) {
        source.textContent = historical ? 'BASE RHG · REFERÊNCIA HISTÓRICA (preço não aplicado)' : (price > 0 ? 'BASE RHG · preço de referência' : 'BASE RHG · sem preço atual');
        source.dataset.source = historical ? 'historical' : 'base';
      }
      rhgHideAutocomplete(wrap);
      calc();
    });
    panel.appendChild(button);
  });
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'rhg-autocomplete-add';
  add.textContent = matches.length ? '+ Cadastrar novo registro na Base RHG' : 'Nenhum resultado. + Cadastrar novo na Base RHG';
  add.addEventListener('mousedown', event => event.preventDefault());
  add.addEventListener('click', () => rhgRegisterCatalogItem(type,input));
  panel.appendChild(add);
  wrap.appendChild(panel);
}
async function rhgRegisterCatalogItem(type, input) {
  const suggested = input.value.trim();
  if (!suggested) { alert('Digite o nome do item antes de cadastrar.'); return; }
  const name = prompt(type === 'material' ? 'Nome do novo material:' : 'Nome do novo serviço:', suggested);
  if (name === null || !name.trim()) return;
  try {
    const catalog = await rhgLoadCatalog(true);
    const source = type === 'material' ? catalog.materials : catalog.services;
    const duplicate = source.find(item => rhgNorm(rhgCatalogName(item,type)) === rhgNorm(name) || rhgCatalogScore(name,rhgCatalogName(item,type)) >= 78);
    if (duplicate) {
      alert('Já existe um registro com esse nome na Base RHG. Selecione a sugestão existente.');
      input.value = rhgCatalogName(duplicate,type);
      return;
    }
    const category = prompt('Categoria (opcional):','');
    if (category === null) return;
    const unit = prompt('Unidade (ex.: un, m, ponto, hora):', type === 'material' ? 'un' : 'serviço');
    if (unit === null) return;
    const now = new Date().toISOString();
    const id = (type === 'material' ? 'MAT-' : 'SER-') + Date.now();
    const data = type === 'material' ? {
      'ID Material':id,'Material':name.trim(),'Categoria':category.trim(),'Unidade':unit.trim(),
      'Preço Unitário':'','Ativo':'Sim','Tipo de Preço':'SEM_PREÇO','Origem do Preço':'CADASTRO_MANUAL',
      'Observações':'Cadastro realizado pelo RHG-App 2.0; preço ainda não informado.'
    } : {
      'ID Serviço':id,'Nome do Serviço':name.trim(),'Categoria':category.trim(),'Descrição':'',
      'Unidade de Cobrança':unit.trim(),'Materiais Associados':'','Perfil de Cliente':'',
      'Preço Base':'','Ativo':'Sim','Tipo de Preço Base':'SEM_PREÇO','Origem do Preço Base':'CADASTRO_MANUAL',
      'Observações':'Cadastro realizado pelo RHG-App 2.0; preço ainda não informado.'
    };
    if (!confirm(`Confirmar o cadastro de "${name.trim()}" na Base RHG?`)) return;
    const response = await fetch('/api/rhg/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'append',sheet:type==='material'?'MATERIAIS':'SERVIÇOS',data})});
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error || 'Não foi possível cadastrar.');
    rhgCatalogLocal = null;
    await rhgLoadCatalog(true);
    input.value = name.trim();
    const sourceLabel = input.closest('.row')?.querySelector('.source');
    if (sourceLabel) { sourceLabel.textContent='NOVO CADASTRO · sem preço'; sourceLabel.dataset.source='suggestion'; }
    rhgHideAutocomplete(input.closest('.desc-wrap'));
    alert('Registro cadastrado na Base RHG. Ele já está disponível para novas buscas.');
  } catch (error) { alert('Erro ao cadastrar: ' + error.message); }
}
function rhgAttachAutocomplete(row,type) {
  const input = row.querySelector('.desc');
  if (!input || input.dataset.rhgAutocomplete === '1') return;
  input.dataset.rhgAutocomplete = '1';
  let timer = null;
  input.addEventListener('focus', async () => {
    try { const catalog=await rhgLoadCatalog(); const items=type==='material'?catalog.materials:catalog.services; if(input.value.trim()) rhgShowAutocomplete(input,type,items); }
    catch(error) { console.warn('Autocomplete RHG:',error.message); }
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query=input.value.trim();
      if (query.length < 2) { rhgHideAutocomplete(input.closest('.desc-wrap')); return; }
      try { const catalog=await rhgLoadCatalog(); rhgShowAutocomplete(input,type,type==='material'?catalog.materials:catalog.services); }
      catch(error) { console.warn('Autocomplete RHG:',error.message); }
    },180);
  });
  input.addEventListener('blur', () => setTimeout(() => rhgHideAutocomplete(input.closest('.desc-wrap')),180));
}
function rhgSetupQuoteAutocomplete() {
  document.querySelectorAll('.service-grid.row').forEach(row=>rhgAttachAutocomplete(row,'service'));
  document.querySelectorAll('.material-grid.row').forEach(row=>rhgAttachAutocomplete(row,'material'));
}
rhgSetupQuoteAutocomplete();
