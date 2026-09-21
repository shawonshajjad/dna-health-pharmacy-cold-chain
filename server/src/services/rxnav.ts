type Result={valid:boolean;rxcui:string|null;candidates:string[];matchedName:string|null;expectedRxcui:string|null;matchType:'normalized'|'approximate'|'expected'|'rxcui'|null;error?:string};
type SearchResult={rxcui:string;name:string};
const base=()=>process.env.RXNAV_BASE_URL||'https://rxnav.nlm.nih.gov/REST';

export async function getRxNormConceptName(rxcui:string):Promise<string|null>{
  if(!rxcui)return null;
  try{
    const response=await fetch(`${base()}/rxcui/${encodeURIComponent(rxcui)}.json`);
    if(!response.ok)return null;
    const json:any=await response.json();
    const name=json?.idGroup?.name;
    return name?String(name).trim():null;
  }catch{return null;}
}

async function normalizedLookup(term:string):Promise<string[]>{
  const response=await fetch(`${base()}/rxcui.json?name=${encodeURIComponent(term)}&search=2`);
  if(!response.ok)throw new Error(`RxNav lookup failed (${response.status})`);
  const json:any=await response.json();
  return [...new Set<string>((json?.idGroup?.rxnormId||[]).map((id:any)=>String(id)))];
}

async function approximateLookup(term:string,maxEntries=50):Promise<string[]>{
  const response=await fetch(`${base()}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=${maxEntries}&option=1`);
  if(!response.ok)throw new Error(`RxNav approximate lookup failed (${response.status})`);
  const json:any=await response.json();
  return [...new Set<string>((json?.approximateGroup?.candidate||[]).map((item:any)=>String(item?.rxcui||'')).filter(Boolean))];
}

export async function validateRxCui(rxcui:string,expectedRxcui?:string|null):Promise<Result>{
  const selected=String(rxcui||'').trim();
  const expected=expectedRxcui?String(expectedRxcui):null;
  if(!selected)return {valid:false,rxcui:null,candidates:[],matchedName:null,expectedRxcui:expected,matchType:null,error:'RxCUI is required'};
  try{
    const matchedName=await getRxNormConceptName(selected);
    const exists=Boolean(matchedName);
    const valid=exists&&(!expected||selected===expected);
    return {valid,rxcui:selected,candidates:exists?[selected]:[],matchedName,expectedRxcui:expected,matchType:valid?(expected?'expected':'rxcui'):'rxcui',...(!exists?{error:'RxNorm concept was not found'}:{})};
  }catch(error:any){return {valid:false,rxcui:selected,candidates:[],matchedName:null,expectedRxcui:expected,matchType:null,error:error?.message||'RxNav unavailable'};}
}

export async function validateRxNorm(name:string,expectedRxcui?:string|null):Promise<Result>{
  const term=name.trim();
  if(!term)return {valid:false,rxcui:null,candidates:[],matchedName:null,expectedRxcui:expectedRxcui||null,matchType:null,error:'Medication name is required'};
  try{
    let candidates=await normalizedLookup(term);
    let matchType:'normalized'|'approximate'|'expected'='normalized';
    if(!candidates.length){candidates=await approximateLookup(term,20);matchType='approximate';}
    let selected=candidates[0]||null;
    let valid=candidates.length>0;
    if(expectedRxcui){const expected=String(expectedRxcui);valid=candidates.includes(expected);if(valid){selected=expected;matchType='expected';}}
    const matchedName=selected?await getRxNormConceptName(selected):null;
    return {valid,rxcui:selected,candidates,matchedName,expectedRxcui:expectedRxcui||null,matchType};
  }catch(error:any){return {valid:false,rxcui:null,candidates:[],matchedName:null,expectedRxcui:expectedRxcui||null,matchType:null,error:error?.message||'RxNav unavailable'};}
}

export async function searchRxNorm(term:string):Promise<SearchResult[]>{
  const raw=term.trim();const q=raw.toLowerCase();if(q.length<3)return [];
  let ids=await approximateLookup(raw,100);if(!ids.length)return [];ids=ids.slice(0,50);
  const resolved=await Promise.all(ids.map(async rxcui=>{const name=await getRxNormConceptName(rxcui);return name?{rxcui,name}:null;}));
  const unique=Array.from(new Map(resolved.filter((x):x is SearchResult=>x!==null).map(item=>[item.rxcui,item])).values());
  const starts:SearchResult[]=[],wordStarts:SearchResult[]=[],contains:SearchResult[]=[];
  for(const item of unique){const name=item.name.toLowerCase();if(name.startsWith(q)){starts.push(item);continue;}const words=name.split(/[\s/()[\],+\-]+/);if(words.some(w=>w.startsWith(q))){wordStarts.push(item);continue;}if(name.includes(q))contains.push(item);}
  const sort=(a:SearchResult,b:SearchResult)=>a.name.localeCompare(b.name);starts.sort(sort);wordStarts.sort(sort);contains.sort(sort);
  const ranked=[...starts,...wordStarts,...contains];const seen=new Set<string>();const out:SearchResult[]=[];
  for(const item of ranked){const key=item.name.trim().toLowerCase();if(seen.has(key))continue;seen.add(key);out.push(item);if(out.length>=12)break;}
  return out;
}
