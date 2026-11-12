/** Pure timer model; durations are seconds and elapsed values are milliseconds. */
export const WORK_CHOICES = [30,60,90,120,180,240,300,360,420,480,540,600];
export const REST_CHOICES = [0,15,30,60,90,120,150,...Array.from({length:15},(_,i)=>180+i*30)];
export const ROUND_CHOICES = [...Array.from({length:12},(_,i)=>i+1), 'infinity'];
export const PREPARE_CHOICES = [0,3,5,10,15,20,30];
export function normalizeConfig(c={}) {
  const choice=(value,allowed,fallback)=>allowed.includes(Number(value))?Number(value):fallback;
  return {
    work:choice(c.work,WORK_CHOICES,120),
    rest:choice(c.rest,REST_CHOICES,30),
    rounds:c.rounds==='infinity'||c.rounds===Infinity?'infinity':choice(c.rounds,ROUND_CHOICES.slice(0,-1),3),
    prepare:choice(c.prepare,PREPARE_CHOICES,0)
  };
}
export function totalDurationMs(c) {
  const x=normalizeConfig(c);
  if (x.rounds==='infinity') return Infinity;
  return (x.prepare+x.work*x.rounds+x.rest*(x.rounds-1))*1000;
}
export function computePhase(rawConfig,elapsedMs) {
  const c=normalizeConfig(rawConfig);
  const elapsed=Math.max(0, Number.isFinite(elapsedMs)?elapsedMs:0);
  const total=totalDurationMs(c);
  const rounds=c.rounds;
  if(elapsed>=total) return {type:'done',key:'done',round:rounds,rounds,remainingMs:0,totalMs:total,durationMs:0};
  let t=elapsed;
  const prepMs=c.prepare*1000;
  if (t<prepMs) return {type:'prepare',key:'prepare',round:1,rounds,remainingMs:prepMs-t,totalMs:total,durationMs:prepMs};
  t-=prepMs;
  const workMs=c.work*1000, restMs=c.rest*1000;
  const cycle=workMs+restMs;
  // Zero-rest intervals and infinite rounds use the same constant-time computation.
  const index=Math.floor(t/cycle);
  const round=index+1;
  const offset=t-index*cycle;
  if(offset<workMs || restMs===0 || (rounds!=='infinity' && round===rounds)) {
    return {type:'work',key:`work-${round}`,round,rounds,remainingMs:Math.max(0,workMs-offset),totalMs:total,durationMs:workMs};
  }
  return {type:'rest',key:`rest-${round}`,round,rounds,remainingMs:cycle-offset,totalMs:total,durationMs:restMs};
}
export function formatTime(ms) {
  const s=Math.max(0,Math.ceil(ms/1000));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
/** Count down ticks: double notices at 30 and 10, then single notices at seconds 5 through 1. */
export function crossedCountdown(prev,now) {
  if(!prev||!now||prev.key!==now.key||prev.type!==now.type) return [];
  if(!['prepare','work','rest'].includes(now.type)) return [];
  const thresholds=[...(now.type==='work'&&now.durationMs>60000?[60]:[]),30,10,5,4,3,2,1];
  return thresholds.filter(sec=>sec*1000<now.durationMs && prev.remainingMs>sec*1000 && now.remainingMs<=sec*1000);
}
