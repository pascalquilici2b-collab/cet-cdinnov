/** Web Locks coordinate the same account/document across tabs on this origin.
 * Without that shared lock, existing receipts remain readable; a fresh dispatch
 * must use the user's Outlook draft or downloaded message instead.
 */
export async function withMicrosoftSendLock<T>(key:string,run:(dispatchAllowed:boolean)=>Promise<T>):Promise<T>{
 const locks=typeof navigator!=='undefined'?navigator.locks:undefined;
 return locks?await locks.request(key,()=>run(true)):await run(false);
}
export const microsoftSendLockMessage='L’envoi direct n’est pas disponible dans ce navigateur. Créez un brouillon Outlook ou téléchargez le message, puis envoyez-le depuis Outlook.';
