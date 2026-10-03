import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './DropdownSelect.module.css';

export default function DropdownSelect({
  value,
  options,
  onChange,
  ariaLabel,
  prefix,
  icon: Icon,
  variant = 'compact',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = options.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`${styles.dropdown} ${styles[variant]}`} ref={dropdownRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {Icon && <Icon className={styles.leadingIcon} size={14} />}
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <strong>{selectedOption?.label ?? String(value ?? '')}</strong>
        <ChevronDown className={styles.chevron} size={13} />
      </button>
      {open && (
        <div className={styles.options} role="menu" aria-label={ariaLabel}>
          {options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`${styles.option} ${selected ? styles.selectedOption : ''}`}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
