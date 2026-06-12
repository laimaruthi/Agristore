// ── Unit Tests for Validation Functions ──────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  VALIDATION_RULES,
  validateField,
  validateForm,
  FORM_SCHEMAS,
} from '../utils/validation';

describe('Validation Rules', () => {
  describe('required', () => {
    it('fails for empty values', () => {
      expect(VALIDATION_RULES.required('', 'Name')).toBe('Name is required');
      expect(VALIDATION_RULES.required(null, 'Name')).toBe('Name is required');
      expect(VALIDATION_RULES.required(undefined, 'Name')).toBe('Name is required');
      expect(VALIDATION_RULES.required('   ', 'Name')).toBe('Name is required');
    });

    it('passes for non-empty values', () => {
      expect(VALIDATION_RULES.required('John', 'Name')).toBe(null);
      expect(VALIDATION_RULES.required(0, 'Value')).toBe(null);
      expect(VALIDATION_RULES.required(false, 'Flag')).toBe(null);
    });
  });

  describe('minLength', () => {
    const minLength3 = VALIDATION_RULES.minLength(3);

    it('fails for short strings', () => {
      expect(minLength3('ab', 'Name')).toBe('Name must be at least 3 characters');
    });

    it('passes for valid strings', () => {
      expect(minLength3('abc', 'Name')).toBe(null);
      expect(minLength3('abcd', 'Name')).toBe(null);
      expect(minLength3('', 'Name')).toBe(null); // Empty should be caught by required
    });
  });

  describe('maxLength', () => {
    const maxLength5 = VALIDATION_RULES.maxLength(5);

    it('fails for long strings', () => {
      expect(maxLength5('abcdef', 'Name')).toBe('Name must be less than 5 characters');
    });

    it('passes for valid strings', () => {
      expect(maxLength5('abc', 'Name')).toBe(null);
      expect(maxLength5('abcde', 'Name')).toBe(null);
    });
  });

  describe('email', () => {
    it('fails for invalid emails', () => {
      expect(VALIDATION_RULES.email('invalid', 'Email')).toBe('Email must be a valid email address');
      expect(VALIDATION_RULES.email('no@domain', 'Email')).toBe('Email must be a valid email address');
      expect(VALIDATION_RULES.email('@nodomain.com', 'Email')).toBe('Email must be a valid email address');
    });

    it('passes for valid emails', () => {
      expect(VALIDATION_RULES.email('test@example.com', 'Email')).toBe(null);
      expect(VALIDATION_RULES.email('user.name@domain.co.in', 'Email')).toBe(null);
      expect(VALIDATION_RULES.email('', 'Email')).toBe(null); // Empty should be caught by required
    });
  });

  describe('phone', () => {
    it('fails for invalid phone numbers', () => {
      expect(VALIDATION_RULES.phone('12345', 'Phone')).toBe('Phone must be a valid 10-digit phone number');
      expect(VALIDATION_RULES.phone('12345678901', 'Phone')).toBe('Phone must be a valid 10-digit phone number');
      expect(VALIDATION_RULES.phone('abcdefghij', 'Phone')).toBe('Phone must be a valid 10-digit phone number');
    });

    it('passes for valid phone numbers', () => {
      expect(VALIDATION_RULES.phone('9876543210', 'Phone')).toBe(null);
      expect(VALIDATION_RULES.phone('987-654-3210', 'Phone')).toBe(null); // With dashes
      expect(VALIDATION_RULES.phone('987 654 3210', 'Phone')).toBe(null); // With spaces
    });
  });

  describe('positiveNumber', () => {
    it('fails for negative or invalid numbers', () => {
      expect(VALIDATION_RULES.positiveNumber(-5, 'Price')).toBe('Price must be a positive number');
      expect(VALIDATION_RULES.positiveNumber('abc', 'Price')).toBe('Price must be a positive number');
    });

    it('passes for positive numbers', () => {
      expect(VALIDATION_RULES.positiveNumber(0, 'Price')).toBe(null);
      expect(VALIDATION_RULES.positiveNumber(100, 'Price')).toBe(null);
      expect(VALIDATION_RULES.positiveNumber('50', 'Price')).toBe(null);
    });
  });

  describe('minValue', () => {
    const minValue10 = VALIDATION_RULES.minValue(10);

    it('fails for values below minimum', () => {
      expect(minValue10(5, 'Amount')).toBe('Amount must be at least 10');
    });

    it('passes for valid values', () => {
      expect(minValue10(10, 'Amount')).toBe(null);
      expect(minValue10(100, 'Amount')).toBe(null);
    });
  });

  describe('gst', () => {
    it('fails for invalid GST numbers', () => {
      expect(VALIDATION_RULES.gst('invalid', 'GST')).toBe('GST must be a valid GST number');
      expect(VALIDATION_RULES.gst('12ABCDE1234F1Z', 'GST')).toBe('GST must be a valid GST number');
    });

    it('passes for valid GST numbers', () => {
      expect(VALIDATION_RULES.gst('27AAPFU0939F1ZV', 'GST')).toBe(null);
      expect(VALIDATION_RULES.gst('', 'GST')).toBe(null); // Empty should be caught by required
    });
  });

  describe('aadhar', () => {
    it('fails for invalid Aadhar numbers', () => {
      expect(VALIDATION_RULES.aadhar('12345', 'Aadhar')).toBe('Aadhar must be a valid 12-digit Aadhar number');
      expect(VALIDATION_RULES.aadhar('1234567890123', 'Aadhar')).toBe('Aadhar must be a valid 12-digit Aadhar number');
    });

    it('passes for valid Aadhar numbers', () => {
      expect(VALIDATION_RULES.aadhar('123456789012', 'Aadhar')).toBe(null);
      expect(VALIDATION_RULES.aadhar('1234 5678 9012', 'Aadhar')).toBe(null); // With spaces
    });
  });
});

describe('validateField', () => {
  it('returns first error from rules', () => {
    const rules = [
      VALIDATION_RULES.required,
      VALIDATION_RULES.minLength(3),
    ];

    expect(validateField('', rules, 'Name')).toBe('Name is required');
    expect(validateField('ab', rules, 'Name')).toBe('Name must be at least 3 characters');
    expect(validateField('abc', rules, 'Name')).toBe(null);
  });
});

describe('validateForm', () => {
  const schema = {
    name: [VALIDATION_RULES.required, VALIDATION_RULES.minLength(2)],
    email: [VALIDATION_RULES.email],
    phone: [VALIDATION_RULES.phone],
  };

  it('validates all fields and returns errors', () => {
    const result = validateForm(
      { name: '', email: 'invalid', phone: '123' },
      schema
    );

    expect(result.isValid).toBe(false);
    expect(result.errors.name).toBe('name is required');
    expect(result.errors.email).toBe('email must be a valid email address');
    expect(result.errors.phone).toBe('phone must be a valid 10-digit phone number');
  });

  it('returns valid for correct data', () => {
    const result = validateForm(
      { name: 'John', email: 'john@example.com', phone: '9876543210' },
      schema
    );

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });
});

describe('Form Schemas', () => {
  it('has customer schema defined', () => {
    expect(FORM_SCHEMAS.customer).toBeDefined();
    expect(FORM_SCHEMAS.customer.name).toBeDefined();
  });

  it('has item schema defined', () => {
    expect(FORM_SCHEMAS.item).toBeDefined();
    expect(FORM_SCHEMAS.item.name).toBeDefined();
    expect(FORM_SCHEMAS.item.price).toBeDefined();
  });

  it('has user schema defined', () => {
    expect(FORM_SCHEMAS.user).toBeDefined();
    expect(FORM_SCHEMAS.user.email).toBeDefined();
  });
});
