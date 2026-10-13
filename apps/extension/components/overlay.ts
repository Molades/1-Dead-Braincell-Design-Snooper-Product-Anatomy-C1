import { captureTitle, measureElement, measureLayout, pageInfo, patternName } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import { normalizeAnalysis, type Analysis, type Annotations, type CaptureRecord, type Facts, type PageInfo, type StoredImage } from '@pixelpeeper/schema';
import css from './overlay.css?inline';
import viewerCss from './viewer.css?inline';
import { DEFAULT_LAYERS, viewerHTML, wireViewer, type Layer } from './viewer';
import { ancestry, elementLabel, levelDown, levelUp, snapToComponent } from './grouping';
import { exportText, FILE_NAMES, FORMAT_LABELS, type Format } from './direction';
import { errorCard, lessonTab, measurementsTab, noKeyCard, placeWindow, progress, rulesTab, tabs, type LessonError, type Tab } from './lesson';

/** Ideas and Recent captures come from the library database in the background worker. */
type Saved = CaptureRecord;
type Image = { base64: string; mediaType: 'image/png' };
type Thumb = StoredImage;
type Images = { thumb: Thumb | null; full: Thumb | null };
/** Messages go to the background worker, which holds the API key; the key never enters this script. */
let onStale = () => {};
async function ask<T>(msg: object): Promise<T | undefined> {
  // After an extension update this page keeps the old script, which can no longer reach the extension.
  if (!chrome.runtime?.id) { onStale(); return undefined; }
  try { return await chrome.runtime.sendMessage(msg) as T; } catch { return undefined; }
}
/** Wait for a repaint; background tabs never fire rAF, so fall back to a timer. */
const frame = () => Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 120))]);
const esc = (value: unknown) => String(value ?? 'Unavailable').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** UI scaffold. Capture/model integration is deliberately separate from measurements. */
export function createOverlay() {
  // A re-injected script (after an update) replaces any overlay left by the previous one.
  document.querySelectorAll('pixel-peeper-overlay').forEach((old) => old.remove());
  const host = document.createElement('pixel-peeper-overlay');
  host.style.cssText = 'all:initial;font:14px/1.5 system-ui;color:#252523;color-scheme:light;display:none;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:layout style';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>${css}${viewerCss}</style><div class="box hover"><span class="tag"></span></div><div class="box selected"><span class="tag"></span></div>
    <div class="toolbar" role="toolbar" aria-label="Selection" hidden></div>
    <div class="hint" hidden>Hover to preview · Click to select · <kbd>↑</kbd><kbd>↓</kbd> bigger / smaller · hold <kbd>⌥</kbd> for the exact element · <kbd>Esc</kbd> to exit</div><div class="scan" hidden aria-hidden="true"><div class="pixels">${Array.from({length:12},(_,i)=>`<i style="left:${8+i*17%84}%;top:${12+i*23%76}%"></i>`).join('')}</div><div class="beam"></div></div><div class="scan-label" hidden role="status"></div>
    <section class="window" hidden aria-label="Pixel Peeper workspace"><header class="head"><span class="handle">Pixel Peeper</span><button data-action="hide">Hide</button></header><div class="body"></div><footer class="foot"></footer></section>
    <div class="launcher"><button class="mascot" aria-label="Open Pixel Peeper controls" aria-expanded="false" aria-controls="menu"><span class="sprite" aria-hidden="true"></span><span class="site-count" aria-hidden="true" hidden></span></button><nav class="dock" id="menu" aria-label="Pixel Peeper controls"><button class="primary" data-action="pick">Pick element</button><button data-action="page">Pick whole page</button><button data-action="library">Library</button><button data-action="resume">Last lesson</button><button class="site-ideas" data-action="site-ideas" hidden></button></nav></div><div class="feedback" role="status" aria-live="polite" hidden></div>`;
  // Keep the mascot first in keyboard order; place it last visually.
  const q = <T extends HTMLElement = HTMLElement>(s:string) => root.querySelector<T>(s)!;
  q('.mascot').style.order = '2'; q('.dock').style.order = '1';
  q('.sprite').style.backgroundImage = `url("${chrome.runtime.getURL('/detective-poses.png')}")`;
  document.documentElement.append(host); host.hidden = true;
  let active=false,picking=false,selected:Element|null=null,facts:Facts|null=null,scope:'element'|'page'='element';
  let analysis:Analysis|null=null,lessonError:LessonError|null=null,lastImage:Image|null=null,hasKey=false,interpreting=false,hovered:Element|null=null;
  let annotations:Annotations|null=null,viewerLayers:Layer[]=[...DEFAULT_LAYERS],viewerActual=false,closeViewer:(()=>void)|null=null;
  let rawTarget:Element|null=null,selectedRaw:Element|null=null,crumbs:Element[]=[],siteIdeas=0;
  let tab:Tab='lesson',step=0,stepStart=0,ticker:ReturnType<typeof setInterval>|undefined,userPlaced=false;
  /**
   * The current capture: `captureId` is its library record id. `capture`/`full` are its images, live
   * from the screenshot or loaded from the library (`imagesFor`). `currentSaved` mirrors the record.
   */
  let capture:Thumb|null=null,full:Thumb|null=null,imagesFor:string|null=null,captureId='',shotOpen=false,page:PageInfo|null=null,imagesStored=false,currentSaved=false;
  const bitmaps=new Map<string,Promise<ImageBitmap|null>>();
  let run=0,destroyed=false,phase:'idle'|'selected'|'scanning'|'result'='idle',suppressResult=false;
  let menuTimer:ReturnType<typeof setTimeout>,feedbackTimer:ReturnType<typeof setTimeout>,poseTimer:ReturnType<typeof setTimeout>;
  let format:Format='md';
  const abort = new AbortController(), signal = abort.signal;
  function notify(message:string){clearTimeout(feedbackTimer);q('.feedback').textContent=message;q('.feedback').hidden=false;feedbackTimer=setTimeout(()=>q('.feedback').hidden=true,2800);}
  function menu(open:boolean){clearTimeout(menuTimer);q('.launcher').classList.toggle('open',open);q('.mascot').setAttribute('aria-expanded',String(open));q('.mascot').setAttribute('aria-label',open?'Close Pixel Peeper controls':'Open Pixel Peeper controls');}
  function place(box:HTMLElement,el:Element|null){if(!el?.isConnected){box.style.display='none';return;}const r=el.getBoundingClientRect();Object.assign(box.style,{display:'block',left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});const tag=box.querySelector('.tag');if(tag)tag.textContent=`${elementLabel(el)} · ${Math.round(r.width)}×${Math.round(r.height)}`;}
  /** Page scope means the visible viewport, never claimed as the full page. */
  const viewport=()=>({left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight});
  const bounds=()=>scope==='page'?viewport():selected!.getBoundingClientRect();
  function geometry(){if(!selected?.isConnected){place(q('.selected'),null);q('.toolbar').hidden=true;if(phase==='scanning')cancel();return;}if(scope==='page'){Object.assign(q('.selected').style,{display:'block',left:'2px',top:'2px',width:`${innerWidth-4}px`,height:`${innerHeight-4}px`});q('.selected .tag').textContent=`Visible page · ${innerWidth}×${innerHeight}`;}else place(q('.selected'),selected);const r=bounds();const x=Math.max(8,Math.min(r.left,innerWidth-320)),y=Math.max(8,Math.min(r.bottom+10,innerHeight-56));Object.assign(q('.toolbar').style,{left:`${x}px`,top:`${y}px`});const l=Math.max(0,r.left),t=Math.max(0,r.top),w=Math.max(0,Math.min(innerWidth,r.right)-l),h=Math.max(0,Math.min(innerHeight,r.bottom)-t);Object.assign(q('.scan').style,{left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`});q('.scan').style.setProperty('--travel',`${Math.max(0,h-4)}px`);Object.assign(q('.scan-label').style,{left:`${x}px`,top:`${y}px`});}
  function cancel(){run++;interpreting=false;clearInterval(ticker);q('.scan').hidden=true;q('.scan-label').hidden=true;if(phase==='scanning')phase=facts?'selected':'idle';}
  function pick(){cancel();picking=true;q('.hint').hidden=false;q('.window').hidden=true;q('.toolbar').hidden=true;menu(false);}
  function stopPick(){picking=false;q('.hint').hidden=true;place(q('.hover'),null);}
  function select(el:Element,wholePage=false,raw:Element|null=selectedRaw){cancel();stopPick();selected=el;selectedRaw=raw;scope=wholePage?'page':'element';facts=null;analysis=null;lessonError=null;lastImage=null;tab='lesson';step=0;capture=null;full=null;imagesFor=null;shotOpen=false;page=null;imagesStored=false;currentSaved=false;annotations=null;phase='selected';q('.window').hidden=true;toolbar();q('.toolbar').hidden=false;geometry();menu(false);q<HTMLButtonElement>('.toolbar .primary').focus({preventScroll:true});}
  /** Get lesson, then where you are (breadcrumb), then how to change it. Nothing is sent before Get lesson. */
  function toolbar(){if(!selected)return;crumbs=scope==='page'?[]:ancestry(selected);const up=scope!=='page'&&!!levelUp(selected),down=scope!=='page'&&!!levelDown(selected,selectedRaw);
    q('.toolbar').innerHTML=`<button class="primary" data-action="scan">Get lesson <kbd>↵</kbd></button>${crumbs.length?`<nav class="crumbs" aria-label="Selection level">${crumbs.map((el,i)=>`<button data-crumb="${i}" ${el===selected?'aria-current="true"':''}>${esc(elementLabel(el))}</button>`).join('<span aria-hidden="true">›</span>')}</nav>`:''}<button data-action="bigger" title="Bigger (↑)" aria-label="Select the container (bigger)" ${up?'':'disabled'}>↑</button><button data-action="smaller" title="Smaller (↓)" aria-label="Select inside (smaller)" ${down?'':'disabled'}>↓</button><button data-action="pick" title="Pick something else">Pick again</button>`;}
  function bigger(){const el=selected&&levelUp(selected);if(el)select(el);}
  function smaller(){const el=selected&&levelDown(selected,selectedRaw);if(el)select(el);}
  const own = (event:Event) => event.composedPath().includes(host);
  /** Snap to the enclosing component unless Option/Alt is held. */
  function target(e:MouseEvent){const t=document.elementFromPoint(e.clientX,e.clientY);if(!t||t===host)return null;return e.altKey?{el:t,reason:null}:snapToComponent(t);}
  document.addEventListener('mousemove',e=>{if(!picking||own(e))return;const t=document.elementFromPoint(e.clientX,e.clientY);if(!t||t===host)return;if(t===rawTarget&&hovered&&!e.altKey)return;rawTarget=t;const hit=target(e);hovered=hit?.el??null;place(q('.hover'),hovered);},{capture:true,signal});
  document.addEventListener('click',e=>{if(!active||own(e))return;menu(false);if(!picking)return;const raw=document.elementFromPoint(e.clientX,e.clientY);if(!raw||raw===host)return;const el=e.altKey?raw:hovered&&hovered.contains(raw)?hovered:target(e)?.el;if(!el)return;e.preventDefault();e.stopImmediatePropagation();select(el,false,raw);},{capture:true,signal});
  document.addEventListener('keydown',e=>{if(!active)return;if(closeViewer&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeViewer();return;}if(closeViewer)return;if(e.key==='Escape'){cancel();stopPick();menu(false);q('.window').hidden=true;q('.toolbar').hidden=true;q('.mascot').focus();}const typing=['INPUT','TEXTAREA','SELECT'].includes((e.target as Element)?.tagName)||(e.target as HTMLElement)?.isContentEditable;if(typing)return;
    if(picking&&hovered&&(e.key==='ArrowUp'||e.key==='ArrowDown')){const next=e.key==='ArrowUp'?levelUp(hovered):levelDown(hovered,rawTarget);if(next){e.preventDefault();hovered=next;place(q('.hover'),hovered);}return;}
    if(phase==='selected'&&!picking){if(e.key==='ArrowUp'){e.preventDefault();bigger();}else if(e.key==='ArrowDown'){e.preventDefault();smaller();}else if(e.key==='Enter'&&(!own(e)||(e.target as Element)?.closest?.('.toolbar'))){e.preventDefault();void scan();}}},{capture:true,signal});
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
  async function scan(){if(!selected?.isConnected){notify('Selection is unavailable. Pick again.');return;}cancel();const version=run;captureId=crypto.randomUUID();page=pageInfo(document);capture=null;full=null;imagesFor=null;imagesStored=false;currentSaved=false;analysis=null;annotations=null;suppressResult=false;stopPick();phase='scanning';tab='lesson';step=0;lessonError=null;q('.toolbar').hidden=true;geometry();q('.scan').hidden=false;q('.scan-label').hidden=true;
    hasKey=!!(await ask<{hasKey:boolean}>({type:'pp:status'}))?.hasKey;if(version!==run||destroyed)return;
    position();render();
    await new Promise(resolve=>setTimeout(resolve,40));if(version!==run||destroyed)return;
    try{const snapshot=measureElement(selected);await new Promise(resolve=>setTimeout(resolve,hasKey?250:900));if(version!==run||destroyed)return;facts=snapshot;if(hasKey){await interpret(version);return;}finish();}catch{cancel();notify('Measurement failed. Pick another element to retry.');}}
  function finish(){phase='result';q('.scan').hidden=true;q('.scan-label').hidden=true;render();if(lessonError?.retryAt)tick();void persist();}
  /** The library record for the current capture. Titles stay auto until the user edits them. */
  function record():Saved|null{if(!facts||!page)return null;const pattern=patternName(facts,scope,analysis?.role?.title);return {id:captureId,createdAt:facts.capturedAt,updatedAt:new Date().toISOString(),scope,page,facts,analysis,pattern,title:captureTitle(pattern,page),titleSource:'auto',saved:false,savedAt:null,note:'',hasImage:!!capture||imagesStored,annotations};}
  /** Every finished capture lands in Recent; later lesson updates merge into the same record. */
  async function persist():Promise<Saved|null>{const rec=record();if(!rec)return null;const images:Images|undefined=!imagesStored&&capture?{thumb:capture,full}:undefined;
    const res=await ask<{record?:Saved}>({type:'pp:store:put',record:rec,images});if(!res?.record||res.record.id!==captureId)return res?.record??null;if(images)imagesStored=true;if(res.record.saved!==currentSaved){currentSaved=res.record.saved;render();}return res.record;}
  /** Capture (UI hidden so it is not in the screenshot), then ask the model. Retry reuses the same capture. */
  async function interpret(version:number){if(!facts)return;lessonError=null;phase='scanning';
    if(!lastImage){if(!selected?.isConnected){lessonError={code:'gone',message:'It changed or was removed from the page. Your measurements are kept; pick it again for a lesson.'};finish();return;}
      step=1;render();q('.scan').hidden=false;const r=bounds(),x=Math.max(0,r.left),y=Math.max(0,r.top),rect={x,y,width:Math.min(innerWidth,r.right)-x,height:Math.min(innerHeight,r.bottom)-y};try{annotations=measureLayout(selected,rect,scope);}catch{annotations=null;}
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
    const thumb=capture||imagesFor?`<button class="shot" data-action="view" aria-label="Open the capture full screen with measured annotations" title="Open full screen"><canvas data-thumb="current"></canvas></button>`:'';
    show(`<header class="lesson-head${shotOpen?' expanded':''}"><div class="title"><h2>${esc(name)}</h2><p class="muted">${meta}</p></div>${thumb}</header>${tabs(tab,results,!!f)}<div class="panel" role="tabpanel">${body}</div>`,
      f?`<button data-action="pick">Pick another</button><button data-action="export">Export</button>${currentSaved?'<button class="saved-state" data-action="saved" title="Open in Library">✓ Saved · Open in Library</button>':'<button class="primary" data-action="save">Save idea</button>'}`:'<button data-action="cancel">Cancel</button>');}
  async function save(){if(!facts)return;if(currentSaved){notify('Already in your saved ideas.');return;}
    const stored=await persist();const res=stored?await ask<{record?:Saved|null}>({type:'pp:store:save',id:captureId}):undefined;
    if(!res?.record){notify('Could not save. Your measurements are still available to export.');return;}
    currentSaved=true;render();void refreshSiteIdeas();clearTimeout(poseTimer);q('.launcher').classList.add('collected');notify('Idea spotted. Source credited. Saved!');poseTimer=setTimeout(()=>q('.launcher').classList.remove('collected'),2800);}
  /** Full-screen capture with measured annotations. The image is drawn on canvas (page CSP). */
  async function openViewer(){if(!facts)return;if(!full&&!capture&&imagesFor){const res=await ask<{images?:Record<string,Images>}>({type:'pp:store:images',ids:[imagesFor]});capture=res?.images?.[imagesFor]?.thumb??null;full=res?.images?.[imagesFor]?.full??null;}
    const img=full??capture;if(!img){notify('No screenshot for this capture yet.');return;}closeViewer?.();
    const wrap=document.createElement('div');wrap.className='viewer-host';root.append(wrap);
    const draw=async()=>{const pattern=patternName(facts!,scope,analysis?.role?.title);wrap.innerHTML=viewerHTML({title:pattern,subtitle:page?`${page.siteName} · ${page.pageName}`:'',image:'<canvas class="v-img" aria-hidden="true"></canvas>',annotations,analysis,layers:viewerLayers,actual:viewerActual,canDownload:false});
      const cv=wrap.querySelector<HTMLCanvasElement>('.v-img');if(cv)await drawFull(cv,img);cleanup?.();cleanup=wireViewer(wrap,{onLayers:l=>{viewerLayers=l;},onAction:a=>{if(a==='close')closeViewer?.();else if(a==='zoom'){viewerActual=!viewerActual;void draw();}}});wrap.querySelector<HTMLButtonElement>('[data-v="close"]')?.focus({preventScroll:true});};
    let cleanup:(()=>void)|null=null;closeViewer=()=>{cleanup?.();wrap.remove();closeViewer=null;q<HTMLButtonElement>('.shot')?.focus({preventScroll:true});};await draw();}
  async function drawFull(cv:HTMLCanvasElement,t:Thumb){const b=await bitmap(`${captureId}:${t.width}`,t);if(!b)return;cv.width=b.width;cv.height=b.height;cv.getContext('2d')?.drawImage(b,0,0);}
  /** Export the current capture. Comparing several ideas lives in the Library tab. */
  function exportView(){const rec=record();if(!rec)return;show(`<h2>Export</h2><p class="muted">${esc(rec.title)}</p><div class="formats">${(['md','json','css'] as const).map(f=>`<button data-format="${f}" class="${format===f?'active':''}">${FORMAT_LABELS[f]}</button>`).join('')}</div><pre>${esc(exportText([rec],{},format))}</pre><p class="muted">To combine values from several ideas, use Compare in the Library.</p>`,'<button data-action="back-lesson">Back to lesson</button><button class="primary" data-action="download">Download</button>');}
  /** Open the Library tab, optionally on one capture. */
  function openLibrary(id?:string,query?:string){void ask({type:'pp:open-library',id,query});}
  /** Count saved ideas from this site for the launcher badge. */
  async function refreshSiteIdeas(){const res=await ask<{records?:Saved[]}>({type:'pp:store:list',query:{host:location.hostname,saved:true}});if(destroyed)return;siteIdeas=res?.records?.length??0;
    const btn=q('.site-ideas'),badge=q('.site-count');btn.hidden=badge.hidden=siteIdeas===0;btn.textContent=`${siteIdeas} idea${siteIdeas===1?'':'s'} from this site`;badge.textContent=String(siteIdeas);q('.mascot').setAttribute('aria-label',`Open Pixel Peeper controls${siteIdeas?` (${siteIdeas} saved from this site)`:''}`);}
  root.addEventListener('click',e=>{const target=(e.target as Element).closest<HTMLElement>('button');if(!target)return;const action=target.dataset.action;if(target.dataset.crumb){const el=crumbs[Number(target.dataset.crumb)];if(el&&el!==selected)select(el);return;}if(target.dataset.tab){tab=target.dataset.tab as Tab;q('.body').scrollTop=0;lesson();return;}
    if(target.dataset.format){format=target.dataset.format as Format;exportView();return;}switch(action){case'pick':pick();break;case'page':select(document.documentElement,true);q('.toolbar').hidden=true;void scan();break;case'scan':void scan();break;case'bigger':bigger();break;case'smaller':smaller();break;case'site-ideas':openLibrary(undefined,location.hostname);break;case'hide':suppressResult=true;q('.window').hidden=true;break;case'resume':if(phase==='scanning'){suppressResult=false;show('<h2>Reading computed styles</h2><p class="muted">Your selected element is being measured.</p>','<button data-action="hide">Hide</button>');}else lesson();break;case'library':void persist().then(()=>openLibrary());break;case'saved':openLibrary(captureId);break;case'back-lesson':lesson();break;case'save':void save();break;case'export':exportView();break;case'retry':if(facts&&phase!=='scanning'){cancel();void interpret(run);}break;case'view':void openViewer();break;case'cancel':cancel();phase=facts?'result':'idle';q('.window').hidden=true;break;case'settings':void ask({type:'pp:open-options'});break;case'download':{const rec=record();if(!rec)break;const blob=new Blob([exportText([rec],{},format)],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=FILE_NAMES[format];a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}}},{signal});
  let drag:{x:number;y:number;left:number;top:number}|null=null;
  q('.handle').addEventListener('pointerdown',e=>{userPlaced=true;const r=q('.window').getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};q('.handle').setPointerCapture(e.pointerId);},{signal});
  q('.handle').addEventListener('pointermove',e=>{if(!drag)return;Object.assign(q('.window').style,{left:`${Math.max(8,Math.min(innerWidth-q('.window').offsetWidth-8,drag.left+e.clientX-drag.x))}px`,top:`${Math.max(8,Math.min(innerHeight-q('.window').offsetHeight-8,drag.top+e.clientY-drag.y))}px`,right:'auto',bottom:'auto'});},{signal});
  q('.handle').addEventListener('pointerup',()=>drag=null,{signal});
  onStale=()=>notify('Pixel Peeper was updated. Reload this page to keep using it.');
  return {activate(){active=true;host.hidden=false;host.style.display='block';void refreshSiteIdeas();},pick(){active=true;host.hidden=false;host.style.display='block';pick();},deactivate(){active=false;cancel();stopPick();host.hidden=true;host.style.display='none';},destroy(){destroyed=true;cancel();clearInterval(ticker);abort.abort();clearTimeout(menuTimer);clearTimeout(feedbackTimer);clearTimeout(poseTimer);host.remove();}};
}
