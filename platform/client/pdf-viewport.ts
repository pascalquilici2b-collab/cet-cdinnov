/** PDF.js 6 exposes the affine transform, not convertToViewportRectangle. */
export function viewportRectangle(transform:number[],rect:number[]){
 const [a,b,c,d,e,f]=transform,[x1,y1,x2,y2]=rect;
 return [a*x1+c*y1+e,b*x1+d*y1+f,a*x2+c*y2+e,b*x2+d*y2+f];
}
