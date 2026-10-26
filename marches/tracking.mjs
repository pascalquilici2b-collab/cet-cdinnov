import {consumptionForMarket,readAnnualQuotes} from './annual-consumption.mjs';
export async function quoteConsumption(db){
 const table=await db.prepare("SELECT name FROM sqlite_master WHERE name='billing_quote_events'").first();
 const quotes=table?await readAnnualQuotes(db):[],markets=(await db.prepare('SELECT id,payload FROM markets').all()).results;
 return new Map(markets.map(m=>[m.id,consumptionForMarket({...JSON.parse(m.payload),id:m.id},quotes)]));
}
