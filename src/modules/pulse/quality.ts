import { classifyCustomerText, type PulseIntent } from "./classifier";
export type LabeledExample={text:string;intent:PulseIntent|null};
export function evaluatePulseRules(examples:LabeledExample[]){
 const total=examples.length;
 let correct=0,tp=0,fp=0,fn=0,covered=0;
 const mistakes:Array<{text:string;expected:string;actual:string}>=[];
 for(const e of examples){
  const actual=classifyCustomerText(e.text).at(0)?.intent||null;
  if(actual)covered++;
  if(actual===e.intent)correct++;
  if(actual&&actual===e.intent)tp++;
  else if(actual&&actual!==e.intent)fp++;
  else if(!actual&&e.intent)fn++;
  if(actual!==e.intent)mistakes.push({text:e.text,expected:e.intent||"OTHER",actual:actual||"OTHER"});
 }
 return {total,accuracy:total?correct/total:0,coverage:total?covered/total:0,
  precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,mistakes};
}
