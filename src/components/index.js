// ── Components Index ──────────────────────────────────────────────────────────
// Export all reusable components from a single entry point

export { Icon } from './Icon';
export { Alert, StatusPill } from './Alert';

export { Pagination } from './Pagination';

export {
  Spinner,
  LoadingOverlay,
  SkeletonText,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonTable,
  SkeletonStatCard,
  LoadingState,
  EmptyState,
  ProgressBar,
} from './LoadingStates';

export {
  FormInput,
  FormSelect,
  FormTextarea,
  FormCheckbox,
  FormGroup,
  FormRow,
  useForm,
} from './FormComponents';

export {
  SkipLink,
  AccessibleModal,
  AccessibleAlert,
  AccessibleProgress,
  AccessibleTooltip,
  ScreenReaderOnly,
  LiveRegion,
  IconButton,
  AccessibleCard,
  AccessibleTable,
} from './AccessibleComponents';

// ── UI Components (shared across pages) ───────────────────────────────────────
export {
  Badge,
  Modal,
  Input,
  SelectField,
  Btn,
  ToastProvider,
  useToast,
  QuickAddCustomerModal,
  CustomerCombobox,
  ItemCombobox,
  RecordPaymentModal,
  DeleteConfirmModal,
} from './UIComponents';

export { default as UpdateNotification } from './UpdateNotification';
