import {markup} from './icons';
/** Only static, reviewed pictograms from icons.ts are inserted here. */
export function Icon({name}:{name:string}){
  return <span className="cdi-icon-wrap" aria-hidden="true" dangerouslySetInnerHTML={{__html:markup(name)}}/>;
}
