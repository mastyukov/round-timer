/** Experimental TEST-only cold audio asset warm-up: prioritize only the button.
 * Downloads and decodes BEFORE any user gesture; does not play audio,
 * synthesize touches, change volume or request focus. */
export async function prewarmButtonFirst(entries,loadOne){
 if(!Array.isArray(entries)||typeof loadOne!=='function')throw new TypeError('Invalid prewarm inputs');
 const button=entries.find(([name])=>name==='button');
 if(button)await loadOne(button);
 const other=entries.filter(([name])=>name!=='button');
 await Promise.all(other.map(loadOne));
}
