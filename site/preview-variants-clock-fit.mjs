/** Pure CP19-F fit. Drawn width/height, not just CSS scale, determine font size. */
export function fitCP19Clock({width,height,rawWidth,portrait}){
 const scaleX=portrait?1.79:2.87;
 const scaleY=portrait?5.20:2.46;
 const maxWidthRatio=portrait?.994:.987;
 const maxHeightRatio=portrait?.965:.965;
 const x=Math.max(1,rawWidth/100)*scaleX;
 const y=scaleY;
 const fontSize=Math.max(10,Math.min(620,width*maxWidthRatio/x,height*maxHeightRatio/y));
 return {scaleX,scaleY,fontSize,drawnWidth:fontSize*x,drawnHeight:fontSize*y};
}
