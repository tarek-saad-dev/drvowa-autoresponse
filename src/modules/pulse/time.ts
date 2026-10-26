export type PulsePeriod = "today" | "month";
function parts(date: Date, timezone: string) {
 const fmt = new Intl.DateTimeFormat("en-GB",{ timeZone:timezone, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" });
 const v = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type,Number(x.value)]));
 return {y:v.year,m:v.month,d:v.day,h:v.hour,min:v.minute,s:v.second};
}
function localMidnight(y:number,m:number,d:number,timezone:string) {
 const target=Date.UTC(y,m-1,d);
 let candidate=target;
 for(let i=0;i<3;i++){
  const p=parts(new Date(candidate),timezone);
  const projected=Date.UTC(p.y,p.m-1,p.d,p.h,p.min,p.s);
  candidate+=target-projected;
 }
 return new Date(candidate);
}
export function pulseBounds(period:PulsePeriod,timezone:string,now=new Date()) {
 let zone=timezone;
 try { new Intl.DateTimeFormat("en-US",{timeZone:zone}); } catch {zone="Africa/Cairo";}
 const p=parts(now,zone);
 const start=period==="month"?localMidnight(p.y,p.m,1,zone):localMidnight(p.y,p.m,p.d,zone);
 const next=period==="month"?new Date(Date.UTC(p.y,p.m,1)):new Date(Date.UTC(p.y,p.m-1,p.d+1));
 const end=localMidnight(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate(),zone);
 return {start,end,zone};
}
