import type { Client } from "./budget-model.ts";
import { canonicalClientName, sameClientName, validClientName } from "./client-names.mjs";

export const clientNameKey = (name:string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
export const clientMatches = (client:Client,name:string) => [client.name,...client.aliases||[]].some(value=>sameClientName(value,name));

export function saveClient(clients:Client[], draft:{id?:string;name:string;logo?:string}):Client[] {
  const name=canonicalClientName(draft.name);
  if(!validClientName(name))throw new Error("Renseignez le nom de l’organisme client.");
  if(clients.some(c=>c.id!==draft.id&&clientMatches(c,name)))throw new Error("Ce client existe déjà. Sélectionnez sa fiche pour la modifier.");
  const previous=clients.find(c=>c.id===draft.id);
  if(draft.id&&!previous)throw new Error("Ce client n’existe plus. Rouvrez le répertoire.");
  const client:Client={...previous,id:previous?.id||crypto.randomUUID(),name,logo:draft.logo,accounts:previous?.accounts||[],aliases:previous&&previous.name!==name?[...new Set([...(previous.aliases||[]),previous.name])]:previous?.aliases};
  return previous?clients.map(c=>c.id===client.id?client:c):[...clients,client];
}
