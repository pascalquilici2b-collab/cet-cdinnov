import {PublicClientApplication,InteractionRequiredAuthError} from '@azure/msal-browser';
import type {AccountInfo,AuthenticationResult} from '@azure/msal-browser';
import type {BillingTransport} from '../billing-contracts';
import {outlookConfig,outlookScopes,outlookSendScopes} from '../microsoft-outlook-config';
import {microsoftProfile,microsoftOwnerMatches} from '../billing-microsoft-draft';

const client=new PublicClientApplication({auth:{clientId:outlookConfig.clientId,authority:'https://login.microsoftonline.com/'+outlookConfig.tenantId,redirectUri:outlookConfig.redirectUri},cache:{cacheLocation:'sessionStorage'},system:{popupBridgeTimeout:600000,loggerOptions:{loggerCallback:()=>{},piiLoggingEnabled:false}}});
let initializing:Promise<void>|undefined;
const initialize=()=>initializing||=(client.initialize());
const normalize=(email:string)=>email.trim().toLowerCase();
const accountFor=(email:string)=>{const accounts=client.getAllAccounts().filter(a=>a.tenantId===outlookConfig.tenantId&&normalize(a.username)===normalize(email));return accounts.length===1?accounts[0]:undefined;};
export async function outlookConnection(transport:BillingTransport){const session=await transport.session();await initialize();const account=accountFor(session.email);let sendEnabled=false;if(account){try{const result=await client.acquireTokenSilent({scopes:outlookSendScopes,account});sendEnabled=result.scopes.some(s=>s.toLowerCase()==='mail.send');}catch{/* Consent is requested only by an explicit user action. */}}return {email:session.email,connected:!!account,sendEnabled};}
async function verify(result:AuthenticationResult,email:string,transport:BillingTransport){
 const profile=await microsoftProfile(result.accessToken),session=await transport.session();
 if(normalize(session.email)!==normalize(email)||result.account?.tenantId!==outlookConfig.tenantId||!microsoftOwnerMatches(email,profile)){
  if(result.account)await client.clearCache({account:result.account});throw Error('Connectez le compte Microsoft correspondant à votre session CDInnov : '+email+'.');
 }
 return {token:result.accessToken,email,mail:profile.mail||profile.userPrincipalName,sendEnabled:result.scopes.some(s=>s.toLowerCase()==='mail.send')};
}
export async function connectOutlook(transport:BillingTransport,send=false){await initialize();const {email}=await transport.session();const result=await client.loginPopup({scopes:send?outlookSendScopes:outlookScopes,loginHint:email,prompt:'select_account'});return verify(result,email,transport);}
export async function outlookToken(transport:BillingTransport,send=false){await initialize();const {email}=await transport.session(),account=accountFor(email);if(!account)throw Error('Connectez votre compte Outlook pour préparer le brouillon.');
 try{const result=await verify(await client.acquireTokenSilent({scopes:send?outlookSendScopes:outlookScopes,account}),email,transport);if(send&&!result.sendEnabled)throw Error('Activez l’envoi Outlook pour ce compte.');return result;}catch(e){if(e instanceof InteractionRequiredAuthError)throw Error(send?'Activez l’envoi Outlook pour ce compte.':'Votre connexion Outlook doit être renouvelée. Cliquez sur « Reconnecter Outlook ».');throw e;}
}
export async function disconnectOutlook(transport:BillingTransport){await initialize();const {email}=await transport.session(),account=accountFor(email);if(account)await client.clearCache({account});}
