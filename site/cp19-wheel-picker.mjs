/** CP19-F inline scroll wheels. The existing native <select> remains the only data source. */
export const CP19_TOUCH_GAIN=1.2;
export const wheelIndex=(offset,row,count)=>Math.max(0,Math.min(count-1,Math.round(Math.max(0,offset)/row)));
export function wheelLabel(select,option){
 if(!option)return '—';
 if(option.value==='infinity')return '∞';
 if(select.id==='roundsInput')return option.textContent;
 const secs=Number(option.value);
 if(!Number.isFinite(secs))return option.textContent;
 return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
}
export function createCP19WheelPicker({form,ids,feedback}={}){
 const doc=form?.ownerDocument;
 if(!doc)return {refresh(){}};
 const view=doc.defaultView;
 const entries=[];
 for(const id of ids||[]){
  const select=form.querySelector('#'+id);if(!select)continue;
  const label=select.closest('label');if(!label)continue;
  const wheel=doc.createElement('div');wheel.className='cp19f-inline-wheel';
  const center=doc.createElement('div');center.className='cp19f-inline-center';center.setAttribute('aria-hidden','true');
  const scroll=doc.createElement('div');scroll.className='cp19f-inline-scroll';
  scroll.setAttribute('role','listbox');scroll.setAttribute('tabindex','0');
  scroll.setAttribute('aria-label',(label.childNodes[0]?.textContent?.trim()||'Выбор')+' — прокрутка значений');
  const fragment=doc.createDocumentFragment();
  for(let i=0;i<select.options.length;i++){
   const row=doc.createElement('div');row.className='cp19f-inline-option'+(select.options[i].value==='infinity'?' is-infinity':'');
   row.setAttribute('role','option');row.dataset.index=String(i);
   row.textContent=wheelLabel(select,select.options[i]);
   row.addEventListener('click',()=>choose(i,true));
   fragment.append(row);
  }
  scroll.append(fragment);
  // Non-interactive boundary markers balance empty outer rows at minimum/maximum.
  // They are outside the scrolling element, so they cannot affect touch or scrollTop.
  const minMarker=doc.createElement('div');
  minMarker.className='cp19f-inline-limit cp19f-inline-limit-top';
  minMarker.textContent='—';minMarker.setAttribute('aria-hidden','true');
  const maxMarker=doc.createElement('div');
  maxMarker.className='cp19f-inline-limit cp19f-inline-limit-bottom';
  maxMarker.textContent='—';maxMarker.setAttribute('aria-hidden','true');
  wheel.append(center,scroll,minMarker,maxMarker);
  label.addEventListener('click',event=>{if(wheel.contains(event.target))event.preventDefault();});
  select.hidden=true;select.insertAdjacentElement('afterend',wheel);
  const entry={select,wheel,scroll,minMarker,maxMarker,index:Math.max(0,select.selectedIndex),lastSynced:NaN,lastRowHeight:NaN,busy:false,raf:0,settleTimer:null,touching:false,touchStartY:0,touchStartTop:0,touchDragged:false};
  entries.push(entry);
  function beginInlineInteraction(){
   if(select.disabled)return;
   wheel.classList.add('is-engaged');
   if(entry.settleTimer!==null){view?.clearTimeout?.(entry.settleTimer);entry.settleTimer=null;}
  }
  function scheduleInlineCollapse(delay=380){
   if(entry.settleTimer!==null)view?.clearTimeout?.(entry.settleTimer);
   entry.settleTimer=view?.setTimeout?.(()=>{
    entry.settleTimer=null;
    if(entry.touching){scheduleInlineCollapse(delay);return;}
    wheel.classList.remove('is-engaged');
   },delay)??null;
  }
  // Safari: do not transform the native scroll container while it owns a touch gesture.
  // Drive the small wheel explicitly from touch distance; the selected native option is
  // committed only at touchend, so draw()/refresh() never fights the finger.
  scroll.addEventListener('touchstart',event=>{
   if(select.disabled||event.touches.length!==1)return;
   entry.touching=true;entry.busy=true;entry.touchDragged=false;
   entry.touchStartY=event.touches[0].clientY;entry.touchStartTop=scroll.scrollTop;
   scroll.style.scrollSnapType='none';
  },{passive:true});
  scroll.addEventListener('touchmove',event=>{
   if(!entry.touching||select.disabled||event.touches.length!==1)return;
   const delta=entry.touchStartY-event.touches[0].clientY;
   if(Math.abs(delta)>4){entry.touchDragged=true;beginInlineInteraction();}
   if(!entry.touchDragged)return;
   if(event.cancelable)event.preventDefault();
   scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,entry.touchStartTop+delta*CP19_TOUCH_GAIN));
   entry.index=wheelIndex(scroll.scrollTop,rowHeight(),select.options.length);
   highlight();
  },{passive:false});
  function endTouch(){
   if(!entry.touching)return;
   entry.touching=false;
   scroll.style.scrollSnapType='';
   const moved=entry.touchDragged;entry.touchDragged=false;
   if(moved){
    const n=wheelIndex(scroll.scrollTop,rowHeight(),select.options.length);
    choose(n,true);scheduleInlineCollapse(220);
   }else{entry.busy=false;scheduleInlineCollapse(180);}
  }
  scroll.addEventListener('touchend',endTouch,{passive:true});
  scroll.addEventListener('touchcancel',endTouch,{passive:true});
  // Desktop and keyboard still use the native scroll implementation.
  scroll.addEventListener('scrollend',()=>{
   if(!entry.touching)scheduleInlineCollapse(180);
  },{passive:true});
  function rowHeight(){return parseFloat(view?.getComputedStyle(scroll).getPropertyValue('--wheel-row'))||52;}
  function highlight(){scroll.querySelectorAll('.cp19f-inline-option').forEach((row,i)=>{
   const chosen=i===entry.index;row.classList.toggle('is-current',chosen);row.setAttribute('aria-selected',String(chosen));
  });
   minMarker.hidden=entry.index!==0;
   maxMarker.hidden=entry.index!==select.options.length-1;
  }
  function choose(i,scrollTo=false){
   if(select.disabled)return;
   const n=Math.max(0,Math.min(select.options.length-1,i));
   const changed=n!==select.selectedIndex;entry.index=n;entry.lastSynced=n;
   if(changed){
    select.value=select.options[n].value;
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
    feedback?.picker?.();
   }
   highlight();
   if(scrollTo){entry.busy=true;scroll.scrollTop=n*rowHeight();view?.requestAnimationFrame?.(()=>{entry.busy=false;});}
  }
  scroll.addEventListener('scroll',()=>{
   if(entry.busy||entry.raf||entry.touching)return;
   // iOS changes row heights when rotated; never interpret pixel reflow as a choice.
   if(Math.abs(rowHeight()-entry.lastRowHeight)>.5){refresh();return;}
   beginInlineInteraction();
   scheduleInlineCollapse(450);
   entry.raf=view?.requestAnimationFrame?.(()=>{
    entry.raf=0;choose(wheelIndex(scroll.scrollTop,rowHeight(),select.options.length));
   })||0;
  },{passive:true});
  scroll.addEventListener('keydown',e=>{
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();beginInlineInteraction();choose(entry.index+(e.key==='ArrowDown'?1:-1),true);scheduleInlineCollapse();
   }
   if(e.key==='Home'){e.preventDefault();beginInlineInteraction();choose(0,true);scheduleInlineCollapse();}
   if(e.key==='End'){e.preventDefault();beginInlineInteraction();choose(select.options.length-1,true);scheduleInlineCollapse();}
  });
  highlight();
 }
 function refresh(){
  for(const entry of entries){
   const {select,wheel,scroll}=entry;wheel.classList.toggle('is-disabled',select.disabled);
   if(select.disabled){
    if(entry.settleTimer!==null)view?.clearTimeout?.(entry.settleTimer);
    entry.settleTimer=null;entry.touching=false;wheel.classList.remove('is-engaged');
   }
   scroll.setAttribute('aria-disabled',String(select.disabled));
   // While a finger is down, highlight() owns both boundary markers using
   // the provisional wheel index. The hidden native select is committed only
   // on touchend, so never overwrite the live markers from its stale value.
   if(entry.touching)continue;
   const idx=Math.max(0,select.selectedIndex);
   entry.minMarker.hidden=idx!==0;
   entry.maxMarker.hidden=idx!==select.options.length-1;
   if(scroll.clientHeight===0){entry.lastSynced=NaN;entry.lastRowHeight=NaN;entry.busy=false;continue;}
   const h=parseFloat(view?.getComputedStyle(scroll).getPropertyValue('--wheel-row'))||52;
   if(idx!==entry.lastSynced||Math.abs(entry.lastRowHeight-h)>.5){
    entry.lastSynced=idx;entry.lastRowHeight=h;entry.index=idx;
    // Initial/restored positioning must not trigger the interaction zoom.
    entry.busy=true;
    scroll.scrollTop=idx*h;
    view?.requestAnimationFrame?.(()=>{
     // A second frame sees the new CSS row height after iOS orientation settles.
     const nextHeight=parseFloat(view?.getComputedStyle(scroll).getPropertyValue('--wheel-row'))||52;
     scroll.scrollTop=idx*nextHeight;entry.lastRowHeight=nextHeight;
     view?.requestAnimationFrame?.(()=>{entry.busy=false;});
    });
    scroll.querySelectorAll('.cp19f-inline-option').forEach((row,i)=>{
     row.classList.toggle('is-current',i===idx);row.setAttribute('aria-selected',String(i===idx));
    });
   }
  }
 }
 // Reanchor all four wheels when CSS switches between portrait/landscape rows.
 const reflow=()=>{
  for(const entry of entries)entry.busy=true;
  view?.requestAnimationFrame?.(()=>{
   for(const entry of entries){entry.lastRowHeight=NaN;entry.lastSynced=NaN;}
   refresh();
  });
 };
 view?.addEventListener?.('orientationchange',reflow,{passive:true});
 view?.addEventListener?.('resize',reflow,{passive:true});
 view?.visualViewport?.addEventListener?.('resize',reflow,{passive:true});
 if(view?.ResizeObserver){
  const observer=new view.ResizeObserver(()=>refresh());
  for(const entry of entries)observer.observe(entry.wheel);
 }
 refresh();return {refresh};
}
