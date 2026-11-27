// A reset is a business-wide cutoff, not an exclusion of every phone.
export function isBeforeWhatsAppReset(reset:Date|null|undefined,occurredAt:Date|null|undefined,historical=false):boolean {
 return Boolean(reset&&(historical||!occurredAt||occurredAt.getTime()<reset.getTime()));
}
