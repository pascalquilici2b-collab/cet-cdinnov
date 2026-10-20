/** Shared visual mark; the enclosing status or button supplies its accessible label. */
export function BrandMark(){return <span className="cdi-bolt" aria-hidden="true"/>;}

export function Loading({label='Chargement…',compact=false}:{label?:string;compact?:boolean}){
 return <div className={'cdi-loading'+(compact?' cdi-loading--compact':'')} role="status">
  <BrandMark/><span className="cdi-loading-label">{label}</span>
 </div>;
}

export function LoadingScreen({label='Chargement…'}:{label?:string}){
 return <div className="cdi-loading-screen" role="status">
  <BrandMark/><span className="cdi-loading-sr">{label}</span>
 </div>;
}
