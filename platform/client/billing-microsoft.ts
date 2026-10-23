import {PublicClientApplication,InteractionRequiredAuthError} from '@azure/msal-browser';
import type {AccountInfo,AuthenticationResult} from '@azure/msal-browser';
import type {BillingTransport} from '../billing-contracts';
import {outlookConfig,outlookScopes} from '../microsoft-outlook-config';
import {microsoftProfile,microsoftOwnerMatches} from '../billing-microsoft-draft';

const client=new PublicClientApplication({auth:{clientId:outlookConfig.clientId,authority:'https://login.microsoftonline.com/'+outlookConfig.tenantId,redirectUri:outlookConfig.redirectUri},cache:{cacheLocation:'sessionStorage'},system:{loggerOptions:{loggerCallback:()=>{},piiLoggingEnabled:false}}});
let initializing:Promise<void>|undefined;
const initialize=()=>initializing||=(client.initialize());
const normalize=(email:string)=>email.trim().toLowerCase();
const accountFor=(email:string)=>{const accounts=client.getAllAccounts().filter(a=>a.tenantId===outlookConfig.tenantId&&normalize(a.username)===normalize(email));return accounts.length===1?accounts[0]:undefined;};
export async function outlookConnection(transport:BillingTransport){const session=await transport.session();await initialize();return {email:session.email,connected:!!accountFor(session.email)};}
async function verify(result:AuthenticationResult,email:string,transport:BillingTransport){
 const profile=await microsoftProfile(result.accessToken),session=await transport.session();
 if(normalize(session.email)!==normalize(email)||result.account?.tenantId!==outlookConfig.tenantId||!microsoftOwnerMatches(email,profile)){
  if(result.account)await client.clearCache({account:result.account});throw Error('Connectez le compte Microsoft correspondant à votre session CDInnov : '+email+'.');
 }
 return {token:result.accessToken,email,mail:profile.mail||profile.userPrincipalName};
}
export async function connectOutlook(transport:BillingTransport){await initialize();const {email}=await transport.session();const result=await client.loginPopup({scopes:outlookScopes,loginHint:email,prompt:'select_account'});return verify(result,email,transport);}
export async function outlookToken(transport:BillingTransport){await initialize();const {email}=await transport.session(),account=accountFor(email);if(!account)throw Error('Connectez votre compte Outlook pour préparer le brouillon.');
 try{return await verify(await client.acquireTokenSilent({scopes:outlookScopes,account}),email,transport);}catch(e){if(e instanceof InteractionRequiredAuthError)throw Error('Votre connexion Outlook doit être renouvelée. Cliquez sur « Reconnecter Outlook ».');throw e;}
}
export async function disconnectOutlook(transport:BillingTransport){await initialize();const {email}=await transport.session(),account=accountFor(email);if(account)await client.clearCache({account});}
