// ── Unit Tests for Accessibility Utilities ───────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ARIA_LABELS,
  getButtonA11yProps,
  getInputA11yProps,
  getTableA11yProps,
  getModalA11yProps,
  getAlertA11yProps,
  getProgressA11yProps,
  getTabsA11yProps,
  createIdGenerator,
  prefersReducedMotion,
  prefersHighContrast,
} from '../utils/accessibility';

describe('ARIA_LABELS', () => {
  it('contains navigation labels', () => {
    expect(ARIA_LABELS.mainNav).toBe('Main navigation');
    expect(ARIA_LABELS.sidebar).toBe('Sidebar navigation');
    expect(ARIA_LABELS.breadcrumb).toBe('Breadcrumb navigation');
  });

  it('contains action labels', () => {
    expect(ARIA_LABELS.save).toBe('Save changes');
    expect(ARIA_LABELS.cancel).toBe('Cancel operation');
    expect(ARIA_LABELS.delete).toBe('Delete item');
    expect(ARIA_LABELS.edit).toBe('Edit item');
    expect(ARIA_LABELS.add).toBe('Add new item');
  });

  it('contains notification labels', () => {
    expect(ARIA_LABELS.success).toBe('Success notification');
    expect(ARIA_LABELS.error).toBe('Error notification');
    expect(ARIA_LABELS.warning).toBe('Warning notification');
  });
});

describe('getButtonA11yProps', () => {
  it('returns basic button props', () => {
    const props = getButtonA11yProps({ label: 'Save' });
    
    expect(props['aria-label']).toBe('Save');
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
    expect(props['aria-disabled']).toBe(undefined);
  });

  it('handles disabled state', () => {
    const props = getButtonA11yProps({ label: 'Save', disabled: true });
    
    expect(props['aria-disabled']).toBe(true);
    expect(props.tabIndex).toBe(-1);
  });

  it('handles loading state', () => {
    const props = getButtonA11yProps({ label: 'Save', loading: true });
    
    expect(props['aria-disabled']).toBe(true);
    expect(props['aria-busy']).toBe(true);
  });

  it('handles pressed state', () => {
    const props = getButtonA11yProps({ label: 'Toggle', pressed: true });
    
    expect(props['aria-pressed']).toBe(true);
  });

  it('handles expanded state', () => {
    const props = getButtonA11yProps({ 
      label: 'Expand', 
      expanded: true, 
      controls: 'content-panel' 
    });
    
    expect(props['aria-expanded']).toBe(true);
    expect(props['aria-controls']).toBe('content-panel');
  });
});

describe('getInputA11yProps', () => {
  it('returns basic input props', () => {
    const props = getInputA11yProps({ 
      id: 'email', 
      label: 'Email address' 
    });
    
    expect(props.id).toBe('email');
    expect(props['aria-label']).toBe('Email address');
    expect(props['aria-required']).toBe(undefined);
  });

  it('handles required field', () => {
    const props = getInputA11yProps({ 
      id: 'name', 
      label: 'Name', 
      required: true 
    });
    
    expect(props['aria-required']).toBe(true);
  });

  it('handles error state', () => {
    const props = getInputA11yProps({ 
      id: 'email', 
      label: 'Email', 
      error: 'Invalid email' 
    });
    
    expect(props['aria-invalid']).toBe(true);
    expect(props['aria-errormessage']).toBe('email-error');
  });

  it('handles description', () => {
    const props = getInputA11yProps({ 
      id: 'password', 
      label: 'Password',
      description: 'Must be 8 characters' 
    });
    
    expect(props['aria-describedby']).toBe('password-description');
  });
});

describe('getTableA11yProps', () => {
  it('returns table props with row count', () => {
    const { tableProps } = getTableA11yProps({ 
      caption: 'Customers list',
      rowCount: 50 
    });
    
    expect(tableProps.role).toBe('table');
    expect(tableProps['aria-rowcount']).toBe(50);
    expect(tableProps['aria-label']).toBe('Customers list');
  });

  it('returns sort props for columns', () => {
    const { getSortProps } = getTableA11yProps({ 
      sortColumn: 'name',
      sortDirection: 'ascending' 
    });
    
    expect(getSortProps('name')['aria-sort']).toBe('ascending');
    expect(getSortProps('email')['aria-sort']).toBe('none');
  });
});

describe('getModalA11yProps', () => {
  it('returns modal props', () => {
    const props = getModalA11yProps({ 
      titleId: 'modal-title',
      descriptionId: 'modal-desc',
      isOpen: true 
    });
    
    expect(props.role).toBe('dialog');
    expect(props['aria-modal']).toBe(true);
    expect(props['aria-labelledby']).toBe('modal-title');
    expect(props['aria-describedby']).toBe('modal-desc');
    expect(props['aria-hidden']).toBe(false);
  });

  it('sets aria-hidden when closed', () => {
    const props = getModalA11yProps({ 
      titleId: 'modal-title',
      descriptionId: 'modal-desc',
      isOpen: false 
    });
    
    expect(props['aria-hidden']).toBe(true);
  });
});

describe('getAlertA11yProps', () => {
  it('returns alert role for errors', () => {
    const props = getAlertA11yProps('error');
    
    expect(props.role).toBe('alert');
    expect(props['aria-live']).toBe('assertive');
    expect(props['aria-atomic']).toBe(true);
  });

  it('returns status role for non-errors', () => {
    expect(getAlertA11yProps('success').role).toBe('status');
    expect(getAlertA11yProps('success')['aria-live']).toBe('polite');
    
    expect(getAlertA11yProps('info').role).toBe('status');
    expect(getAlertA11yProps('warning').role).toBe('status');
  });
});

describe('getProgressA11yProps', () => {
  it('returns progress props', () => {
    const props = getProgressA11yProps({ 
      label: 'Upload progress',
      value: 50,
      max: 100 
    });
    
    expect(props.role).toBe('progressbar');
    expect(props['aria-label']).toBe('Upload progress');
    expect(props['aria-valuenow']).toBe(50);
    expect(props['aria-valuemin']).toBe(0);
    expect(props['aria-valuemax']).toBe(100);
    expect(props['aria-busy']).toBe(true);
  });

  it('handles indeterminate state', () => {
    const props = getProgressA11yProps({ 
      label: 'Loading',
      indeterminate: true 
    });
    
    expect(props['aria-valuenow']).toBe(undefined);
  });
});

describe('getTabsA11yProps', () => {
  it('returns tablist props', () => {
    const { tabListProps } = getTabsA11yProps({
      selectedIndex: 0,
      tabIds: ['tab-1', 'tab-2'],
      panelIds: ['panel-1', 'panel-2'],
    });
    
    expect(tabListProps.role).toBe('tablist');
  });

  it('returns tab props with selection', () => {
    const { getTabProps } = getTabsA11yProps({
      selectedIndex: 0,
      tabIds: ['tab-1', 'tab-2'],
      panelIds: ['panel-1', 'panel-2'],
    });
    
    const firstTab = getTabProps(0);
    expect(firstTab.role).toBe('tab');
    expect(firstTab['aria-selected']).toBe(true);
    expect(firstTab.tabIndex).toBe(0);
    expect(firstTab['aria-controls']).toBe('panel-1');
    
    const secondTab = getTabProps(1);
    expect(secondTab['aria-selected']).toBe(false);
    expect(secondTab.tabIndex).toBe(-1);
  });

  it('returns panel props', () => {
    const { getPanelProps } = getTabsA11yProps({
      selectedIndex: 0,
      tabIds: ['tab-1', 'tab-2'],
      panelIds: ['panel-1', 'panel-2'],
    });
    
    const firstPanel = getPanelProps(0);
    expect(firstPanel.role).toBe('tabpanel');
    expect(firstPanel.hidden).toBe(false);
    expect(firstPanel['aria-labelledby']).toBe('tab-1');
    
    const secondPanel = getPanelProps(1);
    expect(secondPanel.hidden).toBe(true);
  });
});

describe('createIdGenerator', () => {
  it('generates unique IDs with prefix', () => {
    const generateId = createIdGenerator('modal');
    
    expect(generateId()).toBe('modal-1');
    expect(generateId()).toBe('modal-2');
    expect(generateId()).toBe('modal-3');
  });

  it('maintains separate counters per generator', () => {
    const genA = createIdGenerator('a');
    const genB = createIdGenerator('b');
    
    expect(genA()).toBe('a-1');
    expect(genB()).toBe('b-1');
    expect(genA()).toBe('a-2');
  });
});

describe('prefersReducedMotion', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns true when user prefers reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    
    expect(prefersReducedMotion()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('returns false when user does not prefer reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('prefersHighContrast', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns true when user prefers high contrast', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    
    expect(prefersHighContrast()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-contrast: more)');
  });

  it('returns false when user does not prefer high contrast', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    
    expect(prefersHighContrast()).toBe(false);
  });
});
