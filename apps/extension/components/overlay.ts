import { captureTitle, measureElement, pageInfo, patternName } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import { normalizeAnalysis, type Analysis, type CaptureRecord, type Claim, type Facts, type PageInfo, type StoredImage } from '@pixelpeeper/schema';
import css from './overlay.css?inline';
import { snapToComponent } from './grouping';
import { errorCard, lessonTab, measurementsTab, noKeyCard, placeWindow, progress, rulesTab, tabs, type LessonError, type Tab } from './lesson';

/** Ideas and Recent captures come from the library database in the background worker. */
type Saved = CaptureRecord;
type Image = { base64: string; mediaType: 'image/png' };
type Thumb = StoredImage;
type Images = { thumb: Thumb | null; full: Thumb | null };
/** Messages go to the background worker, which holds the API key; the key never enters this script. */
async function ask<T>(msg: object): Promise<T | undefined> { try { return await chrome.runtime.sendMessage(msg) as T; } catch { return undefined; } }
/** Wait for a repaint; background tabs never fire rAF, so fall back to a timer. */
const frame = () => Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 120))]);
const esc = (value: unknown) => String(value ?? 'Unavailable').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** UI scaffold. Capture/model integration is deliberately separate from measurements. */
export function createOverlay() {
  const host = document.createElement('pixel-peeper-overlay');
  host.style.cssText = 'all:initial;font:14px/1.5 system-ui;color:#252523;color-scheme:light;display:none;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:layout style';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>${css}</style><div class="box hover"><span class="tag"></span></div><div class="box selected"><span class="tag"></span></div>
    <div class="toolbar" hidden><button class="primary" data-action="scan">Scan selection</button><button data-action="parent">Parent</button><button data-action="child">Child</button><button data-action="clear">Clear</button></div>
    <div class="hint" hidden>Hover to preview · Click to select · Hold ⌥ Option for the exact element · Esc to exit</div><div class="scan" hidden aria-hidden="true"><div class="pixels">${Array.from({length:12},(_,i)=>`<i style="left:${8+i*17%84}%;top:${12+i*23%76}%"></i>`).join('')}</div><div class="beam"></div></div><div class="scan-label" hidden role="status"></div>
    <section class="window" hidden aria-label="Pixel Peeper workspace"><header class="head"><span class="handle">Pixel Peeper</span><button data-action="hide">Hide</button></header><div class="body"></div><footer class="foot"></footer></section>
    <div class="launcher"><button class="mascot" aria-label="Open Pixel Peeper controls" aria-expanded="false" aria-controls="menu"><span class="sprite" aria-hidden="true"></span></button><nav class="dock" id="menu" aria-label="Pixel Peeper controls"><button class="primary" data-action="pick">Pick element</button><button data-action="page">Pick whole page</button><button data-action="saved">Saved</button><button data-action="resume">Resume</button></nav></div><div class="feedback" role="status" aria-live="polite" hidden></div>`;
  // Keep the mascot first in keyboard order; place it last visually.
  const q = <T extends HTMLElement = HTMLElement>(s:string) => root.querySelector<T>(s)!;
  q('.mascot').style.order = '2'; q('.dock').style.order = '1';
  q('.sprite').style.backgroundImage = `url("${chrome.runtime.getURL('/detective-poses.png')}")`;
  document.documentElement.append(host); host.hidden = true;
  let active=false,picking=false,selected:Element|null=null,facts:Facts|null=null,scope:'element'|'page'='element';
  let analysis:Analysis|null=null,lessonError:LessonError|null=null,lastImage:Image|null=null,hasKey=false,interpreting=false,hovered:Element|null=null;
  let tab:Tab='lesson',step=0,stepStart=0,ticker:ReturnType<typeof setInterval>|undefined,userPlaced=false;
  /**
   * The current capture: `captureId` is its library record id. `capture`/`full` are its images, live
   * from the screenshot or loaded from the library (`imagesFor`). `currentSaved` mirrors the record.
   */
  let capture:Thumb|null=null,full:Thumb|null=null,imagesFor:string|null=null,captureId='',shotOpen=false,page:PageInfo|null=null,imagesStored=false,currentSaved=false;
  const bitmaps=new Map<string,Promise<ImageBitmap|null>>();
  let saved:Saved[]=[],compare:string[]=[],run=0,destroyed=false,phase:'idle'|'selected'|'scanning'|'result'='idle',suppressResult=false;
  let menuTimer:ReturnType<typeof setTimeout>,feedbackTimer:ReturnType<typeof setTimeout>,poseTimer:ReturnType<typeof setTimeout>;
  let format:'md'|'json'|'css'='md'; const sources:Record<string,number>={Typography:0,Color:0,Shape:0,Spacing:0};
  const abort = new AbortController(), signal = abort.signal;
  function notify(message:string){clearTimeout(feedbackTimer);q('.feedback').textContent=message;q('.feedback').hidden=false;feedbackTimer=setTimeout(()=>q('.feedback').hidden=true,2800);}
  function menu(open:boolean){clearTimeout(menuTimer);q('.launcher').classList.toggle('open',open);q('.mascot').setAttribute('aria-expanded',String(open));q('.mascot').setAttribute('aria-label',open?'Close Pixel Peeper controls':'Open Pixel Peeper controls');}
  function place(box:HTMLElement,el:Element|null,kind?:string|null){if(!el?.isConnected){box.style.display='none';return;}const r=el.getBoundingClientRect();Object.assign(box.style,{display:'block',left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});const tag=box.querySelector('.tag');if(tag)tag.textContent=`${el.tagName.toLowerCase()}${kind==='container'?' · group':''} · ${Math.round(r.width)}×${Math.round(r.height)}`;}
  /** Page scope means the visible viewport, never claimed as the full page. */
  const viewport=()=>({left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight});
  const bounds=()=>scope==='page'?viewport():selected!.getBoundingClientRect();
  function geometry(){if(!selected?.isConnected){place(q('.selected'),null);q('.toolbar').hidden=true;if(phase==='scanning')cancel();return;}if(scope==='page'){Object.assign(q('.selected').style,{display:'block',left:'2px',top:'2px',width:`${innerWidth-4}px`,height:`${innerHeight-4}px`});q('.selected .tag').textContent=`Visible page · ${innerWidth}×${innerHeight}`;}else place(q('.selected'),selected);const r=bounds();const x=Math.max(8,Math.min(r.left,innerWidth-320)),y=Math.max(8,Math.min(r.bottom+10,innerHeight-56));Object.assign(q('.toolbar').style,{left:`${x}px`,top:`${y}px`});const l=Math.max(0,r.left),t=Math.max(0,r.top),w=Math.max(0,Math.min(innerWidth,r.right)-l),h=Math.max(0,Math.min(innerHeight,r.bottom)-t);Object.assign(q('.scan').style,{left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`});q('.scan').style.setProperty('--travel',`${Math.max(0,h-4)}px`);Object.assign(q('.scan-label').style,{left:`${x}px`,top:`${y}px`});}
  function cancel(){run++;interpreting=false;clearInterval(ticker);q('.scan').hidden=true;q('.scan-label').hidden=true;if(phase==='scanning')phase=facts?'selected':'idle';}
  function pick(){cancel();picking=true;q('.hint').hidden=false;q('.window').hidden=true;q('.toolbar').hidden=true;menu(false);}
  function stopPick(){picking=false;q('.hint').hidden=true;place(q('.hover'),null);}
  function select(el:Element,wholePage=false){cancel();stopPick();selected=el;scope=wholePage?'page':'element';facts=null;analysis=null;lessonError=null;lastImage=null;tab='lesson';step=0;capture=null;full=null;imagesFor=null;shotOpen=false;page=null;imagesStored=false;currentSaved=false;phase='selected';q('.window').hidden=true;q('.toolbar').hidden=false;geometry();menu(false);}
  const own = (event:Event) => event.composedPath().includes(host);
  /** Snap to the enclosing component unless Option/Alt is held. */
  function target(e:MouseEvent){const t=document.elementFromPoint(e.clientX,e.clientY);if(!t||t===host)return null;return e.altKey?{el:t,reason:null}:snapToComponent(t);}
  document.addEventListener('mousemove',e=>{if(!picking||own(e))return;const hit=target(e);hovered=hit?.el??null;place(q('.hover'),hovered,hit?.reason);},{capture:true,signal});
  document.addEventListener('click',e=>{if(!active||own(e))return;menu(false);if(!picking)return;const el=target(e)?.el;if(!el)return;e.preventDefault();e.stopImmediatePropagation();select(el);},{capture:true,signal});
  document.addEventListener('keydown',e=>{if(!active)return;if(e.key==='Escape'){cancel();stopPick();menu(false);q('.window').hidden=true;q('.toolbar').hidden=true;q('.mascot').focus();}if(!own(e)&&phase==='selected'&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as Element)?.tagName)&&(e.key==='ArrowUp'||e.key==='ArrowDown')){const el=e.key==='ArrowUp'?selected?.parentElement:selected?.firstElementChild;if(el&&el!==host){e.preventDefault();select(el);}}},{capture:true,signal});
  q('.mascot').onclick=()=>menu(!q('.launcher').classList.contains('open'));
  q('.launcher').addEventListener('pointerenter',()=>clearTimeout(menuTimer),{signal});
  q('.launcher').addEventListener('pointerleave',()=>{menuTimer=setTimeout(()=>{if(!root.activeElement?.matches(':focus-visible'))menu(false);},300);},{signal});
  q('.launcher').addEventListener('focusout',()=>{menuTimer=setTimeout(()=>{if(!q('.launcher').contains(root.activeElement))menu(false);},150);},{signal});
  window.addEventListener('scroll',geometry,{capture:true,passive:true,signal});window.addEventListener('resize',()=>{drag=null;userPlaced=false;if(q('.window').classList.contains('wide'))Object.assign(q('.window').style,{left:'',top:'',right:'',bottom:'',maxHeight:''});else position();geometry();},{signal});
  /** Re-render the open window in place, keeping its scroll position. */
  function render(){if(suppressResult)return;const top=q('.window').hidden?0:q('.body').scrollTop;lesson();q('.body').scrollTop=top;}
  /** One-second ticker for the elapsed counter and rate-limit countdown. */
  function tick(){clearInterval(ticker);ticker=setInterval(()=>{const el=root.querySelector('.elapsed');if(el)el.textContent=`${Math.round((Date.now()-stepStart)/1000)}s`;if(lessonError?.retryAt){if(Date.now()>=lessonError.retryAt){lessonError={...lessonError,retryAt:undefined};render();}else{const cd=root.querySelector('.countdown');if(cd)cd.textContent=String(Math.ceil((lessonError.retryAt-Date.now())/1000));}}if(!interpreting&&!lessonError?.retryAt)clearInterval(ticker);},1000);}
  /** Open on the side away from the selection unless the user has moved the window. */
  function position(){if(userPlaced)return;const p=placeWindow(scope==='page'||!selected?.isConnected?null:selected.getBoundingClientRect(),innerWidth,innerHeight,400);Object.assign(q('.window').style,{left:`${p.left}px`,top:`${p.top}px`,right:'auto',bottom:'auto',maxHeight:`${p.maxHeight}px`});}
  async function scan(){if(!selected?.isConnected){notify('Selection is unavailable. Pick again.');return;}cancel();const version=run;captureId=crypto.randomUUID();page=pageInfo(document);capture=null;full=null;imagesFor=null;imagesStored=false;currentSaved=false;analysis=null;suppressResult=false;stopPick();phase='scanning';tab='lesson';step=0;lessonError=null;q('.toolbar').hidden=true;geometry();q('.scan').hidden=false;q('.scan-label').hidden=true;
    hasKey=!!(await ask<{hasKey:boolean}>({type:'pp:status'}))?.hasKey;if(version!==run||destroyed)return;
    position();render();
    await new Promise(resolve=>setTimeout(resolve,40));if(version!==run||destroyed)return;
    try{const snapshot=measureElement(selected);await new Promise(resolve=>setTimeout(resolve,hasKey?250:900));if(version!==run||destroyed)return;facts=snapshot;if(hasKey){await interpret(version);return;}finish();}catch{cancel();notify('Measurement failed. Pick another element to retry.');}}
  function finish(){phase='result';q('.scan').hidden=true;q('.scan-label').hidden=true;render();if(lessonError?.retryAt)tick();void persist();}
  /** The library record for the current capture. Titles stay auto until the user edits them. */
  function record():Saved|null{if(!facts||!page)return null;const pattern=patternName(facts,scope,analysis?.role?.title);return {id:captureId,createdAt:facts.capturedAt,updatedAt:new Date().toISOString(),scope,page,facts,analysis,pattern,title:captureTitle(pattern,page),titleSource:'auto',saved:false,savedAt:null,note:'',hasImage:!!capture||imagesStored};}
  /** Every finished capture lands in Recent; later lesson updates merge into the same record. */
  async function persist():Promise<Saved|null>{const rec=record();if(!rec)return null;const images:Images|undefined=!imagesStored&&capture?{thumb:capture,full}:undefined;
    const res=await ask<{record?:Saved}>({type:'pp:store:put',record:rec,images});if(!res?.record||res.record.id!==captureId)return res?.record??null;if(images)imagesStored=true;if(res.record.saved!==currentSaved){currentSaved=res.record.saved;render();}return res.record;}
  /** Capture (UI hidden so it is not in the screenshot), then ask the model. Retry reuses the same capture. */
  async function interpret(version:number){if(!facts)return;lessonError=null;phase='scanning';
    if(!lastImage){if(!selected?.isConnected){lessonError={code:'gone',message:'It changed or was removed from the page. Your measurements are kept; pick it again for a lesson.'};finish();return;}
      step=1;render();q('.scan').hidden=false;const r=bounds(),x=Math.max(0,r.left),y=Math.max(0,r.top),rect={x,y,width:Math.min(innerWidth,r.right)-x,height:Math.min(innerHeight,r.bottom)-y};
      let shot:{image?:Image;thumb?:Thumb;full?:Thumb;error?:string}|undefined;host.style.visibility='hidden';try{await frame();shot=await ask<{image?:Image;thumb?:Thumb;full?:Thumb;error?:string}>({type:'pp:capture',rect,dpr:devicePixelRatio});}finally{host.style.visibility='';}
      if(version!==run||destroyed)return;if(!shot?.image){lessonError={code:'capture',message:shot?.error??'The screenshot failed. Scroll the selection fully into view and retry.'};finish();return;}lastImage=shot.image;capture=shot.thumb??null;full=shot.full??null;}
    step=2;render();await frame();if(version!==run||destroyed)return;
    step=3;stepStart=Date.now();interpreting=true;q('.scan').hidden=true;render();tick();
    const res=await ask<{analysis?:unknown;error?:string;code?:string;retryAfter?:number}>({type:'pp:analyze',facts,scope,image:lastImage});if(version!==run||destroyed)return;
    interpreting=false;const a=normalizeAnalysis(res?.analysis);
    if(a)analysis=a;else lessonError={code:res?.code,message:res?.error??'The lesson did not arrive. Retry; your measurements are kept.',retryAt:res?.retryAfter?Date.now()+res.retryAfter*1000:undefined};
    finish();}
  function show(body:string,footer:string,wide=false){q('.body').innerHTML=body;q('.foot').innerHTML=footer;q('.window').classList.toggle('wide',wide);if(wide)Object.assign(q('.window').style,{left:'',top:'',right:'',bottom:'',maxHeight:''});q('.window').hidden=false;menu(false);void hydrate();}
  /** Draw thumbnails with canvas: unlike <img>, it is not blocked by a page's image CSP. */
  function bitmap(id:string,t:Thumb){if(!bitmaps.has(id))bitmaps.set(id,typeof createImageBitmap==='function'?createImageBitmap(new Blob([Uint8Array.from(atob(t.base64),c=>c.charCodeAt(0))],{type:t.mediaType})).catch(()=>null):Promise.resolve(null));return bitmaps.get(id)!;}
  async function draw(canvas:HTMLCanvasElement,id:string,t:Thumb){const b=await bitmap(id,t);if(!b||!canvas.isConnected)return;canvas.width=b.width;canvas.height=b.height;canvas.getContext('2d')?.drawImage(b,0,0);canvas.classList.add('ready');}
  async function hydrate(){const cur=root.querySelector<HTMLCanvasElement>('canvas[data-thumb="current"]');
    if(cur){if(!capture&&imagesFor){const id=imagesFor;const res=await ask<{images?:Record<string,Images>}>({type:'pp:store:images',ids:[id]});if(imagesFor===id){capture=res?.images?.[id]?.thumb??null;full=res?.images?.[id]?.full??null;}}if(capture)void draw(cur,captureId,capture);else cur.closest('.shot')?.remove();}
    const libs=[...root.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb-key]')];if(!libs.length)return;const res=await ask<{images?:Record<string,Images>}>({type:'pp:store:images',ids:libs.map(c=>c.dataset.thumbKey!)});
    libs.forEach(c=>{const t=res?.images?.[c.dataset.thumbKey!]?.thumb;if(t)void draw(c,c.dataset.thumbKey!,t);else c.remove();});}
  const short=(t:string,n=48)=>t.length>n?`${t.slice(0,n-1)}…`:t;
  function lesson(){
    if(!facts&&phase!=='scanning'){show('<h2>Every website has something to teach you.</h2><p>Pick a detail. Scan its real styles. Save what you learn.</p>','<button class="primary" data-action="pick">Pick an element</button>');return;}
    const f=facts,results=f?evaluate(f,{scope}):[];
    const name=f?short(patternName(f,scope,analysis?.role?.title)):scope==='page'?'Visible page':(selected?.tagName.toLowerCase()??'Selection');
    const where=page?`${esc(page.siteName)} · ${esc(page.pageName)}`:f?esc(new URL(f.url).hostname):'';
    const meta=f?`${where} · ${scope==='page'?'visible page':`&lt;${esc(f.structure.tag.value)}&gt;`} · ${esc(new Date(f.capturedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}`:'Measuring…';
    let body:string;
    if(tab==='rules'&&f)body=rulesTab(results,scope);
    else if(tab==='measurements'&&f)body=measurementsTab(f,scope);
    else if(analysis&&f)body=lessonTab(analysis,f,results);
    else if(lessonError)body=errorCard(lessonError,Date.now());
    else if(phase==='scanning')body=progress(step,Math.round((Date.now()-stepStart)/1000),hasKey);
    else if(!hasKey)body=noKeyCard();
    else body='<div class="err info"><strong>No lesson saved with this idea</strong><p>Pick the element again on its page to get a lesson.</p><div class="row"><button data-action="pick">Pick an element</button></div></div>';
    const thumb=capture||imagesFor?`<button class="shot" data-action="toggle-shot" aria-expanded="${shotOpen}" aria-label="${shotOpen?'Collapse':'Expand'} the captured screenshot" title="What was analysed"><canvas data-thumb="current"></canvas></button>`:'';
    show(`<header class="lesson-head${shotOpen?' expanded':''}"><div class="title"><h2>${esc(name)}</h2><p class="muted">${meta}</p></div>${thumb}</header>${tabs(tab,results,!!f)}<div class="panel" role="tabpanel">${body}</div>`,
      f?`<button data-action="pick">Pick another</button><button data-action="export">Export</button>${currentSaved?'<button class="saved-state" data-action="saved" title="Open saved ideas">✓ Saved</button>':'<button class="primary" data-action="save">Save idea</button>'}`:'<button data-action="cancel">Cancel</button>');}
  async function save(){if(!facts)return;if(currentSaved){notify('Already in your saved ideas.');return;}
    const stored=await persist();const res=stored?await ask<{record?:Saved|null}>({type:'pp:store:save',id:captureId}):undefined;
    if(!res?.record){notify('Could not save. Your measurements are still available to export.');return;}
    currentSaved=true;render();clearTimeout(poseTimer);q('.launcher').classList.add('collected');notify('Idea spotted. Source credited. Saved!');poseTimer=setTimeout(()=>q('.launcher').classList.remove('collected'),2800);}
  const day=(iso:string)=>new Date(iso).toLocaleDateString([], {month:'short',day:'numeric'});
  const row=(i:Saved,idea:boolean)=>`<div class="saved-item">${idea?`<input type="checkbox" aria-label="Compare ${esc(i.title)}" data-compare="${esc(i.id)}" ${compare.includes(i.id)?'checked':''}>`:''}${i.hasImage?`<canvas class="lib-thumb" data-thumb-key="${esc(i.id)}" aria-hidden="true"></canvas>`:'<span class="lib-thumb empty" aria-hidden="true"></span>'}<button class="open" data-open="${esc(i.id)}"><strong>${esc(i.pattern)}</strong><span class="muted">${esc(i.page.siteName)} · ${esc(i.page.pageName)} · ${day(i.savedAt??i.updatedAt)}</span></button>${idea?'':`<button class="small" data-keep="${esc(i.id)}">Save</button>`}<button class="small del" data-delete="${esc(i.id)}" aria-label="Delete ${esc(i.title)}">Delete</button></div>`;
  /** Fetch Ideas and Recent from the library, then render. */
  async function library(){const res=await ask<{records?:Saved[]}>({type:'pp:store:list'});if(destroyed)return;saved=(res?.records??[]).map(r=>({...r,analysis:normalizeAnalysis(r.analysis)}));renderLibrary();}
  function renderLibrary(){compare=compare.filter(id=>saved.some(i=>i.id===id&&i.saved));const ideas=saved.filter(i=>i.saved),recent=saved.filter(i=>!i.saved);
    show(`<h2>Library</h2><h4 class="lib-h">Ideas <span class="muted">${ideas.length}</span></h4>${ideas.length?ideas.map(i=>row(i,true)).join(''):'<p class="muted">Your first idea starts with a selection. Save a lesson to keep it here.</p>'}${recent.length?`<h4 class="lib-h">Recent <span class="muted">not saved · kept 7 days</span></h4>${recent.map(i=>row(i,false)).join('')}`:''}`,'<button data-action="pick">Pick an element</button><button class="primary" data-action="compare" '+(compare.length<2?'disabled':'')+'>Compare ('+compare.length+'/3)</button>');}
  /** Open a library record in the lesson panel, detached from the live page. */
  function openRecord(item:Saved){cancel();phase='result';selected=null;place(q('.selected'),null);q('.toolbar').hidden=true;facts=item.facts;scope=item.scope;analysis=item.analysis??null;page=item.page;captureId=item.id;lessonError=null;lastImage=null;tab='lesson';capture=null;full=null;imagesFor=item.hasImage?item.id:null;imagesStored=true;currentSaved=item.saved;shotOpen=false;lesson();}
  function chosen(){return saved.filter(i=>compare.includes(i.id));}
  function values(items:Saved[]){const get=(category:string)=>items[Math.min(sources[category]||0,items.length-1)].facts;return {font:get('Typography').typography,color:get('Color').color,radius:get('Shape').shape.borderRadius.value,padding:get('Spacing').spacing.padding.value};}
  function output(items:Saved[]){const t=values(items);const provenance=items.map(i=>({url:i.facts.url,selector:i.facts.selector,capturedAt:i.facts.capturedAt}));if(format==='json')return JSON.stringify({label:'Measured',sources:provenance,borrowedFrom:sources,tokens:{fontFamily:t.font.fontFamily.value,fontSize:t.font.fontSize.value,color:t.color.text.value,background:t.color.background.value,radius:t.radius,padding:t.padding},inferred:items.filter(i=>i.analysis).map(i=>({label:'Inferred',source:i.facts.url,model:i.analysis!.modelInfo.model,headline:i.analysis!.headline?.text??null,claims:inferredClaims(i.analysis!).map(c=>({title:c.title??null,text:c.text,evidence:c.evidence}))}))},null,2);if(format==='css')return `/* Measured values. Sources: ${provenance.map(i=>i.url.replace(/\*\//g,'')).join(', ')} */\n:root {\n --font-family: ${t.font.fontFamily.value};\n --font-size: ${t.font.fontSize.value}px;\n --color-text: ${t.color.text.value};\n --color-background: ${t.color.background.value};\n --radius: ${t.radius.map(v=>v+'px').join(' ')};\n --padding: ${t.padding.map(v=>v+'px').join(' ')};\n}`;return `# Design direction\n\n## Measured\n- Font: ${t.font.fontFamily.value}, ${t.font.fontSize.value}px\n- Color: ${t.color.text.value} on ${t.color.background.value}\n- Radius: ${t.radius.join(' ')}px\n- Padding: ${t.padding.join(' ')}px\n\n## Sources\n${provenance.map(i=>`- ${i.url} · ${i.selector} · ${i.capturedAt}`).join('\n')}\n\n## Inferred\n${items.some(i=>i.analysis)?items.filter(i=>i.analysis).map(i=>`### ${i.title}\n${inferredClaims(i.analysis!).map(c=>`- ${c.title?`**${c.title}:** `:''}${c.text}`).join('\n')}`).join('\n\n'):'No AI interpretation for these sources.'}\n`;}
  function inferredClaims(a:Analysis){return [a.headline,a.role,a.technique,...a.works,...a.watch,a.tradeoff,...a.steal,...a.laws].filter((c):c is Claim=>!!c);}
  let exportItems:Saved[]=[];
  function direction(items:Saved[]){if(!items.length)return;exportItems=items;const groups=['Typography','Color','Shape','Spacing'];show(`<h2>${items.length>1?'Compare & borrow':'Design direction'}</h2>${items.length>1?`<table><thead><tr><th>Measured</th>${items.map((i,n)=>`<th>${'ABC'[n]} · ${esc(i.pattern)}</th>`).join('')}</tr></thead><tbody>${[['Font size',(f:Facts)=>f.typography.fontSize.value+'px'],['Color',(f:Facts)=>f.color.text.value],['Radius',(f:Facts)=>f.shape.borderRadius.value.join(' ')+'px']].map(([title,get])=>`<tr><th>${title}</th>${items.map(i=>`<td>${esc((get as (f:Facts)=>string)(i.facts))}</td>`).join('')}</tr>`).join('')}</tbody></table><h3>What to borrow</h3>${groups.map(g=>`<fieldset><legend>${g}</legend>${items.map((_,n)=>`<label><input type="radio" name="${g}" value="${n}" ${Math.min(sources[g]||0,items.length-1)===n?'checked':''}>${'ABC'[n]}</label>`).join('')}</fieldset>`).join('')}`:''}<div class="formats">${(['md','json','css'] as const).map(f=>`<button data-format="${f}" class="${format===f?'active':''}">${{md:'DESIGN.md',json:'tokens.json',css:'CSS'}[f]}</button>`).join('')}</div><pre>${esc(output(items))}</pre>`,'<button data-action="saved">Saved</button><button class="primary" data-action="download">Download</button><button data-action="pick">Pick another</button>',items.length>1);}
  root.addEventListener('change',e=>{const input=e.target as HTMLInputElement;if(input.dataset.compare){if(input.checked&&compare.length>=3){input.checked=false;notify('Compare up to three ideas.');return;}compare=input.checked?[...compare,input.dataset.compare]:compare.filter(id=>id!==input.dataset.compare);renderLibrary();}else if(input.type==='radio'){sources[input.name]=Number(input.value);direction(exportItems);}}, {signal});
  root.addEventListener('click',e=>{const target=(e.target as Element).closest<HTMLElement>('button');if(!target)return;const action=target.dataset.action;if(target.dataset.tab){tab=target.dataset.tab as Tab;q('.body').scrollTop=0;lesson();return;}if(target.dataset.open){const item=saved.find(i=>i.id===target.dataset.open);if(item)openRecord(item);return;}
    if(target.dataset.delete){const id=target.dataset.delete;void ask({type:'pp:store:delete',id}).then(()=>{saved=saved.filter(i=>i.id!==id);if(captureId===id){currentSaved=false;imagesStored=false;}renderLibrary();notify('Deleted.');});return;}
    if(target.dataset.keep){const id=target.dataset.keep;void ask<{record?:Saved|null}>({type:'pp:store:save',id}).then(res=>{if(res?.record){saved=saved.map(i=>i.id===id?res.record!:i);if(captureId===id)currentSaved=true;renderLibrary();notify('Saved to your ideas.');}});return;}if(target.dataset.format){format=target.dataset.format as typeof format;direction(exportItems);return;}switch(action){case'pick':pick();break;case'page':select(document.documentElement,true);q('.toolbar').hidden=true;void scan();break;case'scan':void scan();break;case'parent':if(selected?.parentElement)select(selected.parentElement);break;case'child':if(selected?.firstElementChild)select(selected.firstElementChild);break;case'clear':cancel();selected=null;facts=null;stopPick();place(q('.selected'),null);q('.toolbar').hidden=true;break;case'hide':suppressResult=true;q('.window').hidden=true;break;case'resume':if(phase==='scanning'){suppressResult=false;show('<h2>Reading computed styles</h2><p class="muted">Your selected element is being measured.</p>','<button data-action="hide">Hide</button>');}else lesson();break;case'saved':if(phase==='scanning')suppressResult=true;void library();break;case'save':void save();break;case'compare':if(compare.length>=2)direction(chosen());break;case'export':{const rec=record();if(rec)direction([rec]);break;}case'retry':if(facts&&phase!=='scanning'){cancel();void interpret(run);}break;case'toggle-shot':shotOpen=!shotOpen;render();break;case'cancel':cancel();phase=facts?'result':'idle';q('.window').hidden=true;break;case'settings':void ask({type:'pp:open-options'});break;case'download':{const blob=new Blob([output(exportItems)],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download={md:'DESIGN.md',json:'tokens.json',css:'variables.css'}[format];a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}}},{signal});
  let drag:{x:number;y:number;left:number;top:number}|null=null;
  q('.handle').addEventListener('pointerdown',e=>{userPlaced=true;const r=q('.window').getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};q('.handle').setPointerCapture(e.pointerId);},{signal});
  q('.handle').addEventListener('pointermove',e=>{if(!drag)return;Object.assign(q('.window').style,{left:`${Math.max(8,Math.min(innerWidth-q('.window').offsetWidth-8,drag.left+e.clientX-drag.x))}px`,top:`${Math.max(8,Math.min(innerHeight-q('.window').offsetHeight-8,drag.top+e.clientY-drag.y))}px`,right:'auto',bottom:'auto'});},{signal});
  q('.handle').addEventListener('pointerup',()=>drag=null,{signal});
  return {activate(){active=true;host.hidden=false;host.style.display='block';},pick(){active=true;host.hidden=false;host.style.display='block';pick();},deactivate(){active=false;cancel();stopPick();host.hidden=true;host.style.display='none';},destroy(){destroyed=true;cancel();clearInterval(ticker);abort.abort();clearTimeout(menuTimer);clearTimeout(feedbackTimer);clearTimeout(poseTimer);host.remove();}};
}
