/**
 * APP-001 CP18: isolated TEST-only late button cue A/B.
 * This is a freshness policy, NOT a requested output delay.
 * Only the explicitly allow-listed URL parameters are enabled.
 */
export function cp18WindowFromSearch(search=''){
  const p=new URLSearchParams(String(search||'')).get('cp18');
  return p==='0'?0:p==='30'?30:null;
}
export function deferredButtonCueAllowed(ageMs,windowMs){
  return Number.isFinite(ageMs) && ageMs>=0 &&
    Number.isFinite(windowMs) && windowMs>0 && ageMs<=windowMs;
}
