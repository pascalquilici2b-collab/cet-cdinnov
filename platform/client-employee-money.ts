/** Exact decimal allocation, rounded to cents like Excel ROUND for positive amounts. */
export function allocatedAmount(cost:string,percent:string):number {
 const scaled=(v:string)=>{const [whole,decimal='']=v.replace(',','.').split('.');return BigInt(whole||'0')*100n+BigInt(decimal.padEnd(2,'0'));};
 return Number((scaled(cost)*scaled(percent)+5000n)/10000n)/100;
}
