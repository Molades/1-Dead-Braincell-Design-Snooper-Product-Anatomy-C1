import { captureTitle, measureElement, measureLayout, pageInfo, patternName } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import { DEFAULT_PROFILE, normalizeAnalysis, type Analysis, type Annotations, type CaptureRecord, type Facts, type PageInfo, type Profile, type StoredImage } from '@pixelpeeper/schema';
import tokens from './tokens.css?inline';
import css from './overlay.css?inline';
import { icon } from './icons';
import viewerCss from './viewer.css?inline';
import { DEFAULT_LAYERS, viewerHTML, wireViewer, type Layer } from './viewer';
import { createMascot, type Mascot } from './mascot';
import { createSound } from './sound';
import { ancestry, elementLabel, levelDown, levelUp, snapToComponent } from './grouping';
import { exportText, FILE_NAMES, FORMAT_LABELS, type Format } from './direction';
import { errorCard, lessonTab, measurementsTab, noKeyCard, placeWindow, progress, rulesTab, tabs, type LessonError, type Tab } from './lesson';

/** Ideas and Recent captures come from the library database in the background worker. */
type Saved = CaptureRecord;
type Image = { base64: string; mediaType: 'image/jpeg' | 'image/png' };
type Quota = { limit: number; used: number; remaining: number; resetAt: string };
type Thumb = StoredImage;
type Images = { thumb: Thumb | null; full: Thumb | null };
/** Messages go to the background worker, which talks to the Pixel Peeper service. */
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
  const tagHTML = '<span class="tag"><b class="tl"></b><span class="td"></span></span>';
  root.innerHTML = `<style>${tokens}${css}${viewerCss}</style><div class="spot" aria-hidden="true"></div><div class="box hover"><i class="pad"><i></i></i>${tagHTML}</div><div class="box selected"><i class="ring"></i><i class="h nw"></i><i class="h ne"></i><i class="h sw"></i><i class="h se"></i>${tagHTML}</div>
    <div class="toolbar" role="toolbar" aria-label="Selection" hidden></div>
    <div class="hint" hidden>${icon('cursor-click', 16)}<span><b>Hover</b> to preview, <b>click</b> to pick</span><i class="sep"></i><span><kbd>↑</kbd><kbd>↓</kbd> bigger or smaller</span><i class="sep"></i><span>hold <kbd>⌥</kbd> exact element</span><i class="sep"></i><span><kbd>Esc</kbd> exit</span></div><div class="scan" hidden aria-hidden="true"><div class="pixels">${Array.from({length:12},(_,i)=>`<i style="left:${8+i*17%84}%;top:${12+i*23%76}%"></i>`).join('')}</div><div class="beam"></div></div><div class="scan-label" hidden role="status"></div>
    <section class="window" hidden aria-label="Pixel Peeper workspace"><header class="head"><div class="handle"><span class="mark" aria-hidden="true"></span><span class="brand"><b>Pixel Peeper</b><small>Design inspector</small></span></div><button class="icon-btn head-sound" data-action="sound" aria-pressed="true" aria-label="Sound on" title="Sound on. Click to mute.">${icon('speaker-high', 16, 'on')}${icon('speaker-slash', 16, 'off')}</button><button class="hide-btn" data-action="hide">${icon('minus', 14)}Hide</button></header><div class="body"></div><footer class="foot"></footer></section>
    <div class="launcher"><button class="mascot" aria-label="Open Pixel Peeper controls" aria-expanded="false" aria-controls="menu"><span class="sprite" aria-hidden="true"></span><span class="site-count" aria-hidden="true" hidden></span></button><nav class="dock" id="menu" aria-label="Pixel Peeper controls"><button class="primary" data-action="pick">${icon('crosshair-simple', 16)}Pick element</button><button data-action="page">${icon('browser', 16)}Whole page</button><button data-action="library">${icon('books', 16)}Library</button><button data-action="resume">${icon('clock-counter-clockwise', 16)}Last lesson</button><button class="site-ideas" data-action="site-ideas" hidden></button><button class="dock-sound icon-btn" data-action="sound" aria-pressed="true" aria-label="Sound on" title="Sound on. Click to mute.">${icon('speaker-high', 16, 'on')}${icon('speaker-slash', 16, 'off')}</button><button class="dock-close icon-btn" data-action="close" aria-label="Close Pixel Peeper" title="Close Pixel Peeper. Click the extension icon to bring it back.">${icon('power', 16)}</button></nav></div><div class="feedback" role="status" aria-live="polite" hidden></div><div class="coach" role="dialog" aria-label="Getting started" hidden></div>`;
  // Keep the mascot first in keyboard order; place it last visually.
  const q = <T extends HTMLElement = HTMLElement>(s:string) => root.querySelector<T>(s)!;
  q('.mascot').style.order = '2'; q('.dock').style.order = '1';
    // Cut-out poses (transparent around the figure) for the launcher, the window mark and the save moment.
  // Fonts declared inside a shadow root are ignored by Chrome, so register them on the document under
  // private names: a page that names Inter in its own CSS must keep rendering exactly as it did.
  if (typeof FontFace !== 'undefined' && document.fonts) for (const [family, file] of [['PP Display', 'schibsted-grotesk'], ['PP Sans', 'roboto'], ['PP Mono', 'jetbrains-mono']] as const) {
    if (![...document.fonts].some((f) => f.family.replace(/"/g, '') === family)) {
      const face = new FontFace(family, `url("${chrome.runtime.getURL(`/fonts/${file}.woff2`)}") format("woff2")`, { weight: '100 900' });
      document.fonts.add(face); void face.load().catch(() => {});
    }
  }
  for (const pose of ['peek', 'getaway']) host.style.setProperty(`--pose-${pose}`, `url("${chrome.runtime.getURL(`/poses/${pose}.svg`)}")`);
  document.documentElement.append(host); host.hidden = true;
  let mascot:Mascot|null=null;let active=false,picking=false,selected:Element|null=null,facts:Facts|null=null,scope:'element'|'page'='element';
  let analysis:Analysis|null=null,lessonError:LessonError|null=null,lastImage:Image|null=null,hasKey=false,interpreting=false,hovered:Element|null=null;
  let profile:Profile={...DEFAULT_PROFILE},quota:Quota|null=null;
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
  let menuTimer:ReturnType<typeof setTimeout>,feedbackTimer:ReturnType<typeof setTimeout>;
  let format:Format='md';
  const abort = new AbortController(), signal = abort.signal;
  function notify(message:string){clearTimeout(feedbackTimer);q('.feedback').textContent=message;q('.feedback').hidden=false;feedbackTimer=setTimeout(()=>q('.feedback').hidden=true,2800);}
  function menu(open:boolean){clearTimeout(menuTimer);if(open){mascot?.attend();syncSound();}q('.launcher').classList.toggle('open',open);q('.mascot').setAttribute('aria-expanded',String(open));q('.mascot').setAttribute('aria-label',open?'Close Pixel Peeper controls':'Open Pixel Peeper controls');}
  /**
   * The outline: glides between elements (transform and size transitions), takes the element's own corner
   * radius, shows its padding as a fine hatch, and carries a label and a mono size tag. It snaps without
   * gliding the first time it appears, so it never flies in from the corner of the screen.
   */
  function place(box:HTMLElement,el:Element|null){if(!el?.isConnected){box.style.display='none';box.dataset.on='';return;}const r=el.getBoundingClientRect(),cs=getComputedStyle(el),fresh=box.dataset.on!=='1';box.classList.toggle('snap',fresh);
    Object.assign(box.style,{display:'block',transform:`translate(${r.left}px,${r.top}px)`,width:`${r.width}px`,height:`${r.height}px`,borderRadius:cs.borderRadius&&cs.borderRadius!=='0px'?cs.borderRadius:'3px'});
    for(const [k,v] of [['--pt',cs.paddingTop],['--pr',cs.paddingRight],['--pb',cs.paddingBottom],['--pl',cs.paddingLeft]] as const)box.style.setProperty(k,v);
    box.dataset.on='1';box.querySelector('.tl')!.textContent=elementLabel(el);box.querySelector('.td')!.textContent=`${Math.round(r.width)} × ${Math.round(r.height)}`;box.classList.toggle('below',r.top<34);
    if(fresh)requestAnimationFrame(()=>requestAnimationFrame(()=>box.classList.remove('snap')));}
  /** While picking, the page shows a precise indigo crosshair (removed the moment picking ends). */
  const CURSOR=`url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g fill='none' stroke-linecap='round'><g stroke='#fff' stroke-width='4'><circle cx='16' cy='16' r='7'/><path d='M16 2v6M16 24v6M2 16h6M24 16h6'/></g><g stroke='#5e6ad2' stroke-width='1.75'><circle cx='16' cy='16' r='7' fill='rgba(94,106,210,.16)'/><path d='M16 2v6M16 24v6M2 16h6M24 16h6'/></g><circle cx='16' cy='16' r='1.6' fill='#5e6ad2'/></g></svg>")}") 16 16, crosshair`;
  function pickCursor(on:boolean){let st=document.getElementById('pp-pick-cursor');if(on&&!st){st=document.createElement('style');st.id='pp-pick-cursor';st.textContent=`html.pp-picking,html.pp-picking *{cursor:${CURSOR}!important}html.pp-picking pixel-peeper-overlay{cursor:auto!important}`;(document.head||document.documentElement).append(st);}document.documentElement.classList.toggle('pp-picking',on);}
  /** Hide the window now (state is immediate), and let a snapshot of it fade out. */
  function hideWindow(){const w=q('.window');if(w.hidden)return;if(typeof w.animate==='function'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const g=w.cloneNode(true) as HTMLElement;g.classList.add('ghost');g.setAttribute('aria-hidden','true');g.removeAttribute('aria-label');g.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));const src=[...w.querySelectorAll('canvas')],dst=[...g.querySelectorAll('canvas')];src.forEach((c,i)=>{const d=dst[i];if(d&&c.width){d.width=c.width;d.height=c.height;d.getContext('2d')?.drawImage(c,0,0);}});root.append(g);g.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(6px) scale(.98)'}],{duration:150,easing:'cubic-bezier(.23,1,.32,1)',fill:'forwards'}).finished.then(()=>g.remove(),()=>g.remove());}w.hidden=true;}
  /** Page scope means the visible viewport, never claimed as the full page. */
  const viewport=()=>({left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight});
  const bounds=()=>scope==='page'?viewport():selected!.getBoundingClientRect();
  function geometry(){if(!selected?.isConnected){place(q('.selected'),null);q('.spot').classList.remove('on');q('.toolbar').hidden=true;if(phase==='scanning')cancel();return;}
    const sb=q('.selected');if(scope==='page'){Object.assign(sb.style,{display:'block',transform:'translate(3px,3px)',width:`${innerWidth-6}px`,height:`${innerHeight-6}px`,borderRadius:'12px'});sb.dataset.on='1';sb.classList.remove('below');sb.querySelector('.tl')!.textContent='Visible page';sb.querySelector('.td')!.textContent=`${innerWidth} × ${innerHeight}`;}else place(sb,selected);
    const r=bounds();const spot=q('.spot');spot.classList.toggle('on',scope!=='page'&&(phase==='selected'||phase==='scanning'));Object.assign(spot.style,{transform:`translate(${r.left-4}px,${r.top-4}px)`,width:`${r.width+8}px`,height:`${r.height+8}px`});
    // The toolbar never covers the pick: below it, else above it, else tucked inside its bottom edge; and never under the detective.
    const tb=q('.toolbar'),tw=tb.offsetWidth||360,th=tb.offsetHeight||48,gap=14,fits=(y:number)=>y>=8&&y+th<=innerHeight-8;
    const y=fits(r.bottom+gap)?r.bottom+gap:fits(r.top-th-gap)?r.top-th-gap:Math.min(innerHeight-th-8,Math.max(8,r.bottom-th-gap));let x=Math.max(8,Math.min(r.left,innerWidth-tw-8));if(y+th>innerHeight-112&&x+tw>innerWidth-148)x=Math.max(8,innerWidth-148-tw);
    Object.assign(tb.style,{left:`${x}px`,top:`${y}px`});const l=Math.max(0,r.left),t=Math.max(0,r.top),w=Math.max(0,Math.min(innerWidth,r.right)-l),h=Math.max(0,Math.min(innerHeight,r.bottom)-t);Object.assign(q('.scan').style,{left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`,borderRadius:sb.style.borderRadius});q('.scan').style.setProperty('--travel',`${Math.max(0,h-4)}px`);Object.assign(q('.scan-label').style,{left:`${x}px`,top:`${y}px`});}
  function cancel(){run++;interpreting=false;clearInterval(ticker);q('.scan').hidden=true;q('.scan-label').hidden=true;if(phase==='scanning')phase=facts?'selected':'idle';}
  function pick(){cancel();picking=true;q('.hint').hidden=false;hideWindow();q('.toolbar').hidden=true;q('.spot').classList.remove('on');pickCursor(true);menu(false);mascot?.mood('search');}
  function stopPick(){if(picking)mascot?.mood('idle');picking=false;pickCursor(false);q('.hint').hidden=true;place(q('.hover'),null);}
  function select(el:Element,wholePage=false,raw:Element|null=selectedRaw){cancel();stopPick();selected=el;selectedRaw=raw;scope=wholePage?'page':'element';facts=null;analysis=null;lessonError=null;lastImage=null;tab='lesson';step=0;capture=null;full=null;imagesFor=null;shotOpen=false;page=null;imagesStored=false;currentSaved=false;annotations=null;phase='selected';hideWindow();toolbar();q('.toolbar').hidden=false;geometry();menu(false);q<HTMLButtonElement>('.toolbar .primary').focus({preventScroll:true});
    // The lock: a pulse ring, handles that pop in, and a soft click.
    const sb=q('.selected');sb.classList.remove('lock');void sb.offsetWidth;sb.classList.add('lock');sound.play('lock',true);}
  /** Get lesson, then where you are (breadcrumb), then how to change it. Nothing is sent before Get lesson. */
  function toolbar(){if(!selected)return;crumbs=scope==='page'?[]:ancestry(selected);const up=scope!=='page'&&!!levelUp(selected),down=scope!=='page'&&!!levelDown(selected,selectedRaw);
    q('.toolbar').innerHTML=`<button class="primary" data-action="scan">${icon('sparkle',16)}Get lesson <kbd>↵</kbd></button>${crumbs.length?`<nav class="crumbs" aria-label="Selection level">${crumbs.map((el,i)=>`<button data-crumb="${i}" ${el===selected?'aria-current="true"':''}>${esc(elementLabel(el))}</button>`).join('<span class="chev" aria-hidden="true">›</span>')}</nav>`:''}<span class="updown"><button class="icon-btn" data-action="bigger" title="Bigger (↑)" aria-label="Select the container (bigger)" ${up?'':'disabled'}>${icon('caret-up',16)}</button><button class="icon-btn" data-action="smaller" title="Smaller (↓)" aria-label="Select inside (smaller)" ${down?'':'disabled'}>${icon('caret-down',16)}</button></span><button data-action="pick" title="Pick something else">${icon('arrow-counter-clockwise',16)}Pick again</button>`;}
  function bigger(){const el=selected&&levelUp(selected);if(el)select(el);}
  function smaller(){const el=selected&&levelDown(selected,selectedRaw);if(el)select(el);}
  const own = (event:Event) => event.composedPath().includes(host);
  /** Snap to the enclosing component unless Option/Alt is held. */
  function target(e:MouseEvent){const t=document.elementFromPoint(e.clientX,e.clientY);if(!t||t===host)return null;return e.altKey?{el:t,reason:null}:snapToComponent(t);}
  document.addEventListener('mousemove',e=>{if(!picking||own(e))return;const t=document.elementFromPoint(e.clientX,e.clientY);if(!t||t===host)return;if(t===rawTarget&&hovered&&!e.altKey)return;rawTarget=t;const hit=target(e);hovered=hit?.el??null;place(q('.hover'),hovered);},{capture:true,signal});
  document.addEventListener('click',e=>{if(!active||own(e))return;menu(false);if(!picking)return;const raw=document.elementFromPoint(e.clientX,e.clientY);if(!raw||raw===host)return;const el=e.altKey?raw:hovered&&hovered.contains(raw)?hovered:target(e)?.el;if(!el)return;e.preventDefault();e.stopImmediatePropagation();select(el,false,raw);},{capture:true,signal});
  document.addEventListener('keydown',e=>{if(!active)return;if(closeViewer&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeViewer();return;}if(closeViewer)return;if(e.key==='Escape'){cancel();stopPick();menu(false);mascot?.mood('idle');hideWindow();q('.toolbar').hidden=true;q('.spot').classList.remove('on');q('.mascot').focus();}const typing=['INPUT','TEXTAREA','SELECT'].includes((e.target as Element)?.tagName)||(e.target as HTMLElement)?.isContentEditable;if(typing)return;
    if(picking&&hovered&&(e.key==='ArrowUp'||e.key==='ArrowDown')){const next=e.key==='ArrowUp'?levelUp(hovered):levelDown(hovered,rawTarget);if(next){e.preventDefault();hovered=next;place(q('.hover'),hovered);}return;}
    if(!q('.window').hidden&&facts&&!currentSaved&&(e.key==='s'||e.key==='S')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&phase==='result'){e.preventDefault();void save();return;}
    if(phase==='selected'&&!picking){if(e.key==='ArrowUp'){e.preventDefault();bigger();}else if(e.key==='ArrowDown'){e.preventDefault();smaller();}else if(e.key==='Enter'&&(!own(e)||(e.target as Element)?.closest?.('.toolbar'))){e.preventDefault();void scan();}}},{capture:true,signal});
  q('.mascot').onclick=()=>menu(!q('.launcher').classList.contains('open'));
  const sound=createSound();
  root.addEventListener('pointerdown',()=>sound.gesture(),{capture:true,signal});
  function syncSound(){const m=sound.isMuted();root.querySelectorAll<HTMLElement>('[data-action="sound"]').forEach(b=>{b.setAttribute('aria-pressed',String(!m));b.setAttribute('aria-label',m?'Sound off':'Sound on');b.title=m?'Sound off. Click to turn on.':'Sound on. Click to mute.';b.classList.toggle('muted',m);});}
  mascot=createMascot({launcher:q('.launcher'),button:q('.mascot'),stage:q('.sprite'),url:p=>chrome.runtime.getURL(p),sound,busy:()=>picking||!q('.window').hidden||!q('.toolbar').hidden,signal});
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
  async function scan(){if(!selected?.isConnected){notify('Selection is unavailable. Pick again.');return;}cancel();const version=run;mascot?.mood('work');const defaultTab:Tab=profile.goals.length===1&&profile.goals[0]==='accessibility'?'rules':'lesson';captureId=crypto.randomUUID();page=pageInfo(document);capture=null;full=null;imagesFor=null;imagesStored=false;currentSaved=false;analysis=null;annotations=null;suppressResult=false;stopPick();phase='scanning';tab=defaultTab;step=0;lessonError=null;q('.toolbar').hidden=true;geometry();q('.scan').hidden=false;q('.scan-label').hidden=true;
    hasKey=!!(await ask<{hasKey:boolean}>({type:'pp:status'}))?.hasKey;if(version!==run||destroyed)return;
    position();render();
    await new Promise(resolve=>setTimeout(resolve,40));if(version!==run||destroyed)return;
    try{const snapshot=measureElement(selected);await new Promise(resolve=>setTimeout(resolve,hasKey?250:900));if(version!==run||destroyed)return;facts=snapshot;if(hasKey){await interpret(version);return;}finish();}catch{cancel();notify('Measurement failed. Pick another element to retry.');}}
  function finish(){phase='result';mascot?.result(!lessonError);q('.scan').hidden=true;q('.scan-label').hidden=true;render();if(lessonError?.retryAt)tick();void persist();}
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
    const res=await ask<{analysis?:unknown;error?:string;code?:string;retryAfter?:number;quota?:Quota}>({type:'pp:analyze',facts,scope,image:lastImage});if(res?.quota)quota=res.quota;if(version!==run||destroyed)return;
    interpreting=false;const a=normalizeAnalysis(res?.analysis);
    if(a)analysis=a;else lessonError={code:res?.code,message:res?.code==='quota'&&quota?`You’ve used all ${quota.limit} of today’s lessons. They reset at ${new Date(quota.resetAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}. Measurements, rules and the viewer still work.`:res?.error??'The lesson did not arrive. Retry; your measurements are kept.',retryAt:res?.retryAfter?Date.now()+res.retryAfter*1000:undefined};
    finish();}
  function show(body:string,footer:string,wide=false){q('.body').innerHTML=body;q('.foot').innerHTML=footer;q('.window').classList.toggle('wide',wide);if(wide)Object.assign(q('.window').style,{left:'',top:'',right:'',bottom:'',maxHeight:''});q('.window').hidden=false;q('.spot').classList.remove('on');menu(false);slidePill();syncSound();void hydrate();}
  /** The segmented tabs' white pill slides from the last tab to the new one (re-renders keep its position). */
  let pillFrom:{x:number;w:number}|null=null,lastKey='';
  function slidePill(){const t=root.querySelector<HTMLElement>('.tabs');if(!t)return;const pill=t.querySelector<HTMLElement>('.pill'),a=t.querySelector<HTMLElement>('[aria-selected="true"]');if(!pill||!a)return;const to={x:a.offsetLeft,w:a.offsetWidth};
    if(pillFrom&&pillFrom.x!==to.x){pill.style.transition='none';pill.style.transform=`translateX(${pillFrom.x}px)`;pill.style.width=`${pillFrom.w}px`;void pill.offsetWidth;pill.style.transition='';}
    pill.style.transform=`translateX(${to.x}px)`;pill.style.width=`${to.w}px`;pillFrom=to;}
  /** Draw thumbnails with canvas: unlike <img>, it is not blocked by a page's image CSP. */
  function bitmap(id:string,t:Thumb){if(!bitmaps.has(id))bitmaps.set(id,typeof createImageBitmap==='function'?createImageBitmap(new Blob([Uint8Array.from(atob(t.base64),c=>c.charCodeAt(0))],{type:t.mediaType})).catch(()=>null):Promise.resolve(null));return bitmaps.get(id)!;}
  async function draw(canvas:HTMLCanvasElement,id:string,t:Thumb){const b=await bitmap(id,t);if(!b||!canvas.isConnected)return;canvas.width=b.width;canvas.height=b.height;canvas.getContext('2d')?.drawImage(b,0,0);canvas.classList.add('ready');}
  async function hydrate(){const cur=root.querySelector<HTMLCanvasElement>('canvas[data-thumb="current"]');
    if(cur){if(!capture&&imagesFor){const id=imagesFor;const res=await ask<{images?:Record<string,Images>}>({type:'pp:store:images',ids:[id]});if(imagesFor===id){capture=res?.images?.[id]?.thumb??null;full=res?.images?.[id]?.full??null;}}if(capture)void draw(cur,captureId,capture);else cur.closest('.shot')?.remove();}
    const libs=[...root.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb-key]')];if(!libs.length)return;const res=await ask<{images?:Record<string,Images>}>({type:'pp:store:images',ids:libs.map(c=>c.dataset.thumbKey!)});
    libs.forEach(c=>{const t=res?.images?.[c.dataset.thumbKey!]?.thumb;if(t)void draw(c,c.dataset.thumbKey!,t);else c.remove();});}
  /** For the accessibility goal: rule failures summarised above the lesson. */
  function a11ySummary(results:ReturnType<typeof evaluate>){if(!profile.goals.includes('accessibility'))return '';const fails=results.filter(r=>r.label==='measured'&&r.status==='fail');return `<button class="a11y-sum ${fails.length?'bad':'ok'}" data-tab="rules">${fails.length?`${fails.length} accessibility rule${fails.length>1?'s':''} failed: ${esc(fails.map(r=>r.name).join(', '))}`:'No measured accessibility failures'} <span>View rules →</span></button>`;}
  const short=(t:string,n=48)=>t.length>n?`${t.slice(0,n-1)}…`:t;
  function lesson(){
    if(!facts&&phase!=='scanning'){show(`<div class="hello"><span class="hello-mark" aria-hidden="true"></span><h2>Every website has something to teach you.</h2><p>Pick a detail. Read its real styles. Save what you learn.</p></div>`,`<button class="primary" data-action="pick">${icon('crosshair-simple',16)}Pick an element</button>`);return;}
    const f=facts,results=f?evaluate(f,{scope}):[];
    const name=f?short(patternName(f,scope,analysis?.role?.title)):scope==='page'?'Visible page':(selected?.tagName.toLowerCase()??'Selection');
    const where=page?`${esc(page.siteName)} · ${esc(page.pageName)}`:f?esc(new URL(f.url).hostname):'';
    const time=f?esc(new Date(f.capturedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'';
    const meta=f?`<code class="el">${scope==='page'?'visible page':`&lt;${esc(f.structure.tag.value)}&gt;`}</code><span class="where">${where}</span><span class="time">${time}</span>`:'<span>Measuring…</span>';
    let body:string;
    if(tab==='rules'&&f)body=rulesTab(results,scope);
    else if(tab==='measurements'&&f)body=measurementsTab(f,scope);
    else if(analysis&&f)body=a11ySummary(results)+lessonTab(analysis,f,results)+(quota?`<p class="quota">${quota.remaining} of ${quota.limit} lessons left today</p>`:'');
    else if(lessonError)body=errorCard(lessonError,Date.now());
    else if(phase==='scanning')body=progress(step,Math.round((Date.now()-stepStart)/1000),hasKey);
    else if(!hasKey)body=noKeyCard();
    else body=`<div class="err info"><span class="ico gray" aria-hidden="true">${icon('crosshair-simple',16)}</span><div><strong>No lesson saved with this idea</strong><p>Pick the element again on its page to get a lesson.</p><div class="row"><button data-action="pick">${icon('crosshair-simple',16)}Pick an element</button></div></div></div>`;
    // The capture stage: the selection's screenshot on a dot grid, outlined with handles and its size tag.
    const label=scope==='page'?'Visible page':selected?.isConnected?elementLabel(selected):name;
    const dims=f?`${Math.round(Number(f.size.width.value))} × ${Math.round(Number(f.size.height.value))}`:'';
    const thumb=capture||imagesFor?`<button class="shot" data-action="view" aria-label="Open the capture full screen with measured annotations" title="Open full screen"><span class="frame"><canvas data-thumb="current"></canvas><i class="h nw"></i><i class="h ne"></i><i class="h sw"></i><i class="h se"></i><span class="mtag">${esc(short(label,28))}${dims?` · ${dims}`:''}</span></span><span class="zoom">${icon('magnifying-glass',14)}</span></button>`:(phase==='scanning'&&hasKey?'<div class="shot placeholder" aria-hidden="true"><span class="frame"><span class="scanline"></span></span></div>':'');
    const key=`${tab}|${phase}|${!!analysis}|${!!lessonError}|${captureId}`,arrive=key!==lastKey;lastKey=key;
    const tokens=profile.goals.includes('tokens');
    show(`<header class="lesson-head"><div class="title"><h2>${esc(name)}</h2><p class="muted">${meta}</p></div>${thumb}</header>${tabs(tab,results,!!f)}<div class="panel${arrive?' arrive':''}" role="tabpanel">${body}</div>`,
      f?`<span class="quiet-group"><button data-action="pick">${icon('crosshair-simple',16)}Pick another</button><button data-action="export" ${tokens?'class="emphasis"':''}>${icon('export',16)}Export${tokens?' tokens':''}</button></span>${currentSaved?`<button class="saved-state" data-action="saved" title="Saved. Open it in the Library">${icon('check-circle',16)}Saved${icon('arrow-up-right',14,'go')}</button>`:`<button class="primary" data-action="save">${icon('bookmark-simple',16)}Save idea${profile.goals.includes('library')?' <kbd>S</kbd>':''}</button>`}`:`<button data-action="cancel">${icon('x',16)}Cancel</button>`);}
  async function save(){if(!facts)return;if(currentSaved){notify('Already in your saved ideas.');return;}
    const stored=await persist();const res=stored?await ask<{record?:Saved|null}>({type:'pp:store:save',id:captureId}):undefined;
    if(!res?.record){notify('Could not save. Your measurements are still available to export.');return;}
    currentSaved=true;render();void refreshSiteIdeas();mascot?.celebrate();notify('Idea spotted. Source credited. Saved!');}
  /** Full-screen capture with measured annotations. The image is drawn on canvas (page CSP). */
  async function openViewer(){if(!facts)return;if(!full&&!capture&&imagesFor){const res=await ask<{images?:Record<string,Images>}>({type:'pp:store:images',ids:[imagesFor]});capture=res?.images?.[imagesFor]?.thumb??null;full=res?.images?.[imagesFor]?.full??null;}
    const img=full??capture;if(!img){notify('No screenshot for this capture yet.');return;}closeViewer?.();
    const wrap=document.createElement('div');wrap.className='viewer-host';root.append(wrap);
    const draw=async()=>{const pattern=patternName(facts!,scope,analysis?.role?.title);wrap.innerHTML=viewerHTML({title:pattern,subtitle:page?`${page.siteName} · ${page.pageName}`:'',image:'<canvas class="v-img" aria-hidden="true"></canvas>',annotations,analysis,layers:viewerLayers,actual:viewerActual,canDownload:false});
      const cv=wrap.querySelector<HTMLCanvasElement>('.v-img');if(cv)await drawFull(cv,img);cleanup?.();cleanup=wireViewer(wrap,{onLayers:l=>{viewerLayers=l;},onAction:a=>{if(a==='close')closeViewer?.();else if(a==='zoom'){viewerActual=!viewerActual;void draw();}}});wrap.querySelector<HTMLButtonElement>('[data-v="close"]')?.focus({preventScroll:true});};
    let cleanup:(()=>void)|null=null;closeViewer=()=>{cleanup?.();wrap.remove();closeViewer=null;q<HTMLButtonElement>('.shot')?.focus({preventScroll:true});};await draw();}
  async function drawFull(cv:HTMLCanvasElement,t:Thumb){const b=await bitmap(`${captureId}:${t.width}`,t);if(!b)return;cv.width=b.width;cv.height=b.height;cv.getContext('2d')?.drawImage(b,0,0);}
  /** Export the current capture. Comparing several ideas lives in the Library tab. */
  function exportView(){const rec=record();if(!rec)return;show(`<div class="export"><h2>Export</h2><p class="muted">${esc(rec.title)}</p><div class="formats" role="radiogroup" aria-label="Format">${(['md','json','css'] as const).map(f=>`<button role="radio" aria-checked="${format===f}" data-format="${f}" class="${format===f?'active':''}">${FORMAT_LABELS[f]}</button>`).join('')}</div><pre>${esc(exportText([rec],{},format))}</pre><p class="note">To combine values from several ideas, use Compare in the Library.</p></div>`,`<button data-action="back-lesson">${icon('arrow-left',16)}Back to lesson</button><button class="primary" data-action="download">${icon('export',16)}Download</button>`);}
  /** Open the Library tab, optionally on one capture. */
  function openLibrary(id?:string,query?:string){void ask({type:'pp:open-library',id,query});}
  /** Load the profile; on first activation ever, show three tips beside the launcher. */
  async function loadProfile(){const res=await ask<{profile?:Profile}>({type:'pp:profile:get'});if(destroyed||!res?.profile)return;profile=res.profile;if(!profile.coachmarksSeen&&active)coach();}
  function coach(){const c=q('.coach');c.innerHTML=`<strong>Three things to know</strong><ol><li>Hover snaps to whole components. Hold <kbd>⌥</kbd> for the exact element.</li><li><kbd>↑</kbd> <kbd>↓</kbd> make the selection bigger or smaller.</li><li><b>Get lesson</b> sends a screenshot of your selection only when you choose it.</li></ol><div class="row"><button class="primary" data-action="coach-pick">Pick something</button><button data-action="coach-done">Got it</button></div>`;c.hidden=false;menu(false);}
  function coachDone(){q('.coach').hidden=true;profile={...profile,coachmarksSeen:true};void ask({type:'pp:profile:set',patch:{coachmarksSeen:true}});}
  /** Count saved ideas from this site for the launcher badge. */
  async function refreshSiteIdeas(){const res=await ask<{records?:Saved[]}>({type:'pp:store:list',query:{host:location.hostname,saved:true}});if(destroyed)return;siteIdeas=res?.records?.length??0;
    const btn=q('.site-ideas'),badge=q('.site-count');btn.hidden=badge.hidden=siteIdeas===0;btn.textContent=`${siteIdeas} idea${siteIdeas===1?'':'s'} from this site`;badge.textContent=String(siteIdeas);q('.mascot').setAttribute('aria-label',`Open Pixel Peeper controls${siteIdeas?` (${siteIdeas} saved from this site)`:''}`);}
  root.addEventListener('click',e=>{const copyEl=(e.target as Element).closest<HTMLElement>('[data-copy]');if(copyEl&&q('.body').contains(copyEl)){const text=copyEl.dataset.copy??'';void navigator.clipboard?.writeText(text).then(()=>{copyEl.classList.remove('copied');void copyEl.offsetWidth;copyEl.classList.add('copied');setTimeout(()=>copyEl.classList.remove('copied'),1200);sound.play('tick');},()=>notify('Copy is blocked on this page.'));return;}
    const target=(e.target as Element).closest<HTMLElement>('button');if(!target)return;const action=target.dataset.action;if(target.dataset.crumb){const el=crumbs[Number(target.dataset.crumb)];if(el&&el!==selected)select(el);return;}if(target.dataset.tab){if(tab!==target.dataset.tab)sound.play('tick');tab=target.dataset.tab as Tab;q('.body').scrollTop=0;lesson();return;}
    if(target.dataset.format){format=target.dataset.format as Format;exportView();return;}switch(action){case'pick':pick();break;case'close':cancel();stopPick();menu(false);hideWindow();q('.toolbar').hidden=true;active=false;mascot?.leave(()=>{if(active)return;host.hidden=true;host.style.display='none';mascot?.hide();});break;case'sound':{const next=!sound.isMuted();sound.setMuted(next);syncSound();if(!next)sound.play('blip');break;}case'page':select(document.documentElement,true);q('.toolbar').hidden=true;void scan();break;case'scan':void scan();break;case'coach-done':coachDone();break;case'coach-pick':coachDone();pick();break;case'bigger':bigger();break;case'smaller':smaller();break;case'site-ideas':openLibrary(undefined,location.hostname);break;case'hide':suppressResult=true;hideWindow();break;case'resume':if(phase==='scanning'){suppressResult=false;show('<div class="hello"><h2>Reading computed styles</h2><p>Your selected element is being measured.</p></div>',`<button data-action="hide">${icon('minus',14)}Hide</button>`);}else lesson();break;case'library':void persist().then(()=>openLibrary());break;case'saved':openLibrary(captureId);break;case'back-lesson':lesson();break;case'save':void save();break;case'export':exportView();break;case'retry':if(facts&&phase!=='scanning'){cancel();void interpret(run);}break;case'view':void openViewer();break;case'cancel':cancel();phase=facts?'result':'idle';hideWindow();break;case'settings':void ask({type:'pp:open-options'});break;case'download':{const rec=record();if(!rec)break;const blob=new Blob([exportText([rec],{},format)],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=FILE_NAMES[format];a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}}},{signal});
  let drag:{x:number;y:number;left:number;top:number}|null=null;
  q('.handle').addEventListener('pointerdown',e=>{userPlaced=true;const r=q('.window').getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};q('.handle').setPointerCapture(e.pointerId);},{signal});
  q('.handle').addEventListener('pointermove',e=>{if(!drag)return;Object.assign(q('.window').style,{left:`${Math.max(8,Math.min(innerWidth-q('.window').offsetWidth-8,drag.left+e.clientX-drag.x))}px`,top:`${Math.max(8,Math.min(innerHeight-q('.window').offsetHeight-8,drag.top+e.clientY-drag.y))}px`,right:'auto',bottom:'auto'});},{signal});
  q('.handle').addEventListener('pointerup',()=>drag=null,{signal});
  onStale=()=>notify('Pixel Peeper was updated. Reload this page to keep using it.');
  return {activate(){const was=!active;active=true;host.hidden=false;host.style.display='block';if(was)mascot?.arrive();void refreshSiteIdeas();void loadProfile();},pick(){const was=!active;active=true;host.hidden=false;host.style.display='block';if(was)mascot?.arrive();void loadProfile();pick();},deactivate(){active=false;cancel();stopPick();q('.spot').classList.remove('on');host.hidden=true;host.style.display='none';mascot?.hide();},destroy(){destroyed=true;pickCursor(false);cancel();clearInterval(ticker);abort.abort();clearTimeout(menuTimer);clearTimeout(feedbackTimer);host.remove();}};
}
