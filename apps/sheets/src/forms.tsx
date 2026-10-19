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
  ArrowDown as IconArrowDown,
  ArrowLeft as IconArrowLeft,
  ArrowUp as IconArrowUp,
  Check as IconCheck,
  CircleCheck as IconCircleCheck,
  Copy as IconCopy,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  FileText as IconFileText,
  PenLine as IconPenLine,
  Plus as IconPlus,
  X as IconX,
} from "lucide-react";
import {
  createForm,
  formFields,
  formValues,
  readFormData,
  validateForm,
} from "./dashboard-domain";
import { EditableText } from "./dashboard-view";
export function FormFieldInput({
  field: fieldProp,
  value: valueProp,
  onChange: onChangeProp = undefined,
  disabled: disabledProp = false,
  error: errorProp = undefined,
  idPrefix: idPrefixProp = "form",
}) {
  const p = `${idPrefixProp}-${fieldProp.columnId}`,
    R = {
      id: p,
      name: fieldProp.columnId,
      disabled: disabledProp,
      "aria-required": !!fieldProp.required,
      "aria-invalid": !!errorProp,
      "aria-describedby": errorProp
        ? `${p}-error`
        : fieldProp.description
          ? `${p}-hint`
          : void 0,
    },
    b = (M) =>
      onChangeProp?.(
        (M.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)
          .value,
      );
  return (
    <div className={`iv-form-field ${errorProp ? "iv-field-error" : ""}`}>
      {fieldProp.column.type !== "checkbox" && (
        <label htmlFor={p}>
          {fieldProp.label}
          {fieldProp.required && <span className={"iv-required"}>{" *"}</span>}
        </label>
      )}
      {fieldProp.description && (
        <p id={`${p}-hint`} className={"iv-field-hint"}>
          {fieldProp.description}
        </p>
      )}
      {fieldProp.column.type === "checkbox" ? (
        <label className={"iv-checkbox-label"}>
          <input
            {...R}
            type={"checkbox"}
            checked={valueProp === true}
            onChange={(M) => onChangeProp?.(M.target.checked)}
          />
          <span>
            {fieldProp.label}
            {fieldProp.required && (
              <span className={"iv-required"}>{" *"}</span>
            )}
          </span>
        </label>
      ) : fieldProp.column.type === "select" ? (
        <select {...R} value={valueProp ?? ""} onChange={b}>
          <option value={""}>{"Sélectionnez une option"}</option>
          {(fieldProp.column.options || []).map((M) => (
            <option value={M} key={M}>
              {M}
            </option>
          ))}
        </select>
      ) : fieldProp.column.type === "date" ? (
        <input
          {...R}
          type={"date"}
          value={valueProp ?? ""}
          onInput={b}
          onChange={b}
        />
      ) : fieldProp.column.type === "number" ? (
        <input
          {...R}
          type={"text"}
          inputMode={"decimal"}
          value={valueProp ?? ""}
          placeholder={fieldProp.placeholder || "0"}
          onChange={b}
        />
      ) : (
        <input
          {...R}
          type={"text"}
          value={valueProp ?? ""}
          placeholder={fieldProp.placeholder || ""}
          onChange={b}
        />
      )}
      {errorProp && (
        <p id={`${p}-error`} className={"iv-error-text"} role={"alert"}>
          {errorProp}
        </p>
      )}
    </div>
  );
}
export function FormBuilder({
  sheet: sheetProp,
  onChange: onChangeProp,
  onClose: onCloseProp,
  onPreview: onPreviewProp,
}) {
  const [f, v] = React.useState(() => sheetProp.forms || []),
    [p, R] = React.useState(sheetProp.forms?.[0]?.id || null),
    [b, M] = React.useState("list"),
    [k, x] = React.useState(""),
    [N, V] = React.useState(null),
    [G, H] = React.useState("fields"),
    [q, J] = React.useState(""),
    [Z, F] = React.useState(""),
    [P, ee] = React.useState(false),
    Se = React.useRef(null),
    re = React.useRef(null),
    ue = f.find((Y) => Y.id === p) || f[0] || null,
    be = ue ? formFields(sheetProp, ue) : [],
    ge = be.find((Y) => Y.columnId === N),
    we = f.filter((Y) =>
      Y.title
        .toLocaleLowerCase("fr")
        .includes(k.trim().toLocaleLowerCase("fr")),
    ),
    Te = (Y) => {
      (v(Y), onChangeProp?.({ ...sheetProp, forms: Y }));
    },
    Oe = (Y) => {
      ue && Te(f.map((g) => (g.id === ue.id ? { ...g, ...Y } : g)));
    },
    Ye = (Y, g) =>
      Oe({
        fields: be.map(({ column: B, ...ie }) =>
          ie.columnId === Y ? { ...ie, ...g } : ie,
        ),
      }),
    ke = (Y, g) => {
      const B = be.findIndex((te) => te.columnId === Y);
      if (B < 0 || B + g < 0 || B + g >= be.length) return;
      const ie = be.map(({ column: te, ...T }) => T);
      (([ie[B], ie[B + g]] = [ie[B + g], ie[B]]), Oe({ fields: ie }));
    },
    C = (Y) => {
      (R(Y.id), V(null), H("fields"), ee(false), M("edit"));
    },
    ne = () => {
      const Y = createForm(sheetProp);
      ((Y.title = f.length
        ? `Formulaire ${f.length + 1} \u2014 ${sheetProp.name}`
        : `Formulaire \u2014 ${sheetProp.name}`),
        Te([...f, Y]),
        C(Y));
    },
    I = (Y) => {
      Y && onPreviewProp?.(Y);
    },
    ve = () => onCloseProp?.(),
    ye = () => {
      (M("list"), V(null), ee(false));
    },
    et = async (Y) => {
      if (!Y) return;
      const g = `${window.location.origin}${window.location.pathname}#/form/${encodeURIComponent(sheetProp.id)}/${encodeURIComponent(Y.id)}`;
      (F(g), ee(true), J(`Lien de \xAB ${Y.title} \xBB`));
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("Presse-papiers indisponible");
        (await navigator.clipboard.writeText(g),
          J(`Lien copi\xE9 \u2014 ${Y.title}`));
      } catch {
        J("Sélectionnez et copiez ce lien.");
      }
    };
  (React.useEffect(() => {
    (v(sheetProp.forms || []),
      R(sheetProp.forms?.[0]?.id || null),
      M("list"),
      V(null),
      ee(false),
      x(""));
  }, [sheetProp.id]),
    React.useEffect(() => {
      re.current?.focus();
    }, [b]),
    React.useEffect(() => {
      const Y = (g) => {
        if (
          !document.querySelector(".iv-public-form") &&
          (g.key === "Escape" && (P ? ee(false) : b === "edit" ? ye() : ve()),
          g.key === "Tab" && Se.current)
        ) {
          const B = [
              ...(Se.current as HTMLElement).querySelectorAll<HTMLElement>(
                'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
              ),
            ].filter((T) => T.offsetParent !== null),
            ie = B[0],
            te = B.at(-1);
          g.shiftKey &&
          ((document.activeElement as HTMLElement) === ie ||
            (document.activeElement as HTMLElement) === re.current)
            ? (g.preventDefault(), te?.focus())
            : !g.shiftKey &&
              (document.activeElement as HTMLElement) === te &&
              (g.preventDefault(), ie?.focus());
        }
      };
      return (
        document.addEventListener("keydown", Y),
        () => document.removeEventListener("keydown", Y)
      );
    }));
  const Xe = P && (
    <div className={"iv-copy-link-panel"}>
      <div>
        <span role={"status"}>{q}</span>
        <button
          className={"iv-icon-button"}
          onClick={() => ee(false)}
          aria-label={"Masquer le lien"}
        >
          <IconX size={15} />
        </button>
      </div>
      <input
        readOnly={true}
        aria-label={"Lien du formulaire"}
        value={Z}
        onFocus={(Y) => Y.target.select()}
      />
      <small>
        {"Une connexion CDInnov est requise pour ouvrir ce formulaire."}
      </small>
    </div>
  );
  return b === "list" || !ue ? (
    <div className={"iv-modal-backdrop iv-manager-backdrop"}>
      <section
        ref={Se}
        className={"iv-form-manager"}
        role={"dialog"}
        aria-modal={"true"}
        aria-labelledby={"iv-forms-manager-title"}
      >
        <header className={"iv-manager-header"}>
          <div>
            <h1 id={"iv-forms-manager-title"} ref={re} tabIndex={-1}>
              {"Formulaires"}
            </h1>
            <p>{sheetProp.name}</p>
          </div>
          <button
            className={"iv-icon-button"}
            onClick={ve}
            aria-label={"Fermer les formulaires"}
          >
            <IconX size={20} />
          </button>
        </header>
        <div className={"iv-manager-toolbar"}>
          <div className={"iv-form-search"}>
            <IconFileText size={15} />
            <input
              value={k}
              onChange={(Y) =>
                x(
                  (
                    Y.target as
                      | HTMLInputElement
                      | HTMLSelectElement
                      | HTMLTextAreaElement
                  ).value,
                )
              }
              placeholder={"Rechercher un formulaire"}
              aria-label={"Rechercher un formulaire"}
            />
          </div>
          <button className={"iv-btn iv-primary"} onClick={ne}>
            <IconPlus size={16} />
            {"Créer un formulaire"}
          </button>
        </div>
        {Xe}
        <div className={"iv-manager-content"}>
          {f.length ? (
            we.length ? (
              <table className={"iv-manager-table"}>
                <thead>
                  <tr>
                    <th>{"Nom du formulaire"}</th>
                    <th>{"Réponses"}</th>
                    <th>{"Champs"}</th>
                    <th>
                      <span className={"iv-visually-hidden"}>{"Actions"}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {we.map((Y) => (
                    <tr key={Y.id}>
                      <td>
                        <div className={"iv-managed-form-name"}>
                          <IconFileText size={19} />
                          <div>
                            <button
                              className={"iv-form-name-link"}
                              onClick={() => C(Y)}
                            >
                              {Y.title}
                            </button>
                            {Y.description && <span>{Y.description}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <label className={"iv-form-active-toggle"}>
                          <input
                            type={"checkbox"}
                            checked={Y.active !== false}
                            onChange={(g) =>
                              Te(
                                f.map((B) =>
                                  B.id === Y.id
                                    ? {
                                        ...B,
                                        active: g.target.checked,
                                      }
                                    : B,
                                ),
                              )
                            }
                            aria-label={`Accepter les r\xE9ponses : ${Y.title}`}
                          />
                          <span>
                            {Y.active !== false ? "Activées" : "Désactivées"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <span className={"iv-field-count"}>
                          {
                            formFields(sheetProp, Y).filter((g) => !g.hidden)
                              .length
                          }
                        </span>
                      </td>
                      <td>
                        <div className={"iv-manager-row-actions"}>
                          <button
                            className={"iv-btn iv-quiet"}
                            onClick={() => C(Y)}
                            aria-label={`Modifier ${Y.title}`}
                          >
                            <IconPenLine size={14} />
                            {"Modifier"}
                          </button>
                          <button
                            className={"iv-icon-button"}
                            onClick={() => I(Y)}
                            aria-label={`Ouvrir ${Y.title}`}
                            title={"Ouvrir le formulaire"}
                          >
                            <IconEye size={16} />
                          </button>
                          <button
                            className={"iv-icon-button"}
                            onClick={() => et(Y)}
                            aria-label={`Copier le lien de ${Y.title}`}
                            title={"Copier le lien"}
                          >
                            <IconCopy size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={"iv-manager-empty"}>
                <IconFileText size={30} />
                <h2>{"Aucun formulaire trouvé"}</h2>
                <p>{"Essayez un autre nom."}</p>
                <button className={"iv-btn"} onClick={() => x("")}>
                  {"Effacer la recherche"}
                </button>
              </div>
            )
          ) : (
            <div className={"iv-manager-empty"}>
              <IconFileText size={36} strokeWidth={1.25} />
              <h2>{"Créez votre premier formulaire"}</h2>
              <p>
                {
                  "Chaque réponse sera ajoutée comme nouvelle ligne dans cette feuille."
                }
              </p>
              <button className={"iv-btn"} onClick={ne}>
                <IconPlus size={15} />
                {"Créer le premier formulaire"}
              </button>
            </div>
          )}
        </div>
        <footer className={"iv-manager-footer"}>
          <span>
            {
              "Formulaires locaux · Les réponses restent dans cette application."
            }
          </span>
          <button className={"iv-btn"} onClick={ve}>
            {"Fermer"}
          </button>
        </footer>
      </section>
    </div>
  ) : (
    <div className={"iv-modal-backdrop iv-editor-backdrop"}>
      <section
        ref={Se}
        className={"iv-form-builder iv-form-editor"}
        role={"dialog"}
        aria-modal={"true"}
        aria-label={"Éditeur de formulaire"}
      >
        <header className={"iv-builder-header"}>
          <div className={"iv-editor-breadcrumb"}>
            <button className={"iv-back-to-forms"} onClick={ye}>
              <IconArrowLeft size={17} />
              {"Formulaires"}
            </button>
            <span className={"iv-breadcrumb-divider"} />
            <div>
              <h1 ref={re} tabIndex={-1}>
                {ue.title}
              </h1>
              <p>{sheetProp.name}</p>
            </div>
          </div>
          <div className={"iv-builder-actions"}>
            <button className={"iv-btn iv-quiet"} onClick={() => et(ue)}>
              <IconCopy size={15} />
              {"Copier le lien"}
            </button>
            <button className={"iv-btn"} onClick={() => I(ue)}>
              <IconEye size={15} />
              {"Ouvrir le formulaire"}
            </button>
            <button className={"iv-btn iv-primary"} onClick={ye}>
              <IconCheck size={15} />
              {"Terminer"}
            </button>
            <button
              className={"iv-icon-button"}
              onClick={ve}
              aria-label={"Fermer l’éditeur de formulaires"}
            >
              <IconX size={19} />
            </button>
          </div>
        </header>
        {Xe}
        <div className={"iv-builder-body"}>
          <aside className={"iv-builder-sidebar"}>
            <div className={"iv-sidebar-tabs"}>
              <button
                className={G === "fields" ? "iv-tab-active" : ""}
                onClick={() => H("fields")}
              >
                {"Champs"}
              </button>
              <button
                className={G === "settings" ? "iv-tab-active" : ""}
                onClick={() => {
                  (H("settings"), V(null));
                }}
              >
                {"Paramètres"}
              </button>
            </div>
            {G === "fields" ? (
              <React.Fragment>
                <div className={"iv-sidebar-heading"}>
                  <h2>{"Champs du formulaire"}</h2>
                  <span>{be.filter((Y) => !Y.hidden).length}</span>
                </div>
                <p className={"iv-sidebar-help"}>
                  {"Sélectionnez un champ pour modifier ses propriétés."}
                </p>
                <div className={"iv-field-list"}>
                  {be.map((Y) => (
                    <div
                      className={`iv-field-row ${Y.hidden ? "iv-field-hidden" : ""} ${N === Y.columnId ? "iv-field-selected" : ""}`}
                      key={Y.columnId}
                    >
                      <button
                        className={"iv-field-select"}
                        onClick={() => V(Y.columnId)}
                      >
                        <IconFileText size={14} />
                        <span>
                          {Y.label}
                          {Y.required && !Y.hidden ? " *" : ""}
                        </span>
                      </button>
                      <button
                        className={"iv-icon-button"}
                        onClick={() => Ye(Y.columnId, { hidden: !Y.hidden })}
                        title={
                          Y.hidden ? "Afficher le champ" : "Masquer le champ"
                        }
                        aria-label={`${Y.hidden ? "Afficher" : "Masquer"} ${Y.label}`}
                      >
                        {Y.hidden ? (
                          <IconEyeOff size={15} />
                        ) : (
                          <IconEye size={15} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                {(sheetProp.columns || [])
                  .filter((Y) => !be.some((g) => g.columnId === Y.id))
                  .map((Y) => (
                    <button
                      className={"iv-add-field"}
                      onClick={() =>
                        Oe({
                          fields: [
                            ...be.map(({ column: g, ...B }) => B),
                            {
                              columnId: Y.id,
                              label: Y.title,
                              required: false,
                            },
                          ],
                        })
                      }
                      key={Y.id}
                    >
                      <IconPlus size={14} />
                      {Y.title}
                    </button>
                  ))}
              </React.Fragment>
            ) : (
              <div className={"iv-form-settings"}>
                <label className={"iv-checkbox-label"}>
                  <input
                    type={"checkbox"}
                    checked={ue.active !== false}
                    onChange={(Y) => Oe({ active: Y.target.checked })}
                  />
                  <span>{"Accepter les réponses"}</span>
                </label>
                <p className={"iv-hint"}>
                  {"Les réponses sont ajoutées à cette feuille"}
                  {" dans l’espace partagé."}
                </p>
                <label className={"iv-label"}>
                  {"Message après envoi"}
                  <textarea
                    rows={4}
                    value={ue.successMessage || ""}
                    placeholder={
                      "Merci ! Votre réponse a bien été ajoutée à la feuille."
                    }
                    onChange={(Y) =>
                      Oe({
                        successMessage: (
                          Y.target as
                            | HTMLInputElement
                            | HTMLSelectElement
                            | HTMLTextAreaElement
                        ).value,
                      })
                    }
                  />
                </label>
                <div className={"iv-local-info"}>
                  {
                    "Ce formulaire est accessible aux comptes CDInnov autorisés."
                  }
                </div>
              </div>
            )}
          </aside>
          <main className={"iv-builder-canvas"}>
            <div className={"iv-canvas-label"}>
              <IconEye size={14} />
              {"Aperçu"}
              <span>
                {be.filter((Y) => !Y.hidden).length}
                {" champs"}
              </span>
            </div>
            <div className={"iv-form-paper"}>
              <div className={"iv-paper-stripe"} />
              <div className={"iv-form-paper-content"}>
                <EditableText
                  className={"iv-form-title-input"}
                  aria-label={"Titre du formulaire"}
                  value={ue.title}
                  onCommit={(Y) => Oe({ title: Y })}
                  placeholder={"Titre du formulaire"}
                  key={ue.id}
                />
                <textarea
                  className={"iv-form-description-input"}
                  aria-label={"Description du formulaire"}
                  rows={2}
                  value={ue.description || ""}
                  onChange={(Y) =>
                    Oe({
                      description: (
                        Y.target as
                          | HTMLInputElement
                          | HTMLSelectElement
                          | HTMLTextAreaElement
                      ).value,
                    })
                  }
                  placeholder={"Ajoutez une description."}
                />
                <p className={"iv-required-note"}>
                  {"Les champs marqués d’un "}
                  <span>{"*"}</span>
                  {" sont obligatoires."}
                </p>
                {be
                  .filter((Y) => !Y.hidden)
                  .map((Y) => (
                    <div
                      className={`iv-preview-field ${Y.columnId === N ? "iv-preview-selected" : ""}`}
                      onClick={() => {
                        (V(Y.columnId), H("fields"));
                      }}
                      key={Y.columnId}
                    >
                      <FormFieldInput
                        field={Y}
                        value={Y.column.type === "checkbox" ? false : ""}
                        disabled={true}
                        idPrefix={`preview-${ue.id}`}
                      />
                      <button
                        className={"iv-preview-edit"}
                        aria-label={`Configurer le champ ${Y.label}`}
                        title={`Configurer ${Y.label}`}
                        onClick={() => {
                          (V(Y.columnId), H("fields"));
                        }}
                      >
                        <IconPenLine size={13} />
                        {"Modifier"}
                      </button>
                    </div>
                  ))}
                {!be.some((Y) => !Y.hidden) && (
                  <p className={"iv-no-fields"}>
                    {"Affichez des champs depuis la liste à gauche."}
                  </p>
                )}
                <button
                  className={"iv-btn iv-primary iv-submit-button"}
                  onClick={() => I(ue)}
                >
                  {"Ouvrir pour remplir"}
                </button>
              </div>
            </div>
            <div className={"iv-form-footer-logo"}>
              <IconFileText size={14} />
              {"Formulaire"}
            </div>
          </main>
          <aside className={"iv-field-settings"}>
            <h2>
              {ge && G === "fields" ? "Propriétés du champ" : "Propriétés"}
            </h2>
            {ge && G === "fields" ? (
              <React.Fragment>
                <div className={"iv-column-reference"}>
                  <IconFileText size={15} />
                  <span>
                    {"Colonne : "}
                    {ge.column.title}
                  </span>
                </div>
                <label className={"iv-label"}>
                  {"Libellé du champ"}
                  <EditableText
                    value={ge.label}
                    onCommit={(Y) => Ye(ge.columnId, { label: Y })}
                    key={`${ue.id}-${ge.columnId}`}
                  />
                </label>
                <label className={"iv-label"}>
                  {"Texte d’aide"}
                  <textarea
                    rows={3}
                    value={ge.description || ""}
                    onChange={(Y) =>
                      Ye(ge.columnId, {
                        description: (
                          Y.target as
                            | HTMLInputElement
                            | HTMLSelectElement
                            | HTMLTextAreaElement
                        ).value,
                      })
                    }
                    placeholder={"Précisez les informations attendues"}
                  />
                </label>
                {!["select", "date", "checkbox"].includes(ge.column.type) && (
                  <label className={"iv-label"}>
                    {"Texte indicatif"}
                    <input
                      value={ge.placeholder || ""}
                      onChange={(Y) =>
                        Ye(ge.columnId, {
                          placeholder: (
                            Y.target as
                              | HTMLInputElement
                              | HTMLSelectElement
                              | HTMLTextAreaElement
                          ).value,
                        })
                      }
                      placeholder={"Exemple de réponse"}
                    />
                  </label>
                )}
                <label className={"iv-checkbox-label"}>
                  <input
                    type={"checkbox"}
                    checked={!!ge.required}
                    onChange={(Y) =>
                      Ye(ge.columnId, { required: Y.target.checked })
                    }
                  />
                  <span>{"Champ obligatoire"}</span>
                </label>
                <label className={"iv-checkbox-label"}>
                  <input
                    type={"checkbox"}
                    checked={!ge.hidden}
                    onChange={(Y) =>
                      Ye(ge.columnId, { hidden: !Y.target.checked })
                    }
                  />
                  <span>{"Afficher dans le formulaire"}</span>
                </label>
                <div className={"iv-reorder-controls"}>
                  <button
                    className={"iv-btn"}
                    disabled={be[0]?.columnId === ge.columnId}
                    onClick={() => ke(ge.columnId, -1)}
                  >
                    <IconArrowUp size={15} />
                    {"Monter"}
                  </button>
                  <button
                    className={"iv-btn"}
                    disabled={be.at(-1)?.columnId === ge.columnId}
                    onClick={() => ke(ge.columnId, 1)}
                  >
                    <IconArrowDown size={15} />
                    {"Descendre"}
                  </button>
                </div>
                {ge.column.type === "select" && (
                  <p className={"iv-hint"}>
                    {"Les options proviennent de la colonne de la feuille."}
                  </p>
                )}
              </React.Fragment>
            ) : (
              <div className={"iv-builder-tips"}>
                <p>
                  {
                    "Sélectionnez un champ dans l’aperçu ou dans la liste pour le configurer."
                  }
                </p>
                <p>
                  {
                    "Le titre et la description se modifient directement dans l’aperçu."
                  }
                </p>
                <div className={"iv-local-info"}>
                  {"Chaque réponse crée une nouvelle ligne dans « "}
                  {sheetProp.name}
                  {" »."}
                </div>
              </div>
            )}
          </aside>
        </div>
        <footer className={"iv-builder-footer"}>
          <IconCircleCheck size={13} />
          {"Modifications appliquées à la feuille"}
          <span>
            {ue.active === false ? "Réponses désactivées" : "Réponses activées"}
          </span>
        </footer>
      </section>
    </div>
  );
}
export function FormPreview({
  sheet: sheetProp,
  form: formProp,
  onSubmit: onSubmitProp,
  onClose: onCloseProp,
}) {
  const [f, v] = React.useState<Record<string, string | boolean>>({}),
    [p, R] = React.useState<Record<string, string | boolean>>({}),
    [b, M] = React.useState(false),
    [k, x] = React.useState(false),
    [N, V] = React.useState(""),
    G = React.useRef(null),
    H = formFields(sheetProp, formProp).filter((J) => !J.hidden);
  React.useEffect(() => {
    (v({}), R({}), x(false), V(""));
  }, [formProp.id]);
  const q = async (J) => {
    if ((J.preventDefault(), b || formProp.active === false || !H.length))
      return;
    const Z = readFormData(sheetProp, formProp, new FormData(G.current));
    v(Z);
    const F = validateForm(sheetProp, formProp, Z);
    if ((R(F), V(""), Object.keys(F).length)) {
      const P = Object.keys(F)[0];
      G.current?.elements.namedItem(P)?.focus();
      return;
    }
    M(true);
    try {
      (await onSubmitProp?.(formValues(sheetProp, formProp, Z)), x(true));
    } catch (P) {
      V(P?.message || "Impossible d’enregistrer votre réponse. Réessayez.");
    } finally {
      M(false);
    }
  };
  return (
    <main className={"iv-public-form"}>
      <header className={"iv-public-top"}>
        <div>
          <IconCircleCheck size={22} />
          <strong>{"CD Innovation"}</strong>
          <span>{"Formulaires"}</span>
        </div>
        <div>
          <span className={"iv-local-badge"}>{"CDInnov"}</span>
          {onCloseProp && (
            <button className={"iv-btn"} onClick={onCloseProp}>
              <IconX size={15} />
              {"Fermer"}
            </button>
          )}
        </div>
      </header>
      <div className={"iv-public-container"}>
        <section className={"iv-form-paper"}>
          <div className={"iv-paper-stripe"} />
          <div className={"iv-form-paper-content"}>
            {k ? (
              <div className={"iv-form-success"} role={"status"}>
                <IconCircleCheck size={54} strokeWidth={1.4} />
                <h1>{"Réponse enregistrée"}</h1>
                <p>
                  {formProp.successMessage ||
                    "Merci ! Votre réponse a bien été ajoutée à la feuille."}
                </p>
                <button
                  className={"iv-btn iv-primary"}
                  onClick={() => {
                    (v({}), R({}), x(false));
                  }}
                >
                  {"Envoyer une autre réponse"}
                </button>
                {onCloseProp && (
                  <button className={"iv-btn iv-quiet"} onClick={onCloseProp}>
                    {"Revenir à la feuille"}
                  </button>
                )}
              </div>
            ) : (
              <React.Fragment>
                <h1 className={"iv-public-title"}>
                  {formProp.title || sheetProp.name}
                </h1>
                {formProp.description && (
                  <p className={"iv-public-description"}>
                    {formProp.description}
                  </p>
                )}
                {formProp.active === false ? (
                  <div className={"iv-form-closed"}>
                    <IconEyeOff size={30} />
                    <h2>{"Ce formulaire n’accepte plus de réponses."}</h2>
                    <p>
                      {
                        "Vous pouvez le réactiver dans l’éditeur de formulaires."
                      }
                    </p>
                  </div>
                ) : H.length ? (
                  <form noValidate={true} onSubmit={q} ref={G}>
                    <p className={"iv-required-note"}>
                      {"Les champs marqués d’un "}
                      <span>{"*"}</span>
                      {" sont obligatoires."}
                    </p>
                    {H.map((J) => (
                      <FormFieldInput
                        field={J}
                        value={f[J.columnId]}
                        error={p[J.columnId]}
                        disabled={b}
                        idPrefix={formProp.id}
                        onChange={(Z) => {
                          (v((F) => ({ ...F, [J.columnId]: Z })),
                            R((F) =>
                              F[J.columnId]
                                ? { ...F, [J.columnId]: void 0 }
                                : F,
                            ));
                        }}
                        key={J.columnId}
                      />
                    ))}
                    {N && (
                      <p className={"iv-submit-error"} role={"alert"}>
                        {N}
                      </p>
                    )}
                    <button
                      className={"iv-btn iv-primary iv-submit-button"}
                      type={"submit"}
                      disabled={b}
                    >
                      {b ? "Enregistrement…" : "Envoyer"}
                    </button>
                  </form>
                ) : (
                  <div className={"iv-form-closed"}>
                    <IconFileText size={30} />
                    <h2>{"Aucun champ disponible"}</h2>
                    <p>
                      {
                        "Ajoutez des champs dans l’éditeur pour recueillir des réponses."
                      }
                    </p>
                  </div>
                )}
              </React.Fragment>
            )}
          </div>
        </section>
        <p className={"iv-public-local-note"}>
          {"Formulaire · Les réponses sont enregistrées dans la feuille « "}
          {sheetProp.name}
          {" »"}
          {" dans l’espace partagé CDInnov."}
        </p>
      </div>
    </main>
  );
}
