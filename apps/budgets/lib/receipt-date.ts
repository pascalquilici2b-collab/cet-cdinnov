import type {DR} from "./budget-model.ts";
import {addCalendarMonths} from "./project-dates.ts";

export function receiptDate(dr?:Pick<DR,"certificateDate"|"receiptDate">):string{
  if(dr?.receiptDate)return dr.receiptDate;
  if(!dr?.certificateDate)return "";
  try{return addCalendarMonths(dr.certificateDate,6)}catch{return ""}
}
