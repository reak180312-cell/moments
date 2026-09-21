import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';

/* ------------------------------------------------------------------ icons */

type IconName =
  | 'home' | 'history' | 'insights' | 'calendar' | 'settings' | 'plus' | 'chevron'
  | 'back' | 'close' | 'check' | 'clock' | 'search' | 'filter' | 'download'
  | 'trash' | 'edit' | 'copy' | 'cloud-off' | 'info' | 'play' | 'pause' | 'stop'
  | 'pin' | 'people' | 'bolt' | 'sun' | 'moon';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3" /><path d="M3 4v4h4" /><path d="M12 7.5V12l3 2" /></>,
  insights: <><path d="M4 19V10" /><path d="M9.5 19V5" /><path d="M15 19v-6" /><path d="M20.5 19v-9" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  back: <path d="m15 5-7 7 7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  download: <><path d="M12 3.5v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 20h15" /></>,
  trash: <><path d="M4.5 6.5h15" /><path d="M9 6.5V4.8h6v1.7" /><path d="M6.5 6.5 7.6 20h8.8l1.1-13.5" /></>,
  edit: <><path d="M4.5 19.5h4L19 9a2.5 2.5 0 0 0-3.5-3.5L5 16z" /><path d="m14.5 6.5 3 3" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="3" /><path d="M15.5 5.5h-8a3 3 0 0 0-3 3v8" /></>,
  'cloud-off': <><path d="M6.5 18.5A4 4 0 0 1 7 10.6a5.5 5.5 0 0 1 9.4-2.8" /><path d="M3 3l18 18" /><path d="M18.8 11.6a4 4 0 0 1-.8 6.9H10" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" /></>,
  play: <path d="M8 5.5v13l10-6.5z" />,
  pause: <><path d="M9 5.5v13" /><path d="M15 5.5v13" /></>,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />,
  pin: <><path d="M12 15.5V21" /><path d="M8 3.5h8l-1 6 2.5 2.5v1.5H6.5V12L9 9.5z" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.6a5.5 5.5 0 0 1 3 4.9" /></>,
  bolt: <path d="M13 3 6 13h5l-1 8 7-10h-5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
};

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={className}
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ---------------------------------------------------------------- buttons */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'plain' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: IconName;
};

export function Button({
  variant = 'secondary', size = 'md', block, icon, children, className = '', ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant === 'primary' ? 'btn--primary' : '',
    variant === 'ghost' ? 'btn--ghost' : '',
    variant === 'plain' ? 'btn--plain' : '',
    variant === 'danger' ? 'btn--danger' : '',
    size === 'lg' ? 'btn--lg' : '',
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  );
}

export function IconButton({ label, name, ...rest }: { label: string; name: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="btn btn--icon btn--ghost" aria-label={label} title={label} {...rest}>
      <Icon name={name} size={20} />
    </button>
  );
}

/* ------------------------------------------------------------------ cards */

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="row-between" style={{ marginTop: '0.5rem' }}>
      <h2 className="section-title" style={{ margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {emoji && <div className="empty-emoji" aria-hidden="true">{emoji}</div>}
      <h3>{title}</h3>
      {body && <p style={{ maxWidth: '26rem' }}>{body}</p>}
      {action}
    </div>
  );
}

export function Banner({ tone = 'quiet', icon, children }: { tone?: 'quiet' | 'accent'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`banner ${tone === 'accent' ? 'banner--accent' : ''}`}>
      {icon && <span className="banner-icon"><Icon name={icon} size={20} /></span>}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

export function Avatar({ name, hue = 210 }: { name: string; hue?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <span
      className="avatar" aria-hidden="true"
      style={{ background: `hsl(${hue} 60% 92%)`, color: `hsl(${hue} 55% 30%)` }}
    >
      {initials}
    </span>
  );
}

/* ----------------------------------------------------------------- fields */

/** Implicit labelling: the control sits inside its own <label>, so tapping
 *  the text focuses it and screen readers announce the pair. */
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

/** For groups of controls (chips, toggles) where one <label> cannot apply. */
export function Fieldset({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label" aria-hidden="true">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value} type="button" aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      className="switch" onClick={() => onChange(!checked)}
    />
  );
}

export function SwitchRow({
  title, description, checked, onChange,
}: { title: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switch-row">
      <span className="switch-text">
        <span>{title}</span>
        {description && <small>{description}</small>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Chip({
  children, selected, onClick, dashed, title,
}: { children: ReactNode; selected?: boolean; onClick?: () => void; dashed?: boolean; title?: string }) {
  return (
    <button
      type="button" className={`chip ${dashed ? 'chip--add' : ''}`}
      aria-pressed={selected === undefined ? undefined : selected}
      onClick={onClick} title={title}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- sheets */

export function Sheet({
  title, onClose, children, footer, labelledBy,
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="sheet" role="dialog" aria-modal="true"
        aria-labelledby={labelledBy ?? headingId} tabIndex={-1} ref={ref}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={headingId}>{title}</h2>
          <IconButton label="Close" name="close" onClick={onClose} />
        </div>
        {children}
        {footer && <div style={{ marginTop: '1rem' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, body, confirmLabel = 'Confirm', destructive, onConfirm, onCancel,
}: {
  title: string; body: ReactNode; confirmLabel?: string;
  destructive?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <div className="stack">
        <div style={{ color: 'var(--ink-2)' }}>{body}</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------------- toasts */

interface Toast { id: string; message: string; actionLabel?: string; onAction?: () => void }

const ToastContext = createContext<(message: string, action?: { label: string; onAction: () => void }) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, action?: { label: string; onAction: () => void }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, actionLabel: action?.label, onAction: action?.onAction }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.actionLabel && (
              <button type="button" onClick={() => { t.onAction?.(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ misc */

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="empty" role="status">
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
        </path>
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}
