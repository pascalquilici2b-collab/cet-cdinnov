import * as React from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { SheetsBrand } from './sheets-brand';
import { LoadingScreen } from '../../../platform/client/loading';
import type { Session } from './contracts';
import { readSession, signIn, verifySession } from './api';

export function AuthGate({children, application = 'sheets'}: {children?: React.ReactNode; application?: 'sheets' | 'budgets'}) {
  const [session, setSession] = React.useState<Session | null>(readSession);
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [expired, setExpired] = React.useState(false);
  React.useEffect(() => {
    let alive = true, generation = 0;
    const verify = async () => {
      const attempt = ++generation, current = readSession();
      if (!current) { if (alive) {setLoading(false); setExpired(window.CDISession.isExpired());} return; }
      try {
        await verifySession(application);
        if (alive && attempt === generation && readSession()?.sessionId === current.sessionId) {setSession(current);setReady(true);setError('');setExpired(false);}
      } catch (failure) {
        if (alive && attempt === generation) {
          if ((failure as {status?:number}).status === 401) window.CDISession.expire({sessionId:current.sessionId});
          else {setReady(false);setError(failure instanceof Error ? failure.message : 'Connexion impossible.');}
        }
      } finally {if(alive && attempt === generation)setLoading(false);}
    };
    window.CDISession.configure({
      reconnect: async (address, secret) => {
        const next = await signIn(address, secret, false, application);
        if (alive) {setSession(next);setReady(true);setError('');}
        return next;
      },
      onExpired: () => {if (alive) {generation++;setExpired(true);setLoading(false);setPassword('');}},
      onAccountChange: () => {if (alive) {generation++;setReady(false);setSession(null);}},
      onRestored: () => {if (alive) {setExpired(false);void verify();}},
      onLogout: () => {if (alive) {generation++;setReady(false);setSession(null);setLoading(false);setExpired(false);setPassword('');setEmail('');}}
    });
    void verify();
    return () => {alive=false;generation++;};
  }, [application]);
  return <>
    {ready && <div key={session?.email} style={{display:'contents'}}>{children}</div>}
    {!ready && !expired && (loading || busy ? <LoadingScreen connection label="Connexion en cours…"/> :
      <div className="cloud-gate cdi-cloud-gate">
        <a className="cloud-return" href="/"><ArrowLeft size={16}/> Portail CDInnov</a>
        <section className="cloud-login" aria-label="Connexion CDInnov">
          {application === 'sheets' ? <SheetsBrand/> : <h2>Budgets projets</h2>}
          <h1>Connexion</h1>
          <form onSubmit={async event => {
            event.preventDefault();setBusy(true);setError('');
            try {const next=await signIn(email,password,true,application);setSession(next);setReady(true);setPassword('');}
            catch(failure){setError(failure instanceof Error ? failure.message : 'Connexion impossible.');}
            finally {setBusy(false);}
          }}>
            <label>Adresse e-mail<input type="email" autoComplete="username" autoFocus required value={email} onChange={event=>setEmail(event.target.value)}/></label>
            <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>
            {error && <p className="cloud-login-error" role="alert">{error}</p>}
            <button className="primary" disabled={busy}>{busy?'Connexion…':'Se connecter'}</button>
            <small><Lock size={13}/> Utilisez votre compte CDInnov habituel.</small>
          </form>
        </section>
      </div>)}
  </>;
}
