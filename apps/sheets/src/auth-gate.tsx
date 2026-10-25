import {SheetsBrand} from './sheets-brand';
import {LoadingScreen} from '../../../platform/client/loading';
import type {
  CellValue,
  Column,
  CellFormat,
  SheetRow,
  Sheet,
  SheetForm,
  Workspace,
  WorkspaceState,
  Widget,
  ResolvedField,
  CellAddress,
  RowFilter,
  DashboardSummary,
  DashboardTask,
} from "./contracts";
import * as React from "react";
import {
  ArrowLeft as IconArrowLeft,
  Lock as IconLock,
} from "lucide-react";
import { apiBase, isCloud, readSession, signIn } from "./api";
export function AuthGate({
  children: childrenProp,
}: {
  children?: React.ReactNode;
}) {
  const [m, h] = React.useState(readSession),
    [o, f] = React.useState(false),
    [v, p] = React.useState(isCloud),
    [R, b] = React.useState(false),
    [M, k] = React.useState(""),
    [x, N] = React.useState(""),
    [V, G] = React.useState(""),
    [H, q] = React.useState(false);
  return (
    React.useEffect(() => {
      let J = true, generation = 0;
      const Z = async () => {
          const attempt = ++generation;
          p(true);
          const ee = readSession();
          if (!ee) {
            J && (h(null), f(false), b(true), p(false));
            return;
          }
          try {
            const Se = await fetch(apiBase + "/sheets/session", {
              headers: { Authorization: "Bearer " + ee.token },
              signal: AbortSignal.timeout(3e4),
            });
            if (!Se.ok)
              throw new Error(
                Se.status === 401
                  ? "Reconnectez-vous avec votre compte CDInnov."
                  : "Le service est indisponible. Réessayez dans un instant.",
              );
            J && attempt === generation && readSession()?.email === ee.email && (h(ee), f(true), b(false), G(""));
          } catch (Se) {
            J && attempt === generation && (b(true), G(Se.message));
          } finally {
            J && attempt === generation && p(false);
          }
        },
        F = () => {
          (++generation, b(true), p(false), N(""));
        },
        P = (ee) => {
          (ee.key === "cet_auth_session" || ee.key === null) && Z();
        };
      return (
        Z(),
        window.addEventListener("cdinnov-session-expired", F),
        window.addEventListener("storage", P),
        () => {
          ((J = false),
            window.removeEventListener("cdinnov-session-expired", F),
            window.removeEventListener("storage", P));
        }
      );
    }, []),
    React.useEffect(() => {
      if (!m) return;
      const J = setTimeout(
        () => b(true),
        Math.max(0, m.expiresAt - Date.now()),
      );
      return () => clearTimeout(J);
    }, [m]),
    (
      <React.Fragment>
        {o && (
          <div
            inert={R || v ? true : void 0}
            aria-hidden={R || v ? true : void 0}
            key={m?.email}
            style={{ display: R || v ? "none" : "contents" }}
          >
            {childrenProp}
          </div>
        )}
        {v || H ? <LoadingScreen connection label="Connexion en cours…"/> : (R || !o) && (
          <div className={"cloud-gate"}>
            <a className={"cloud-return"} href={"/"}>
              <IconArrowLeft size={16} />
              {"Portail CDInnov"}
            </a>
            <section className={"cloud-login"} aria-label={"Connexion CDInnov"}>
              <SheetsBrand/>
              <h1>Connexion</h1>
                <form
                  onSubmit={async (J) => {
                    (J.preventDefault(), q(true), G(""));
                    try {
                      const Z = await signIn(M, x);
                      (N(""), h(Z), f(true), b(false));
                    } catch (Z) {
                      G(Z.message);
                    } finally {
                      q(false);
                    }
                  }}
                >
                  <label>
                    {"Adresse e-mail"}
                    <input
                      type={"email"}
                      autoComplete={"username"}
                      autoFocus={true}
                      required={true}
                      value={M}
                      onChange={(J) =>
                        k(
                          (
                            J.target as
                              | HTMLInputElement
                              | HTMLSelectElement
                              | HTMLTextAreaElement
                          ).value,
                        )
                      }
                    />
                  </label>
                  <label>
                    {"Mot de passe"}
                    <input
                      type={"password"}
                      autoComplete={"current-password"}
                      required={true}
                      value={x}
                      onChange={(J) =>
                        N(
                          (
                            J.target as
                              | HTMLInputElement
                              | HTMLSelectElement
                              | HTMLTextAreaElement
                          ).value,
                        )
                      }
                    />
                  </label>
                  {V && (
                    <p className={"cloud-login-error"} role={"alert"}>
                      {V}
                    </p>
                  )}
                  <button className={"primary"} disabled={H}>
                    {H ? "Connexion…" : "Se connecter"}
                  </button>
                  <small>
                    <IconLock size={13} />
                    {"Utilisez votre compte CDInnov habituel."}
                  </small>
                </form>
            </section>
          </div>
        )}
      </React.Fragment>
    )
  );
}
