import {broadcastResponseToMainFrame} from '@azure/msal-browser/redirect-bridge';
void broadcastResponseToMainFrame().catch(()=>{document.body.textContent='La connexion Microsoft n’a pas abouti. Fermez cette fenêtre et réessayez dans CDInnov.';});
