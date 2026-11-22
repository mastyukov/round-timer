/** APP-001 Safari iPhone Apple Music interoperability PILOT (TEST only).
 * AudioSession "ambient" asks iOS to mix short timer cues with Apple Music.
 * Does not play, pause, lower volume of, or inspect external music.
 * Not universal: iOS silent switch can mute ambient timer sounds.
 */
export function ensureAmbientAudioSession(navigatorRef){
 try{
  const session=navigatorRef?.audioSession;
  if(!session)return Object.freeze({supported:false,applied:false,changed:false});
  if(session.type==='ambient')return Object.freeze({supported:true,applied:true,changed:false});
  session.type='ambient';
  return Object.freeze({supported:true,applied:session.type==='ambient',changed:true});
 }catch(_){
  return Object.freeze({supported:false,applied:false,changed:false});
 }
}
