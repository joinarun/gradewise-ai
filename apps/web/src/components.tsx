import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, ChevronDown, FolderOpen, Info, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "white";
}) {
  return <button type="button" {...props} className={`button button-${variant} ${className}`} />;
}

export function IconButton({ label, icon: Icon, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; icon: LucideIcon;
}) {
  return <button type="button" className="icon-button" aria-label={label} title={label} {...props}><Icon size={18} /></button>;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "accent" | "danger" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" | "success" }) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? Check : Info;
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}><Icon size={17} aria-hidden="true" /><div>{children}</div></div>;
}

export function Empty({ title, description, icon: Icon = FolderOpen, action }: {
  title: string; description: string; icon?: LucideIcon; action?: ReactNode;
}) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24} /></span><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function PageTitle({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function SelectField({ label, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return <Field label={label}><span className="select-wrap"><select {...rest}>{children}</select><ChevronDown size={15} /></span></Field>;
}

export function Modal({ title, description, onClose, children }: {
  title: string; description?: string; onClose: () => void; children: ReactNode;
}) {
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = element.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={element} className="modal" aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-heading">
      <div><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div>
      <IconButton label="Close dialog" icon={X} onClick={onClose} />
    </div>
    {children}
  </dialog>;
}

export function LinkArrow({ children, href }: { children: ReactNode; href: string }) {
  return <a href={href} className="link-arrow">{children}<ChevronRight size={16} /></a>;
}

export function Loading({ label }: { label: string }) {
  return <span className="loading-label"><Sparkles size={17} className="pulse" />{label}</span>;
}
