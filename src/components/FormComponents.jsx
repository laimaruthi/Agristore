// ── Form Components with Validation ──────────────────────────────────────────
import React, { useState, useCallback } from 'react';

// Input field with validation
export function FormInput({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  touched,
  required = false,
  placeholder,
  disabled = false,
  className = '',
  helpText,
  prefix,
  suffix,
  ...props
}) {
  const hasError = touched && error;
  
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-bold text-emerald-400/70 mb-1.5">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/60 text-sm">
            {prefix}
          </span>
        )}
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full px-3 py-2.5 rounded-xl text-sm transition-colors
            ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-8' : ''}
            ${disabled 
              ? 'bg-emerald-900/20 text-emerald-500/50 cursor-not-allowed' 
              : 'bg-emerald-900/40 text-emerald-100'}
            ${hasError 
              ? 'border-2 border-red-500/50 focus:border-red-400' 
              : 'border border-emerald-700/30 focus:border-emerald-500/50'}
            focus:outline-none focus:ring-2 focus:ring-emerald-500/20
            placeholder-emerald-600/50`}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500/60 text-sm">
            {suffix}
          </span>
        )}
      </div>
      {hasError && (
        <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
          <span>⚠️</span> {error}
        </p>
      )}
      {helpText && !hasError && (
        <p className="mt-1 text-xs text-emerald-500/50">{helpText}</p>
      )}
    </div>
  );
}

// Select field with validation
export function FormSelect({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  touched,
  required = false,
  options = [],
  placeholder = 'Select...',
  disabled = false,
  className = '',
  helpText,
  ...props
}) {
  const hasError = touched && error;
  
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-bold text-emerald-400/70 mb-1.5">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <select
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        className={`w-full px-3 py-2.5 rounded-xl text-sm transition-colors
          ${disabled 
            ? 'bg-emerald-900/20 text-emerald-500/50 cursor-not-allowed' 
            : 'bg-emerald-900/40 text-emerald-100'}
          ${hasError 
            ? 'border-2 border-red-500/50 focus:border-red-400' 
            : 'border border-emerald-700/30 focus:border-emerald-500/50'}
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasError && (
        <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
          <span>⚠️</span> {error}
        </p>
      )}
      {helpText && !hasError && (
        <p className="mt-1 text-xs text-emerald-500/50">{helpText}</p>
      )}
    </div>
  );
}

// Textarea with validation
export function FormTextarea({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  touched,
  required = false,
  placeholder,
  disabled = false,
  rows = 3,
  className = '',
  helpText,
  maxLength,
  ...props
}) {
  const hasError = touched && error;
  
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-bold text-emerald-400/70 mb-1.5">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={`w-full px-3 py-2.5 rounded-xl text-sm transition-colors resize-none
          ${disabled 
            ? 'bg-emerald-900/20 text-emerald-500/50 cursor-not-allowed' 
            : 'bg-emerald-900/40 text-emerald-100'}
          ${hasError 
            ? 'border-2 border-red-500/50 focus:border-red-400' 
            : 'border border-emerald-700/30 focus:border-emerald-500/50'}
          focus:outline-none focus:ring-2 focus:ring-emerald-500/20
          placeholder-emerald-600/50`}
        {...props}
      />
      <div className="flex justify-between mt-1">
        {hasError ? (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <span>⚠️</span> {error}
          </p>
        ) : helpText ? (
          <p className="text-xs text-emerald-500/50">{helpText}</p>
        ) : (
          <span />
        )}
        {maxLength && (
          <span className={`text-xs ${value.length > maxLength * 0.9 ? 'text-amber-400' : 'text-emerald-500/50'}`}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

// Checkbox with label
export function FormCheckbox({
  label,
  name,
  checked,
  onChange,
  disabled = false,
  className = '',
  helpText,
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="w-5 h-5 rounded border-emerald-700/30 bg-emerald-900/40 
            text-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-0
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className={`text-sm ${disabled ? 'text-emerald-500/50' : 'text-emerald-200'}`}>
          {label}
        </span>
      </label>
      {helpText && (
        <p className="mt-1 ml-8 text-xs text-emerald-500/50">{helpText}</p>
      )}
    </div>
  );
}

// Form group wrapper
export function FormGroup({ children, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {children}
    </div>
  );
}

// Form row for horizontal layout
export function FormRow({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {children}
    </div>
  );
}

// Custom hook for form state management
export function useForm(initialValues, validationSchema) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setValues(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);
  
  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
  }, []);
  
  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);
  
  const setFieldError = useCallback((name, error) => {
    setErrors(prev => ({ ...prev, [name]: error }));
  }, []);
  
  const validate = useCallback(() => {
    if (!validationSchema) return true;
    
    const newErrors = {};
    let isValid = true;
    
    for (const [field, rules] of Object.entries(validationSchema)) {
      for (const rule of rules) {
        const error = rule(values[field], field);
        if (error) {
          newErrors[field] = error;
          isValid = false;
          break;
        }
      }
    }
    
    setErrors(newErrors);
    setTouched(Object.keys(validationSchema).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    return isValid;
  }, [values, validationSchema]);
  
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);
  
  const handleSubmit = useCallback((onSubmit) => async (e) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate]);
  
  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    setValue,
    setFieldError,
    validate,
    reset,
    handleSubmit,
    getFieldProps: (name) => ({
      name,
      value: values[name] || '',
      onChange: handleChange,
      onBlur: handleBlur,
      error: errors[name],
      touched: touched[name],
    }),
  };
}

// ── Category Field Component ──────────────────────────────────────────────────
export function CategoryField({ value, onChange, categories, onAddCategory, onRemoveCategory, label, categoryGst, setCategoryGst }) {
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newCatGst, setNewCatGst] = useState("0");
  const safeCats = Array.isArray(categories) ? categories : [];
  const handleChange = (e) => { if (e.target.value === "__add__") { setAdding(true); } else { onChange(e.target.value); } };
  const confirmAdd = () => {
    const t = newCat.trim();
    if (!t) return;
    if (onAddCategory) onAddCategory(t);
    const gstNum = Math.max(0, Number(newCatGst) || 0);
    if (setCategoryGst) setCategoryGst((p) => ({ ...(p || {}), [t]: gstNum }));
    onChange(t);
    setAdding(false);
    setNewCat("");
    setNewCatGst("0");
  };
  if (adding) return (
    <div>
      {label && <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">{label}</label>}
      <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30 space-y-2">
        <div className="grid grid-cols-[1fr_90px_auto_auto] gap-2">
          <input
            autoFocus
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
            className="border border-emerald-700/30 rounded-lg px-3 py-2 text-sm bg-emerald-900/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-emerald-100"
            placeholder="New category name…"
          />
          <input
            type="number"
            min="0"
            max="100"
            value={newCatGst}
            onChange={(e) => setNewCatGst(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
            className="border border-emerald-700/30 rounded-lg px-2 py-2 text-sm bg-emerald-900/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-emerald-100 text-center"
            placeholder="GST %"
            title="Total GST % — auto-splits into CGST + SGST"
          />
          <button type="button" onClick={confirmAdd} disabled={!newCat.trim()} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white disabled:opacity-50">Add</button>
          <button type="button" onClick={() => { setAdding(false); setNewCat(""); setNewCatGst("0"); }} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-600 text-white">✕</button>
        </div>
        <p className="text-[10px] text-emerald-500/60">e.g. <strong>Bio = 5</strong> → CGST 2.5% + SGST 2.5% (auto-applied)</p>
      </div>
    </div>
  );
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">{label}</label>}
      {safeCats.length === 0 ? (
        <button onClick={() => setAdding(true)} className="w-full text-left border border-dashed border-emerald-700/40 rounded-xl px-3 py-2.5 text-sm text-emerald-400/70 hover:bg-emerald-900/20 transition-colors">＋ Add new category…</button>
      ) : (
        <select value={safeCats.includes(value) ? value : safeCats[0]} onChange={handleChange} className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30">
          {safeCats.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__add__">＋ Add new category…</option>
        </select>
      )}
    </div>
  );
}

// ── Manage Categories Modal ───────────────────────────────────────────────────
function _categoryToString(c) {
  if (typeof c === 'string') return c;
  if (c == null) return '';
  if (typeof c === 'object') {
    if (typeof c.name === 'string') return c.name;
    const nk = Object.keys(c).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    if (nk.length > 0) return nk.map((k) => c[k]).join('');
  }
  return String(c);
}

export function ManageCategoriesModal({ categories, categoryGst = {}, setCategoryGst, onAddCategory, onRemoveCategory, onClose }) {
  const [newCat, setNewCat] = useState("");
  const [newGst, setNewGst] = useState("0");

  // Normalize incoming categories (defensive against legacy corrupt data)
  const cats = (Array.isArray(categories) ? categories : [])
    .map((c) => _categoryToString(c).trim())
    .filter(Boolean)
    .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);

  const add = () => {
    const t = newCat.trim();
    if (!t) return;
    if (cats.some((c) => c.toLowerCase() === t.toLowerCase())) { setNewCat(""); return; }
    onAddCategory(t);
    const gstNum = Math.max(0, Number(newGst) || 0);
    if (setCategoryGst) setCategoryGst((p) => ({ ...(p || {}), [t]: gstNum }));
    setNewCat("");
    setNewGst("0");
  };

  const updateGst = (cat, val) => {
    const num = Math.max(0, Number(val) || 0);
    if (setCategoryGst) setCategoryGst((p) => ({ ...(p || {}), [cat]: num }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" style={{ backdropFilter: "blur(4px)" }}>
      <div className="modal-bg rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" style={{ border:"1px solid" }}>
        <div className="modal-header flex items-center justify-between p-5">
          <h2 className="text-base font-semibold text-emerald-200">⚙ Manage Categories & GST</h2>
          <button onClick={onClose} className="text-emerald-500/50 hover:text-emerald-300 text-2xl">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30 text-xs text-emerald-300">
            💡 Set a GST % for each category. When you add an item under that category, CGST &amp; SGST auto-fill (split equally).
          </div>

          {/* Add new */}
          <div className="grid grid-cols-[1fr_90px_auto] gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30 text-emerald-100"
              placeholder="New category name…"
            />
            <input
              type="number"
              value={newGst}
              onChange={(e) => setNewGst(e.target.value)}
              min="0"
              max="100"
              className="border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30 text-emerald-100 text-center"
              placeholder="GST %"
              title="e.g. 5 means CGST 2.5% + SGST 2.5%"
            />
            <button type="button" onClick={add} disabled={!newCat.trim()} className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white disabled:opacity-50">+ Add</button>
          </div>

          {/* List with editable GST */}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {cats.length === 0 && (
              <div className="text-center text-emerald-500/50 text-sm py-4">No categories yet. Add one above.</div>
            )}
            {cats.map((c) => {
              const gstVal = Number(categoryGst?.[c]) || 0;
              return (
                <div key={c} className="grid grid-cols-[1fr_120px_auto] items-center gap-2 px-3 py-2 bg-emerald-900/20 rounded-xl border border-emerald-700/30">
                  <span className="text-sm font-medium text-emerald-200 truncate" title={c}>{c}</span>
                  <div className="flex items-center gap-1 justify-end">
                    <input
                      type="number"
                      value={gstVal}
                      onChange={(e) => updateGst(c, e.target.value)}
                      min="0"
                      max="100"
                      className="w-16 border border-emerald-700/30 rounded-lg px-2 py-1 text-sm bg-emerald-900/40 text-emerald-100 text-center"
                      title={`Auto-fills CGST ${gstVal / 2}% + SGST ${gstVal / 2}%`}
                    />
                    <span className="text-xs text-emerald-400">% GST</span>
                  </div>
                  <button
                    onClick={() => onRemoveCategory(c)}
                    className="text-red-400 hover:text-red-300 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-red-900/20"
                    title="Remove category"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={onClose} className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-100">Done</button>
        </div>
      </div>
    </div>
  );
}

export default FormInput;
