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
  ClipboardList as IconClipboardList,
  FileSpreadsheet as IconFileSpreadsheet,
  LayoutDashboard as IconLayoutDashboard,
  Users as IconUsers,
  X as IconX,
} from "lucide-react";
export function IconButton({
  label: labelProp,
  children: childrenProp,
  onClick: onClickProp,
  className: classNameProp = "",
  ...f
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
}) {
  return (
    <button
      className={`icon-btn ${classNameProp}`}
      aria-label={labelProp}
      title={labelProp}
      onClick={onClickProp}
      {...f}
    >
      {childrenProp}
    </button>
  );
}
export function DocumentIcon({
  kind: kindProp = "sheet",
  size: sizeProp = 17,
}: {
  kind?: string;
  size?: number;
}) {
  return (
    <span className={`item-icon ${kindProp}`}>
      {kindProp === "dashboard" ? (
        <IconLayoutDashboard size={sizeProp} />
      ) : kindProp === "workspace" ? (
        <IconUsers size={sizeProp} />
      ) : kindProp === "form" ? (
        <IconClipboardList size={sizeProp} />
      ) : (
        <IconFileSpreadsheet size={sizeProp} />
      )}
    </span>
  );
}
export function SheetSummary({ item: itemProp, onChange: onChangeProp }) {
  const [h, o] = React.useState(itemProp.name),
    f = React.useRef(false);
  React.useEffect(() => o(itemProp.name), [itemProp.id, itemProp.name]);
  const v = () => {
    if (f.current) {
      f.current = false;
      return;
    }
    const p = h.trim();
    if (!p) {
      o(itemProp.name);
      return;
    }
    p !== itemProp.name && onChangeProp({ ...itemProp, name: p });
  };
  return (
    <input
      className={"document-name"}
      style={{
        width: Math.min(440, Math.max(120, itemProp.name.length * 9)) + "px",
      }}
      aria-label={"Nom du document"}
      value={h}
      maxLength={200}
      onChange={(p) =>
        o(
          (
            p.target as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement
          ).value,
        )
      }
      onBlur={v}
      onKeyDown={(p) => {
        (p.key === "Enter" && p.currentTarget.blur(),
          p.key === "Escape" &&
            ((f.current = true), o(itemProp.name), p.currentTarget.blur()));
      }}
    />
  );
}
export function Modal({
  title: titleProp,
  onClose: onCloseProp,
  children: childrenProp,
  wide: wideProp = false,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  const f = React.useRef(null);
  return (
    React.useEffect(() => {
      const v = document.activeElement as HTMLElement;
      (
        f.current?.querySelector("input,select,textarea") ||
        f.current?.querySelector("button")
      )?.focus();
      const p = (b) => {
          if (
            (b.key === "Escape" && (b.stopPropagation(), onCloseProp()),
            b.key === "Tab")
          ) {
            const M = [
                ...(f.current as HTMLElement).querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
                ),
              ].filter((N) => N.offsetParent !== null),
              k = M[0],
              x = M.at(-1);
            b.shiftKey && (document.activeElement as HTMLElement) === k
              ? (b.preventDefault(), x?.focus())
              : !b.shiftKey &&
                (document.activeElement as HTMLElement) === x &&
                (b.preventDefault(), k?.focus());
          }
        },
        R = f.current;
      return (
        R.addEventListener("keydown", p),
        () => {
          (R?.removeEventListener("keydown", p), v?.focus());
        }
      );
    }, []),
    (
      <div
        className={"modal-scrim"}
        onMouseDown={(v) => {
          v.target === v.currentTarget && onCloseProp();
        }}
      >
        <section
          className={`modal ${wideProp ? "wide" : ""}`}
          ref={f}
          role={"dialog"}
          aria-modal={"true"}
          aria-label={titleProp}
        >
          <header>
            <h2>{titleProp}</h2>
            <IconButton label={"Fermer la fenêtre"} onClick={onCloseProp}>
              <IconX size={20} />
            </IconButton>
          </header>
          {childrenProp}
        </section>
      </div>
    )
  );
}
export function download(filename: string, content: string, mime: string) {
  const o = URL.createObjectURL(new Blob([content], { type: mime })),
    f = document.createElement("a");
  ((f.href = o),
    (f.download = filename),
    f.click(),
    setTimeout(() => URL.revokeObjectURL(o), 1e3));
}
export function readRoute() {
  return decodeURIComponent(location.hash.slice(1) || "/home")
    .split("/")
    .filter(Boolean);
}
