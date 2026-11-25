// APP-001: compensation changes dispatch only, not the timer clock.
export function normalizeBluetoothLead(value){const n=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;return Number.isInteger(n)&&n>=0&&n<=1500&&n%50===0?n:0}
export function plannedCueWindow({config,elapsed,cursor,lead,computePhase,cueForPhaseTransition}){
 if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(cursor)||normalizeBluetoothLead(lead)!==lead||lead===0)return {cursor,events:[]};
 const from=Math.max(cursor,elapsed+lead+8),to=Math.max(from,elapsed+lead+180);
 const events=[];let point=from;
 for(let i=0;i<4&&point<to;i++){
  const phase=computePhase(config,point);if(!phase||phase.type==='done'||!Number.isFinite(phase.remainingMs)||phase.remainingMs<=0)break;
  const end=point+phase.remainingMs;
  const thresholds=[...(phase.type==='work'&&phase.durationMs>60000?[60]:[]),30,10,5,4,3,2,1];
  for(const sec of thresholds){const target=end-sec*1000;if(sec*1000<phase.durationMs&&target>point&&target<=to)events.push({target,type:sec===10?'ten-double':'single'});}
  if(end>to)break;
  const next=computePhase(config,end),type=cueForPhaseTransition(next);if(type)events.push({target:end,type});
  point=end;
 }
 return {cursor:to,events:events.sort((a,b)=>a.target-b.target).map(e=>({...e,offset:Math.max(0,(e.target-elapsed-lead-8)/1000)}))};
}
