type RoutePlaces = {departure:string;stops:string[];arrival:string};
type SharedRoute = {url:string;places?:RoutePlaces};

const mapsHosts=new Set(['www.google.com','google.com','www.google.fr','google.fr','www.google.it','google.it','maps.google.com']);

export function sharedGoogleRoute(input:string):SharedRoute|null{
  let url:URL;
  try{url=new URL(input.trim());}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  const {hostname,pathname,searchParams}=url;
  if(hostname==='maps.app.goo.gl'&&/^\/[\w-]+\/?$/.test(pathname)||
     hostname==='goo.gl'&&/^\/maps\/[\w-]+\/?$/.test(pathname))return {url:url.href};
  if(!mapsHosts.has(hostname)||!/^\/maps\/dir(?:\/|$)/.test(pathname))return null;

  const departure=searchParams.get('origin')?.trim();
  const arrival=searchParams.get('destination')?.trim();
  if(departure&&arrival){
    const stops=(searchParams.get('waypoints')||'').split('|').map(stop=>stop.trim()).filter(Boolean);
    return {url:url.href,places:{departure,stops,arrival}};
  }

  // In a browser's address bar, Maps often writes the named stops as ordered
  // path segments, followed by map coordinates and opaque route metadata.
  const segments=pathname.replace(/^\/maps\/dir\/?/,'').split('/');
  const places:string[]=[];
  for(const segment of segments){
    if(/^(?:@|data=)/.test(segment))break;
    if(!segment){if(!places.length)return {url:url.href};break;}
    try{places.push(decodeURIComponent(segment.replace(/\+/g,' ')).trim());}
    catch{return {url:url.href};}
  }
  if(places.length<2||places.some(place=>!place))return {url:url.href};
  return {url:url.href,places:{departure:places[0],stops:places.slice(1,-1),arrival:places.at(-1)!}};
}

export function displayedKilometres(input:string):number|null{
  const text=input.trim().replace(/\s*km$/i,'').trim();
  if(!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[,.]\d+)?$/.test(text))return null;
  const km=Number(text.replace(/\s/g,'').replace(',','.'));
  return Number.isFinite(km)&&km>0?km:null;
}
