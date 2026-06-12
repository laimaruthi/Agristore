// ── Form Validation Utilities ─────────────────────────────────────────────────

// Validation rules
export const VALIDATION_RULES = {
  required: (value, fieldName) => {
    if (value === undefined || value === null || value === '' || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} is required`;
    }
    return null;
  },
  
  minLength: (min) => (value, fieldName) => {
    if (value && value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    return null;
  },
  
  maxLength: (max) => (value, fieldName) => {
    if (value && value.length > max) {
      return `${fieldName} must be less than ${max} characters`;
    }
    return null;
  },
  
  email: (value, fieldName) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return `${fieldName} must be a valid email address`;
    }
    return null;
  },
  
  phone: (value, fieldName) => {
    if (value && !/^[0-9]{10}$/.test(value.replace(/[\s-]/g, ''))) {
      return `${fieldName} must be a valid 10-digit phone number`;
    }
    return null;
  },
  
  positiveNumber: (value, fieldName) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      return `${fieldName} must be a positive number`;
    }
    return null;
  },
  
  minValue: (min) => (value, fieldName) => {
    const num = Number(value);
    if (isNaN(num) || num < min) {
      return `${fieldName} must be at least ${min}`;
    }
    return null;
  },
  
  maxValue: (max) => (value, fieldName) => {
    const num = Number(value);
    if (isNaN(num) || num > max) {
      return `${fieldName} must be at most ${max}`;
    }
    return null;
  },
  
  date: (value, fieldName) => {
    if (value && isNaN(Date.parse(value))) {
      return `${fieldName} must be a valid date`;
    }
    return null;
  },
  
  gst: (value, fieldName) => {
    if (value && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) {
      return `${fieldName} must be a valid GST number`;
    }
    return null;
  },
  
  aadhar: (value, fieldName) => {
    if (value && !/^[0-9]{12}$/.test(value.replace(/[\s-]/g, ''))) {
      return `${fieldName} must be a valid 12-digit Aadhar number`;
    }
    return null;
  },
};

// Validate a single field
export function validateField(value, rules, fieldName) {
  for (const rule of rules) {
    const error = rule(value, fieldName);
    if (error) return error;
  }
  return null;
}

// Validate entire form
export function validateForm(formData, schema) {
  const errors = {};
  let isValid = true;
  
  for (const [fieldName, rules] of Object.entries(schema)) {
    const error = validateField(formData[fieldName], rules, fieldName);
    if (error) {
      errors[fieldName] = error;
      isValid = false;
    }
  }
  
  return { isValid, errors };
}

// Form validation schemas for different entities
export const FORM_SCHEMAS = {
  customer: {
    name: [VALIDATION_RULES.required, VALIDATION_RULES.minLength(2), VALIDATION_RULES.maxLength(200)],
    phone: [VALIDATION_RULES.phone],
    address: [VALIDATION_RULES.maxLength(500)],
    gstNo: [VALIDATION_RULES.gst],
    aadhar: [VALIDATION_RULES.aadhar],
  },
  
  item: {
    name: [VALIDATION_RULES.required, VALIDATION_RULES.minLength(2), VALIDATION_RULES.maxLength(200)],
    price: [VALIDATION_RULES.required, VALIDATION_RULES.positiveNumber],
    stock: [VALIDATION_RULES.required, VALIDATION_RULES.positiveNumber],
    minStock: [VALIDATION_RULES.positiveNumber],
    buyPrice: [VALIDATION_RULES.positiveNumber],
    category: [VALIDATION_RULES.maxLength(100)],
    company: [VALIDATION_RULES.maxLength(200)],
    hsn: [VALIDATION_RULES.maxLength(20)],
  },
  
  invoice: {
    customerId: [VALIDATION_RULES.required],
  },
  
  purchase: {
    companyId: [VALIDATION_RULES.required],
  },
  
  user: {
    email: [VALIDATION_RULES.required, VALIDATION_RULES.email],
    name: [VALIDATION_RULES.required, VALIDATION_RULES.minLength(2)],
    password: [VALIDATION_RULES.required, VALIDATION_RULES.minLength(6)],
  },
  
  payment: {
    amount: [VALIDATION_RULES.required, VALIDATION_RULES.positiveNumber, VALIDATION_RULES.minValue(1)],
  },
};

// Hook for form validation state
export function useFormValidation(schema) {
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  
  const validate = (formData) => {
    const result = validateForm(formData, schema);
    setErrors(result.errors);
    return result.isValid;
  };
  
  const validateFieldOnBlur = (fieldName, value) => {
    if (!touched[fieldName]) return;
    const rules = schema[fieldName];
    if (rules) {
      const error = validateField(value, rules, fieldName);
      setErrors(prev => ({ ...prev, [fieldName]: error }));
    }
  };
  
  const touchField = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
  };
  
  const clearErrors = () => {
    setErrors({});
    setTouched({});
  };
  
  return { errors, touched, validate, validateFieldOnBlur, touchField, clearErrors };
}

// Import useState for the hook
import { useState } from 'react';
