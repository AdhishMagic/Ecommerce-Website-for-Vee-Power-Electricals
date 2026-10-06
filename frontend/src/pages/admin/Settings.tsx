import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BellRing,
  Building2,
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

import { settingsApi } from "../../api/settings";
import { configApi } from "../../api/config";
import { authApi } from "../../api/auth";
import { normalizeApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type {
  NotificationSettings,
  NotificationSettingsPatch,
  SecurityOverview,
  StoreProfile,
  SystemInformation,
  UserProfile,
} from "../../types/api";

/* ------------------------------------------------------------------ *
 * Section contract
 * ------------------------------------------------------------------ */
const SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "business", label: "Business", icon: Building2 },
  { id: "system", label: "System", icon: ServerCog },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];
const SECTION_IDS: readonly string[] = SECTIONS.map((section) => section.id);

const isSectionId = (value: string | null): value is SectionId =>
  value !== null && SECTION_IDS.includes(value);

/* ------------------------------------------------------------------ *
 * Field groups — General and Business are two views of the single
 * authoritative `/config/store/` row. Each group saves only its own slice
 * so one tab can never silently overwrite unsaved edits in the other.
 * ------------------------------------------------------------------ */
type StoreField = keyof StoreProfile;

const GENERAL_FIELDS = [
  "legal_company_name",
  "brand_name",
  "support_email",
  "support_phone",
  "currency_code",
  "currency_symbol",
] as const satisfies readonly StoreField[];

const BUSINESS_FIELDS = [
  "gstin",
  "pan",
  "registered_address",
  "warehouse_address",
  "bank_name",
  "bank_account_number",
  "bank_ifsc",
  "bank_branch",
  "rounding_mode",
  "auto_cancel_unpaid_minutes",
  "cancellation_allowed_until",
  "return_window_days",
  "require_shipping_awb",
  "upi_enabled",
  "cards_enabled",
  "netbanking_enabled",
  "cod_enabled",
  "cod_max_limit",
  "guest_checkout_enabled",
  "is_maintenance_mode",
  "maintenance_notice",
] as const satisfies readonly StoreField[];

const ALL_STORE_FIELDS = [...GENERAL_FIELDS, ...BUSINESS_FIELDS] as readonly StoreField[];

/** Early fulfilment stages for which cancellation is still permitted. */
const CANCELLATION_STAGES = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED"] as const;

/** Statutory formats enforced by the backend serializers. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9()\-\s]{6,20}$/;
const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
/** Matches `MinimumLengthValidator`, which the backend runs via `validate_password`. */
const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  "w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] focus:ring-1 focus:ring-[#0B3A63]/20 text-sm text-slate-800 bg-white disabled:bg-slate-50 disabled:text-slate-400 transition-colors";

/* ------------------------------------------------------------------ *
 * Formatting helpers — every value rendered comes from the backend;
 * absent values render as an em dash rather than a fabricated default.
 * ------------------------------------------------------------------ */
const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const errorMessageOf = (error: unknown): string => normalizeApiError(error).message;

const fieldErrorsOf = (error: unknown): Record<string, string[]> =>
  normalizeApiError(error).fieldErrors;

/* ------------------------------------------------------------------ *
 * Presentational primitives (no new design system — admin palette reused)
 * ------------------------------------------------------------------ */
function Panel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      className="bg-white rounded-xl border border-slate-200 shadow-sm"
      aria-labelledby={`panel-title-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
    >
      <div className="px-5 py-4 border-b border-slate-200">
        <h2
          id={`panel-title-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
          className="text-base font-bold text-[#0B3A63]"
        >
          {title}
        </h2>
        {description ? <p className="text-xs text-slate-500 mt-1">{description}</p> : null}
      </div>
      <div className="p-5 space-y-5">{children}</div>
      {footer ? (
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/60 rounded-b-xl flex flex-wrap items-center justify-end gap-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}
        {required ? <span className="text-rose-600 ml-1">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-600 mt-1" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-400 mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2.5 border-b border-slate-100 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-sm font-semibold text-slate-800 break-all ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-slate-700 block">
          {label}
        </label>
        {description ? <p className="text-xs text-slate-500 mt-0.5">{description}</p> : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#0B3A63]/30 disabled:opacity-50 ${
          checked ? "bg-[#0B3A63]" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-pulse" data-testid="settings-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="bg-white border border-slate-100 rounded-xl p-5">
          <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-10 bg-slate-100 rounded-lg" />
            <div className="h-10 bg-slate-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex flex-wrap items-center justify-between gap-3 text-sm"
      role="alert"
      data-testid="settings-error"
    >
      <span className="flex items-center gap-2 min-w-0">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span className="break-words">{message}</span>
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

function SaveButton({
  saving,
  disabled,
  label = "Save changes",
  testId,
}: {
  saving: boolean;
  disabled: boolean;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="submit"
      disabled={saving || disabled}
      data-testid={testId}
      className="inline-flex items-center gap-2 bg-[#0B3A63] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1769AA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving ? "Saving…" : label}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export default function Settings() {
  const { refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeSection: SectionId = isSectionId(tabParam) ? tabParam : "general";

  const setActiveSection = useCallback(
    (section: SectionId) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", section);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((tone: "success" | "error", message: string) => {
    setToast({ tone, message });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );

  // -- editable drafts & submission state ------------------------------
  // Declared before the loaders so each loader can seed its draft directly.
  // Every draft is a copy of an authoritative backend value; nothing is ever
  // rendered from a hardcoded default.
  const [profileDraft, setProfileDraft] = useState({ first_name: "", last_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});

  const [storeDraft, setStoreDraft] = useState<StoreProfile | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeFieldErrors, setStoreFieldErrors] = useState<Record<string, string>>({});

  /** The six independently switchable categories of the notification policy. */
  type NotificationDraft = Pick<
    NotificationSettings,
    | "email_notifications_enabled"
    | "order_notifications"
    | "payment_notifications"
    | "invoice_notifications"
    | "quotation_notifications"
    | "customer_notifications"
  >;

  const [notificationDraft, setNotificationDraft] = useState<NotificationDraft | null>(null);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationReason, setNotificationReason] = useState("");

  const [passwordDraft, setPasswordDraft] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [revokePending, setRevokePending] = useState(false);
  const [revokeSaving, setRevokeSaving] = useState(false);

  // -- data state ------------------------------------------------------
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [store, setStore] = useState<StoreProfile | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationSettings | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  const [security, setSecurity] = useState<SecurityOverview | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const [system, setSystem] = useState<SystemInformation | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);

  const loadedRef = useRef<Set<string>>(new Set());

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data = await authApi.getMe();
      setProfile(data);
      setProfileDraft({
        first_name: data.first_name ?? "",
        last_name: data.last_name ?? "",
        phone: data.phone ?? "",
      });
    } catch (error) {
      setProfileError(errorMessageOf(error));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadStore = useCallback(async () => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const data = await configApi.getStoreProfile();
      setStore(data);
      setStoreDraft(data);
    } catch (error) {
      setStoreError(errorMessageOf(error));
    } finally {
      setStoreLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    setNotificationsError(null);
    try {
      const data = await settingsApi.getNotificationSettings();
      setNotifications(data);
      setNotificationDraft({
        email_notifications_enabled: data.email_notifications_enabled,
        order_notifications: data.order_notifications,
        payment_notifications: data.payment_notifications,
        invoice_notifications: data.invoice_notifications,
        quotation_notifications: data.quotation_notifications,
        customer_notifications: data.customer_notifications,
      });
    } catch (error) {
      setNotificationsError(errorMessageOf(error));
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    setSecurityLoading(true);
    setSecurityError(null);
    try {
      setSecurity(await settingsApi.getSecurityOverview());
    } catch (error) {
      setSecurityError(errorMessageOf(error));
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  const loadSystem = useCallback(async () => {
    setSystemLoading(true);
    setSystemError(null);
    try {
      setSystem(await settingsApi.getSystemInformation());
    } catch (error) {
      setSystemError(errorMessageOf(error));
    } finally {
      setSystemLoading(false);
    }
  }, []);

  const loadSection = useCallback(
    (section: SectionId) => {
      switch (section) {
        case "general":
          void loadStore();
          void loadSystem();
          break;
        case "business":
          void loadStore();
          break;
        case "profile":
          void loadProfile();
          break;
        case "security":
          void loadSecurity();
          break;
        case "notifications":
          void loadNotifications();
          break;
        case "system":
          void loadSystem();
          break;
      }
    },
    [loadNotifications, loadProfile, loadSecurity, loadStore, loadSystem]
  );

  const ensureLoaded = useCallback(
    (section: SectionId) => {
      if (loadedRef.current.has(section)) return;
      if (section === "general" || section === "business") {
        loadedRef.current.add("general");
        loadedRef.current.add("business");
      } else {
        loadedRef.current.add(section);
      }
      loadSection(section);
    },
    [loadSection]
  );

  const reloadSection = useCallback(
    (section: SectionId) => {
      if (section === "general" || section === "business") {
        loadedRef.current.delete("general");
        loadedRef.current.delete("business");
      } else {
        loadedRef.current.delete(section);
      }
      loadSection(section);
    },
    [loadSection]
  );

  useEffect(() => {
    ensureLoaded(activeSection);
  }, [activeSection, ensureLoaded]);

  // -- profile form ----------------------------------------------------
  const profileDirty =
    profile !== null &&
    (profileDraft.first_name !== (profile.first_name ?? "") ||
      profileDraft.last_name !== (profile.last_name ?? "") ||
      profileDraft.phone !== (profile.phone ?? ""));

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    const errors: Record<string, string> = {};
    if (!profileDraft.first_name.trim()) errors.first_name = "First name is required.";
    if (!profileDraft.last_name.trim()) errors.last_name = "Last name is required.";
    if (profileDraft.phone.trim() && !PHONE_PATTERN.test(profileDraft.phone.trim())) {
      errors.phone = "Enter a valid phone number (digits, spaces, +, - and parentheses).";
    }
    setProfileFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast("error", "Please correct the highlighted fields before saving.");
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await authApi.updateProfile({
        first_name: profileDraft.first_name.trim(),
        last_name: profileDraft.last_name.trim(),
        phone: profileDraft.phone.trim(),
      });
      setProfile(updated);
      setProfileDraft({
        first_name: updated.first_name ?? "",
        last_name: updated.last_name ?? "",
        phone: updated.phone ?? "",
      });
      // Keep the shared authentication state (header, sidebar) in sync with the
      // authoritative record that was just persisted.
      await refreshUser();
      showToast("success", "Profile updated and saved to the database.");
    } catch (error) {
      const fieldErrors = fieldErrorsOf(error);
      const nextErrors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(fieldErrors)) {
        nextErrors[key] = messages.join(" ");
      }
      setProfileFieldErrors(nextErrors);
      showToast("error", errorMessageOf(error));
    } finally {
      setProfileSaving(false);
    }
  };

  // -- store (General + Business) form ---------------------------------
  const updateStoreDraft = <K extends StoreField>(field: K, value: StoreProfile[K]) => {
    setStoreDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const dirtyStoreFields = (fields: readonly StoreField[]): StoreField[] => {
    if (!store || !storeDraft) return [];
    return fields.filter((field) => storeDraft[field] !== store[field]);
  };

  const buildStorePatch = (fields: readonly StoreField[]): Partial<StoreProfile> => {
    const patch: Partial<StoreProfile> = {};
    if (!store || !storeDraft) return patch;
    for (const field of fields) {
      if (storeDraft[field] !== store[field]) {
        Object.assign(patch, { [field]: storeDraft[field] });
      }
    }
    return patch;
  };

  const validateStore = (fields: readonly StoreField[]): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!storeDraft) return errors;
    const touched = new Set<StoreField>(fields);

    if (touched.has("legal_company_name") && !storeDraft.legal_company_name.trim()) {
      errors.legal_company_name = "Legal company name is required.";
    }
    if (touched.has("brand_name") && !storeDraft.brand_name.trim()) {
      errors.brand_name = "Brand name is required.";
    }
    if (touched.has("support_email")) {
      const value = storeDraft.support_email.trim();
      if (!value) errors.support_email = "Support email is required.";
      else if (!EMAIL_PATTERN.test(value)) errors.support_email = "Enter a valid email address.";
    }
    if (touched.has("support_phone")) {
      const value = storeDraft.support_phone.trim();
      if (!value) errors.support_phone = "Support phone is required.";
      else if (!PHONE_PATTERN.test(value)) errors.support_phone = "Enter a valid phone number.";
    }
    if (touched.has("currency_code") && !CURRENCY_CODE_PATTERN.test(storeDraft.currency_code.trim())) {
      errors.currency_code = "Use the 3-letter ISO code, e.g. INR.";
    }
    if (touched.has("currency_symbol") && !storeDraft.currency_symbol.trim()) {
      errors.currency_symbol = "Currency symbol is required.";
    }
    if (touched.has("gstin")) {
      const value = storeDraft.gstin.trim().toUpperCase();
      if (value && !GSTIN_PATTERN.test(value)) {
        errors.gstin = "GSTIN must be 15 characters, e.g. 33AABFV1234A1ZX.";
      }
    }
    if (touched.has("pan")) {
      const value = storeDraft.pan.trim().toUpperCase();
      if (value && !PAN_PATTERN.test(value)) {
        errors.pan = "PAN must be 10 characters, e.g. AABFV1234A.";
      }
    }
    if (touched.has("gstin") && touched.has("pan")) {
      const gstin = storeDraft.gstin.trim().toUpperCase();
      const pan = storeDraft.pan.trim().toUpperCase();
      if (!errors.gstin && !errors.pan && gstin && pan && gstin.slice(2, 12) !== pan) {
        errors.gstin = "GSTIN characters 3–12 must match the registered PAN.";
      }
    }
    if (touched.has("registered_address") && !storeDraft.registered_address.trim()) {
      errors.registered_address = "Registered address is required.";
    }
    if (touched.has("warehouse_address") && !storeDraft.warehouse_address.trim()) {
      errors.warehouse_address = "Warehouse address is required.";
    }
    if (touched.has("cod_max_limit")) {
      const value = storeDraft.cod_max_limit.trim();
      if (!DECIMAL_PATTERN.test(value)) {
        errors.cod_max_limit = "Enter a non-negative amount with up to 2 decimals.";
      }
    }
    if (touched.has("auto_cancel_unpaid_minutes")) {
      const value = storeDraft.auto_cancel_unpaid_minutes;
      if (!Number.isInteger(value) || value < 1) {
        errors.auto_cancel_unpaid_minutes = "Enter a whole number of minutes (1 or more).";
      }
    }
    if (touched.has("return_window_days")) {
      const value = storeDraft.return_window_days;
      if (!Number.isInteger(value) || value < 0) {
        errors.return_window_days = "Enter a whole number of days (0 or more).";
      }
    }
    if (touched.has("cancellation_allowed_until") && !storeDraft.cancellation_allowed_until) {
      errors.cancellation_allowed_until = "Select the last fulfilment stage eligible for cancellation.";
    }
    return errors;
  };

  const submitStore = async (event: React.FormEvent, fields: readonly StoreField[]) => {
    event.preventDefault();
    if (!store || !storeDraft) return;

    const errors = validateStore(fields);
    setStoreFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast("error", "Please correct the highlighted fields before saving.");
      return;
    }

    const patch = buildStorePatch(fields);
    if (Object.keys(patch).length === 0) {
      showToast("success", "No changes to save.");
      return;
    }

    const draftBefore = storeDraft;
    const storedBefore = store;

    setStoreSaving(true);
    try {
      const saved = await configApi.updateStoreProfile(patch);
      setStore(saved);
      // Preserve unsaved edits that belong to the other view of this same row.
      const merged: StoreProfile = { ...saved };
      for (const field of ALL_STORE_FIELDS) {
        if (!fields.includes(field) && draftBefore[field] !== storedBefore[field]) {
          Object.assign(merged, { [field]: draftBefore[field] });
        }
      }
      setStoreDraft(merged);
      setStoreFieldErrors({});
      showToast("success", "Business configuration saved to the database.");
    } catch (error) {
      const fieldErrors = fieldErrorsOf(error);
      const nextErrors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(fieldErrors)) {
        nextErrors[key] = messages.join(" ");
      }
      setStoreFieldErrors(nextErrors);
      showToast("error", errorMessageOf(error));
    } finally {
      setStoreSaving(false);
    }
  };

  // -- notifications form ----------------------------------------------
  const notificationFields: readonly (keyof NotificationDraft)[] = [
    "email_notifications_enabled",
    "order_notifications",
    "payment_notifications",
    "invoice_notifications",
    "quotation_notifications",
    "customer_notifications",
  ];

  const notificationsDirty =
    notifications !== null &&
    notificationDraft !== null &&
    notificationFields.some((field) => notificationDraft[field] !== notifications[field]);

  const submitNotifications = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!notifications || !notificationDraft) return;

    const patch: NotificationSettingsPatch = {};
    for (const field of notificationFields) {
      if (notificationDraft[field] !== notifications[field]) {
        patch[field] = notificationDraft[field];
      }
    }
    if (Object.keys(patch).length === 0 && !notificationReason.trim()) {
      showToast("success", "No changes to save.");
      return;
    }
    if (notificationReason.trim()) {
      patch.change_reason = notificationReason.trim();
    }

    setNotificationSaving(true);
    try {
      const saved = await settingsApi.updateNotificationSettings(patch);
      setNotifications(saved);
      setNotificationDraft({
        email_notifications_enabled: saved.email_notifications_enabled,
        order_notifications: saved.order_notifications,
        payment_notifications: saved.payment_notifications,
        invoice_notifications: saved.invoice_notifications,
        quotation_notifications: saved.quotation_notifications,
        customer_notifications: saved.customer_notifications,
      });
      setNotificationReason("");
      showToast("success", "Notification policy saved and enforced immediately.");
    } catch (error) {
      showToast("error", errorMessageOf(error));
    } finally {
      setNotificationSaving(false);
    }
  };

  // -- security: password change + session revocation -------------------
  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!passwordDraft.current_password) errors.current_password = "Current password is required.";
    if (!passwordDraft.new_password) {
      errors.new_password = "New password is required.";
    } else {
      if (passwordDraft.new_password.length < MIN_PASSWORD_LENGTH) {
        errors.new_password = `Must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      if (/^\d+$/.test(passwordDraft.new_password)) {
        errors.new_password = "Must not be entirely numeric.";
      }
      if (passwordDraft.new_password === passwordDraft.current_password) {
        errors.new_password = "New password must be different from the current password.";
      }
    }
    if (passwordDraft.new_password !== passwordDraft.confirm_password) {
      errors.confirm_password = "New password and confirmation do not match.";
    }
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast("error", "Please correct the highlighted fields before saving.");
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await settingsApi.changePassword(passwordDraft);
      setPasswordDraft({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordErrors({});
      await loadSecurity();
      showToast(
        "success",
        `${result.message} ${result.sessions_revoked} existing session(s) were signed out.`
      );
    } catch (error) {
      const fieldErrors = fieldErrorsOf(error);
      const nextErrors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(fieldErrors)) {
        nextErrors[key] = messages.join(" ");
      }
      setPasswordErrors(nextErrors);
      showToast("error", errorMessageOf(error));
    } finally {
      setPasswordSaving(false);
    }
  };

  const confirmRevokeSessions = async () => {
    setRevokeSaving(true);
    try {
      const result = await settingsApi.revokeOtherSessions();
      setRevokePending(false);
      await loadSecurity();
      showToast("success", result.message);
    } catch (error) {
      showToast("error", errorMessageOf(error));
    } finally {
      setRevokeSaving(false);
    }
  };

  // -- derived ---------------------------------------------------------
  const generalDirtyFields = useMemo(() => dirtyStoreFields(GENERAL_FIELDS), [store, storeDraft]);
  const businessDirtyFields = useMemo(() => dirtyStoreFields(BUSINESS_FIELDS), [store, storeDraft]);

  const cancellationOptions = useMemo(() => {
    const options: string[] = [...CANCELLATION_STAGES];
    const stored = store?.cancellation_allowed_until;
    if (stored && !options.includes(stored)) options.push(stored);
    return options;
  }, [store?.cancellation_allowed_until]);

  const activeIndex = SECTIONS.findIndex((section) => section.id === activeSection);
  const activePanelId = `settings-panel-${activeSection}`;
  const activeTabId = `settings-tab-${activeSection}`;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (activeIndex + delta + SECTIONS.length) % SECTIONS.length;
    setActiveSection(SECTIONS[nextIndex].id);
  };

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="space-y-6" data-testid="settings-page">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-[#0B3A63]">Settings</h1>
        <p className="text-sm text-slate-500">
          Configuration for your administrator account, this store, and outbound customer
          communication. Every value is stored in the backend database.
        </p>
      </header>

      {/* Tab strip — horizontally scrollable so it can never overflow the page. */}
      <div className="border-b border-slate-200 overflow-x-auto" role="tablist" aria-label="Settings sections">
        <div className="flex gap-1 min-w-max">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            return (
              <button
                key={section.id}
                id={`settings-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${section.id}`}
                tabIndex={isActive ? 0 : -1}
                data-testid={`settings-tab-${section.id}`}
                onClick={() => setActiveSection(section.id)}
                onKeyDown={handleTabKeyDown}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-[#F2A900] text-[#0B3A63]"
                    : "border-transparent text-slate-500 hover:text-[#0B3A63] hover:border-slate-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {toast ? (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          data-testid="settings-toast"
          className={`p-4 rounded-xl border flex items-start gap-3 text-sm ${
            toast.tone === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span className="break-words">{toast.message}</span>
        </div>
      ) : null}

      <div
        role="tabpanel"
        id={activePanelId}
        aria-labelledby={activeTabId}
        tabIndex={0}
        className="space-y-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3A63]/20 rounded-lg"
      >
        {/* ============================ GENERAL ============================ */}
        {activeSection === "general" ? (
          storeLoading && !store ? (
            <SectionSkeleton rows={3} />
          ) : storeError && !store ? (
            <ErrorBanner message={storeError} onRetry={() => reloadSection("general")} />
          ) : store && storeDraft ? (
            <form
              onSubmit={(event) => submitStore(event, GENERAL_FIELDS)}
              className="space-y-6"
              noValidate
            >
              <Panel
                title="Company identity"
                description="Shown across the storefront, invoices and outbound email. Stored in company_store_configurations."
                footer={
                  <>
                    <span className="text-xs text-slate-500 mr-auto">
                      {generalDirtyFields.length > 0
                        ? `${generalDirtyFields.length} unsaved change(s)`
                        : "All changes saved"}
                    </span>
                    <SaveButton
                      saving={storeSaving}
                      disabled={generalDirtyFields.length === 0}
                      testId="settings-general-save"
                    />
                  </>
                }
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Field
                    id="legal_company_name"
                    label="Legal company name"
                    required
                    error={storeFieldErrors.legal_company_name}
                    hint="The name that must appear on statutory GST invoices."
                  >
                    <input
                      id="legal_company_name"
                      className={inputClass}
                      value={storeDraft.legal_company_name}
                      onChange={(event) =>
                        updateStoreDraft("legal_company_name", event.target.value)
                      }
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.legal_company_name)}
                    />
                  </Field>

                  <Field
                    id="brand_name"
                    label="Brand / display name"
                    required
                    error={storeFieldErrors.brand_name}
                  >
                    <input
                      id="brand_name"
                      className={inputClass}
                      value={storeDraft.brand_name}
                      onChange={(event) => updateStoreDraft("brand_name", event.target.value)}
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.brand_name)}
                    />
                  </Field>

                  <Field
                    id="support_email"
                    label="Support email"
                    required
                    error={storeFieldErrors.support_email}
                  >
                    <input
                      id="support_email"
                      type="email"
                      className={inputClass}
                      value={storeDraft.support_email}
                      onChange={(event) => updateStoreDraft("support_email", event.target.value)}
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.support_email)}
                    />
                  </Field>

                  <Field
                    id="support_phone"
                    label="Support phone"
                    required
                    error={storeFieldErrors.support_phone}
                  >
                    <input
                      id="support_phone"
                      className={inputClass}
                      value={storeDraft.support_phone}
                      onChange={(event) => updateStoreDraft("support_phone", event.target.value)}
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.support_phone)}
                    />
                  </Field>

                  <Field
                    id="currency_code"
                    label="Currency code"
                    required
                    error={storeFieldErrors.currency_code}
                    hint="ISO 4217 code used for every monetary value."
                  >
                    <input
                      id="currency_code"
                      className={inputClass}
                      value={storeDraft.currency_code}
                      onChange={(event) =>
                        updateStoreDraft("currency_code", event.target.value.toUpperCase())
                      }
                      disabled={storeSaving}
                      maxLength={3}
                      aria-invalid={Boolean(storeFieldErrors.currency_code)}
                    />
                  </Field>

                  <Field
                    id="currency_symbol"
                    label="Currency symbol"
                    required
                    error={storeFieldErrors.currency_symbol}
                  >
                    <input
                      id="currency_symbol"
                      className={inputClass}
                      value={storeDraft.currency_symbol}
                      onChange={(event) => updateStoreDraft("currency_symbol", event.target.value)}
                      disabled={storeSaving}
                      maxLength={4}
                      aria-invalid={Boolean(storeFieldErrors.currency_symbol)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="Locale & runtime"
                description="Deployment-level values. These are read-only because they are set by the backend configuration, not by an administrator."
              >
                {systemLoading && !system ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-slate-100 rounded" />
                    <div className="h-4 bg-slate-100 rounded w-2/3" />
                  </div>
                ) : systemError && !system ? (
                  <ErrorBanner message={systemError} onRetry={() => reloadSection("system")} />
                ) : system ? (
                  <div>
                    <ReadOnlyRow label="Server time zone" value={system.time_zone} />
                    <ReadOnlyRow label="Default language" value="en-us" />
                    <ReadOnlyRow label="Application version" value={system.app_version} mono />
                    <ReadOnlyRow label="Environment" value={system.environment} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No runtime information available.</p>
                )}
              </Panel>
            </form>
          ) : (
            <p className="text-sm text-slate-500">No configuration available.</p>
          )
        ) : null}

        {/* ============================ PROFILE ============================ */}
        {activeSection === "profile" ? (
          profileLoading && !profile ? (
            <SectionSkeleton rows={3} />
          ) : profileError && !profile ? (
            <ErrorBanner message={profileError} onRetry={() => reloadSection("profile")} />
          ) : profile ? (
            <form onSubmit={submitProfile} className="space-y-6" noValidate>
              <Panel
                title="Administrator profile"
                description="Loaded from your authenticated account (users table). Role and account status are controlled by the backend and cannot be edited here."
                footer={
                  <>
                    <span className="text-xs text-slate-500 mr-auto">
                      {profileDirty ? "Unsaved changes" : "All changes saved"}
                    </span>
                    <SaveButton
                      saving={profileSaving}
                      disabled={!profileDirty}
                      testId="settings-profile-save"
                    />
                  </>
                }
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Field
                    id="profile_first_name"
                    label="First name"
                    required
                    error={profileFieldErrors.first_name}
                  >
                    <input
                      id="profile_first_name"
                      className={inputClass}
                      value={profileDraft.first_name}
                      onChange={(event) =>
                        setProfileDraft((previous) => ({
                          ...previous,
                          first_name: event.target.value,
                        }))
                      }
                      disabled={profileSaving}
                      aria-invalid={Boolean(profileFieldErrors.first_name)}
                    />
                  </Field>

                  <Field
                    id="profile_last_name"
                    label="Last name"
                    required
                    error={profileFieldErrors.last_name}
                  >
                    <input
                      id="profile_last_name"
                      className={inputClass}
                      value={profileDraft.last_name}
                      onChange={(event) =>
                        setProfileDraft((previous) => ({
                          ...previous,
                          last_name: event.target.value,
                        }))
                      }
                      disabled={profileSaving}
                      aria-invalid={Boolean(profileFieldErrors.last_name)}
                    />
                  </Field>

                  <Field
                    id="profile_phone"
                    label="Phone"
                    error={profileFieldErrors.phone}
                    hint="Optional. Shown on invoices and used for delivery coordination."
                  >
                    <input
                      id="profile_phone"
                      className={inputClass}
                      value={profileDraft.phone}
                      onChange={(event) =>
                        setProfileDraft((previous) => ({ ...previous, phone: event.target.value }))
                      }
                      disabled={profileSaving}
                      aria-invalid={Boolean(profileFieldErrors.phone)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="Account"
                description="Identity attributes owned by the authentication system."
              >
                <div>
                  <ReadOnlyRow label="Email (sign-in identity)" value={profile.email} />
                  <ReadOnlyRow label="Username" value={profile.username || "—"} />
                  <ReadOnlyRow
                    label="Role"
                    value={profile.role === "admin" ? "Administrator" : "Customer"}
                  />
                  <ReadOnlyRow
                    label="Account status"
                    value={profile.is_active ? "Active" : "Disabled"}
                  />
                  <ReadOnlyRow label="Account created" value={formatDateTime(profile.created_at)} />
                  <ReadOnlyRow
                    label="Privileges"
                    value={[
                      profile.is_superuser ? "Superuser" : null,
                      profile.is_staff ? "Staff" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Standard"}
                  />
                </div>
                <p className="text-xs text-slate-500 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  Email address, role and account status are managed by the backend authorization
                  layer. Requests to change them are rejected with a validation error.
                </p>
              </Panel>
            </form>
          ) : (
            <p className="text-sm text-slate-500">No profile available.</p>
          )
        ) : null}

        {/* ============================ SECURITY =========================== */}
        {activeSection === "security" ? (
          securityLoading && !security ? (
            <SectionSkeleton rows={3} />
          ) : securityError && !security ? (
            <ErrorBanner message={securityError} onRetry={() => reloadSection("security")} />
          ) : security ? (
            <div className="space-y-6">
              <Panel
                title="Account security"
                description="Facts read from the authentication database. No unverified security claims are displayed."
              >
                <div>
                  <ReadOnlyRow label="Signed in as" value={security.email} />
                  <ReadOnlyRow label="Role" value={security.role_display} />
                  <ReadOnlyRow label="Account status" value={security.account_status} />
                  <ReadOnlyRow label="Last login" value={formatDateTime(security.last_login)} />
                  <ReadOnlyRow
                    label="Account created"
                    value={formatDateTime(security.account_created_at)}
                  />
                  <ReadOnlyRow
                    label="Configuration changes recorded"
                    value={security.configuration_changes_count.toLocaleString("en-IN")}
                  />
                  <ReadOnlyRow
                    label="Last configuration change"
                    value={formatDateTime(security.last_configuration_change_at)}
                  />
                  <ReadOnlyRow
                    label="Two-factor authentication"
                    value="Not configured for this deployment"
                  />
                </div>
                <p className="text-xs text-slate-500 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  Two-factor authentication is not implemented by this backend, so no toggle is
                  offered. Sign-in uses email and password, with optional Google sign-in.
                </p>
              </Panel>

              <Panel
                title="Active sessions"
                description="Every unexpired, non-revoked sign-in token issued to your account, from the token registry."
                footer={
                  <>
                    <span className="text-xs text-slate-500 mr-auto">
                      {security.active_sessions_count.toLocaleString("en-IN")} active session(s)
                    </span>
                    {revokePending ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-rose-700">
                          Sign out all other sessions?
                        </span>
                        <button
                          type="button"
                          onClick={confirmRevokeSessions}
                          disabled={revokeSaving}
                          data-testid="settings-revoke-confirm"
                          className="inline-flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
                        >
                          {revokeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          {revokeSaving ? "Signing out…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokePending(false)}
                          disabled={revokeSaving}
                          className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRevokePending(true)}
                        data-testid="settings-revoke-sessions"
                        className="inline-flex items-center gap-2 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-rose-50 transition-colors"
                      >
                        <KeyRound className="w-4 h-4" />
                        Sign out other sessions
                      </button>
                    )}
                  </>
                }
              >
                {security.recent_sessions.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No active session records were found for your account.
                  </p>
                ) : (
                  <div className="overflow-x-auto -mx-5 px-5">
                    <table className="w-full text-left border-collapse min-w-[420px]">
                      <thead>
                        <tr className="bg-slate-50/80">
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Session
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Started
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Expires
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {security.recent_sessions.map((session) => (
                          <tr key={session.id} data-testid="settings-session-row">
                            <td className="px-4 py-3 text-sm font-mono text-slate-600">
                              #{session.id}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {formatDateTime(session.created_at)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {formatDateTime(session.expires_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {security.active_sessions_count > security.recent_sessions.length ? (
                      <p className="text-xs text-slate-500 mt-3">
                        Showing the {security.recent_sessions.length} most recent of{" "}
                        {security.active_sessions_count.toLocaleString("en-IN")} active sessions.
                      </p>
                    ) : null}
                  </div>
                )}
              </Panel>

              <form onSubmit={submitPassword} noValidate>
                <Panel
                  title="Change password"
                  description="The current password is verified, the new password is validated against the configured Django password policy and stored only as a hash. Every existing session is then revoked."
                  footer={
                    <SaveButton
                      saving={passwordSaving}
                      disabled={false}
                      label="Change password"
                      testId="settings-password-save"
                    />
                  }
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <Field
                      id="current_password"
                      label="Current password"
                      required
                      error={passwordErrors.current_password}
                    >
                      <input
                        id="current_password"
                        type="password"
                        autoComplete="current-password"
                        className={inputClass}
                        value={passwordDraft.current_password}
                        onChange={(event) =>
                          setPasswordDraft((previous) => ({
                            ...previous,
                            current_password: event.target.value,
                          }))
                        }
                        disabled={passwordSaving}
                        aria-invalid={Boolean(passwordErrors.current_password)}
                      />
                    </Field>

                    <Field
                      id="new_password"
                      label="New password"
                      required
                      error={passwordErrors.new_password}
                      hint={`At least ${MIN_PASSWORD_LENGTH} characters, not entirely numeric, not a commonly used password, and not too similar to your name or email.`}
                    >
                      <input
                        id="new_password"
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                        value={passwordDraft.new_password}
                        onChange={(event) =>
                          setPasswordDraft((previous) => ({
                            ...previous,
                            new_password: event.target.value,
                          }))
                        }
                        disabled={passwordSaving}
                        aria-invalid={Boolean(passwordErrors.new_password)}
                      />
                    </Field>

                    <Field
                      id="confirm_password"
                      label="Confirm new password"
                      required
                      error={passwordErrors.confirm_password}
                    >
                      <input
                        id="confirm_password"
                        type="password"
                        autoComplete="new-password"
                        className={inputClass}
                        value={passwordDraft.confirm_password}
                        onChange={(event) =>
                          setPasswordDraft((previous) => ({
                            ...previous,
                            confirm_password: event.target.value,
                          }))
                        }
                        disabled={passwordSaving}
                        aria-invalid={Boolean(passwordErrors.confirm_password)}
                      />
                    </Field>
                  </div>
                  <p className="text-xs text-slate-500 flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    Passwords are never logged or returned by the API. After a successful change you
                    stay signed in on this device while all other sessions are invalidated.
                  </p>
                </Panel>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No security information available.</p>
          )
        ) : null}

        {/* ========================= NOTIFICATIONS ========================= */}
        {activeSection === "notifications" ? (
          notificationsLoading && !notifications ? (
            <SectionSkeleton rows={2} />
          ) : notificationsError && !notifications ? (
            <ErrorBanner message={notificationsError} onRetry={() => reloadSection("notifications")} />
          ) : notifications && notificationDraft ? (
            <form onSubmit={submitNotifications} className="space-y-6">
              <Panel
                title="Customer communication policy"
                description="Persisted in notification_settings and enforced by the communication service at dispatch time. A disabled category is recorded as SKIPPED and never transmitted."
                footer={
                  <>
                    <span className="text-xs text-slate-500 mr-auto">
                      {notificationsDirty ? "Unsaved changes" : "All changes saved"}
                    </span>
                    <SaveButton
                      saving={notificationSaving}
                      disabled={!notificationsDirty}
                      testId="settings-notifications-save"
                    />
                  </>
                }
              >
                <ToggleRow
                  id="email_notifications_enabled"
                  label="Email notifications"
                  description="Master switch for all configurable outbound customer email below."
                  checked={notificationDraft.email_notifications_enabled}
                  onChange={(next) =>
                    setNotificationDraft((previous) =>
                      previous ? { ...previous, email_notifications_enabled: next } : previous
                    )
                  }
                  disabled={notificationSaving}
                />

                <div className="pt-2 space-y-0">
                  <ToggleRow
                    id="order_notifications"
                    label="Order notifications"
                    description="Order confirmation and fulfilment lifecycle updates (ORDER_*)."
                    checked={notificationDraft.order_notifications}
                    onChange={(next) =>
                      setNotificationDraft((previous) =>
                        previous ? { ...previous, order_notifications: next } : previous
                      )
                    }
                    disabled={notificationSaving || !notificationDraft.email_notifications_enabled}
                  />
                  <ToggleRow
                    id="payment_notifications"
                    label="Payment notifications"
                    description="Payment confirmations and failures (PAYMENT_*)."
                    checked={notificationDraft.payment_notifications}
                    onChange={(next) =>
                      setNotificationDraft((previous) =>
                        previous ? { ...previous, payment_notifications: next } : previous
                      )
                    }
                    disabled={notificationSaving || !notificationDraft.email_notifications_enabled}
                  />
                  <ToggleRow
                    id="invoice_notifications"
                    label="Invoice notifications"
                    description="Statutory GST tax invoice issuance (INVOICE_*)."
                    checked={notificationDraft.invoice_notifications}
                    onChange={(next) =>
                      setNotificationDraft((previous) =>
                        previous ? { ...previous, invoice_notifications: next } : previous
                      )
                    }
                    disabled={notificationSaving || !notificationDraft.email_notifications_enabled}
                  />
                  <ToggleRow
                    id="quotation_notifications"
                    label="Quotation notifications"
                    description="Commercial quotation approvals and updates (QUOTATION_*)."
                    checked={notificationDraft.quotation_notifications}
                    onChange={(next) =>
                      setNotificationDraft((previous) =>
                        previous ? { ...previous, quotation_notifications: next } : previous
                      )
                    }
                    disabled={notificationSaving || !notificationDraft.email_notifications_enabled}
                  />
                  <ToggleRow
                    id="customer_notifications"
                    label="Customer notifications"
                    description="Registration welcome messages and inquiry acknowledgements (CUSTOMER_*, INQUIRY_*)."
                    checked={notificationDraft.customer_notifications}
                    onChange={(next) =>
                      setNotificationDraft((previous) =>
                        previous ? { ...previous, customer_notifications: next } : previous
                      )
                    }
                    disabled={notificationSaving || !notificationDraft.email_notifications_enabled}
                  />
                </div>

                <div className="pt-2">
                  <Field
                    id="notification_reason"
                    label="Change note"
                    hint="Optional. Recorded in the configuration audit trail."
                  >
                    <input
                      id="notification_reason"
                      className={inputClass}
                      value={notificationReason}
                      onChange={(event) => setNotificationReason(event.target.value)}
                      disabled={notificationSaving}
                      maxLength={200}
                    />
                  </Field>
                </div>

                <div className="pt-1">
                  <ReadOnlyRow
                    label="Last updated"
                    value={formatDateTime(notifications.updated_at)}
                  />
                  <ReadOnlyRow
                    label="Last updated by"
                    value={notifications.updated_by_email || "Not yet changed by an administrator"}
                  />
                </div>

                <p className="text-xs text-slate-500 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  Password-reset email is security-critical and is always delivered, regardless of
                  these switches. Events with no category mapping are also always delivered.
                </p>
              </Panel>
            </form>
          ) : (
            <p className="text-sm text-slate-500">No notification policy available.</p>
          )
        ) : null}

        {/* ============================ BUSINESS =========================== */}
        {activeSection === "business" ? (
          storeLoading && !store ? (
            <SectionSkeleton rows={4} />
          ) : storeError && !store ? (
            <ErrorBanner message={storeError} onRetry={() => reloadSection("business")} />
          ) : store && storeDraft ? (
            <form
              onSubmit={(event) => submitStore(event, BUSINESS_FIELDS)}
              className="space-y-6"
              noValidate
            >
              <Panel
                title="Statutory identity"
                description="GST and PAN values are validated by the backend against the statutory Indian formats before they are stored."
                footer={
                  <>
                    <span className="text-xs text-slate-500 mr-auto">
                      {businessDirtyFields.length > 0
                        ? `${businessDirtyFields.length} unsaved change(s)`
                        : "All changes saved"}
                    </span>
                    <SaveButton
                      saving={storeSaving}
                      disabled={businessDirtyFields.length === 0}
                      testId="settings-business-save"
                    />
                  </>
                }
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Field id="gstin" label="GSTIN" error={storeFieldErrors.gstin} hint="15 characters.">
                    <input
                      id="gstin"
                      className={inputClass}
                      value={storeDraft.gstin}
                      onChange={(event) =>
                        updateStoreDraft("gstin", event.target.value.toUpperCase())
                      }
                      disabled={storeSaving}
                      maxLength={15}
                      aria-invalid={Boolean(storeFieldErrors.gstin)}
                    />
                  </Field>

                  <Field id="pan" label="PAN" error={storeFieldErrors.pan} hint="10 characters.">
                    <input
                      id="pan"
                      className={inputClass}
                      value={storeDraft.pan}
                      onChange={(event) => updateStoreDraft("pan", event.target.value.toUpperCase())}
                      disabled={storeSaving}
                      maxLength={10}
                      aria-invalid={Boolean(storeFieldErrors.pan)}
                    />
                  </Field>

                  <Field
                    id="registered_address"
                    label="Registered address"
                    error={storeFieldErrors.registered_address}
                  >
                    <textarea
                      id="registered_address"
                      rows={3}
                      className={`${inputClass} resize-y`}
                      value={storeDraft.registered_address}
                      onChange={(event) =>
                        updateStoreDraft("registered_address", event.target.value)
                      }
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.registered_address)}
                    />
                  </Field>

                  <Field
                    id="warehouse_address"
                    label="Warehouse address"
                    error={storeFieldErrors.warehouse_address}
                  >
                    <textarea
                      id="warehouse_address"
                      rows={3}
                      className={`${inputClass} resize-y`}
                      value={storeDraft.warehouse_address}
                      onChange={(event) =>
                        updateStoreDraft("warehouse_address", event.target.value)
                      }
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.warehouse_address)}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="Settlement account"
                description="Bank coordinates printed on invoices. These fields are withheld from anonymous and customer API responses."
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Field id="bank_name" label="Bank name">
                    <input
                      id="bank_name"
                      className={inputClass}
                      value={storeDraft.bank_name ?? ""}
                      onChange={(event) => updateStoreDraft("bank_name", event.target.value)}
                      disabled={storeSaving}
                    />
                  </Field>

                  <Field id="bank_branch" label="Branch">
                    <input
                      id="bank_branch"
                      className={inputClass}
                      value={storeDraft.bank_branch ?? ""}
                      onChange={(event) => updateStoreDraft("bank_branch", event.target.value)}
                      disabled={storeSaving}
                    />
                  </Field>

                  <Field id="bank_account_number" label="Account number">
                    <input
                      id="bank_account_number"
                      className={inputClass}
                      value={storeDraft.bank_account_number ?? ""}
                      onChange={(event) =>
                        updateStoreDraft("bank_account_number", event.target.value)
                      }
                      disabled={storeSaving}
                    />
                  </Field>

                  <Field id="bank_ifsc" label="IFSC">
                    <input
                      id="bank_ifsc"
                      className={inputClass}
                      value={storeDraft.bank_ifsc ?? ""}
                      onChange={(event) =>
                        updateStoreDraft("bank_ifsc", event.target.value.toUpperCase())
                      }
                      disabled={storeSaving}
                      maxLength={11}
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="Commercial policy"
                description="Behaviour rules applied by the order, payment and returns services. These configure policy — they never override a financial calculation."
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <Field
                    id="rounding_mode"
                    label="Invoice rounding"
                    hint="Applied when computing invoice totals."
                  >
                    <select
                      id="rounding_mode"
                      className={inputClass}
                      value={storeDraft.rounding_mode}
                      onChange={(event) =>
                        updateStoreDraft(
                          "rounding_mode",
                          event.target.value === "NO_ROUNDING" ? "NO_ROUNDING" : "ROUND_HALF_UP"
                        )
                      }
                      disabled={storeSaving}
                    >
                      <option value="ROUND_HALF_UP">Round half up</option>
                      <option value="NO_ROUNDING">No rounding</option>
                    </select>
                  </Field>

                  <Field
                    id="auto_cancel_unpaid_minutes"
                    label="Auto-cancel unpaid orders after"
                    error={storeFieldErrors.auto_cancel_unpaid_minutes}
                    hint="Minutes."
                  >
                    <input
                      id="auto_cancel_unpaid_minutes"
                      type="number"
                      min={1}
                      className={inputClass}
                      value={String(storeDraft.auto_cancel_unpaid_minutes)}
                      onChange={(event) =>
                        updateStoreDraft(
                          "auto_cancel_unpaid_minutes",
                          event.target.value === "" ? 0 : Number(event.target.value)
                        )
                      }
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.auto_cancel_unpaid_minutes)}
                    />
                  </Field>

                  <Field
                    id="return_window_days"
                    label="Return window"
                    error={storeFieldErrors.return_window_days}
                    hint="Days after delivery."
                  >
                    <input
                      id="return_window_days"
                      type="number"
                      min={0}
                      className={inputClass}
                      value={String(storeDraft.return_window_days)}
                      onChange={(event) =>
                        updateStoreDraft(
                          "return_window_days",
                          event.target.value === "" ? 0 : Number(event.target.value)
                        )
                      }
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.return_window_days)}
                    />
                  </Field>

                  <Field
                    id="cancellation_allowed_until"
                    label="Cancellation allowed until"
                    error={storeFieldErrors.cancellation_allowed_until}
                  >
                    <select
                      id="cancellation_allowed_until"
                      className={inputClass}
                      value={storeDraft.cancellation_allowed_until}
                      onChange={(event) =>
                        updateStoreDraft("cancellation_allowed_until", event.target.value)
                      }
                      disabled={storeSaving}
                    >
                      {cancellationOptions.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    id="cod_max_limit"
                    label="COD maximum limit"
                    error={storeFieldErrors.cod_max_limit}
                    hint="Maximum order value eligible for cash on delivery."
                  >
                    <input
                      id="cod_max_limit"
                      className={inputClass}
                      value={storeDraft.cod_max_limit}
                      onChange={(event) => updateStoreDraft("cod_max_limit", event.target.value)}
                      disabled={storeSaving}
                      aria-invalid={Boolean(storeFieldErrors.cod_max_limit)}
                    />
                  </Field>
                </div>

                <div className="pt-2">
                  <ToggleRow
                    id="require_shipping_awb"
                    label="Require tracking number (AWB) before marking shipped"
                    checked={storeDraft.require_shipping_awb}
                    onChange={(next) => updateStoreDraft("require_shipping_awb", next)}
                    disabled={storeSaving}
                  />
                  <ToggleRow
                    id="upi_enabled"
                    label="Accept UPI payments"
                    checked={storeDraft.upi_enabled}
                    onChange={(next) => updateStoreDraft("upi_enabled", next)}
                    disabled={storeSaving}
                  />
                  <ToggleRow
                    id="cards_enabled"
                    label="Accept card payments"
                    checked={storeDraft.cards_enabled}
                    onChange={(next) => updateStoreDraft("cards_enabled", next)}
                    disabled={storeSaving}
                  />
                  <ToggleRow
                    id="netbanking_enabled"
                    label="Accept net banking"
                    checked={storeDraft.netbanking_enabled}
                    onChange={(next) => updateStoreDraft("netbanking_enabled", next)}
                    disabled={storeSaving}
                  />
                  <ToggleRow
                    id="cod_enabled"
                    label="Accept cash on delivery"
                    description="Bounded by the COD maximum limit above."
                    checked={storeDraft.cod_enabled}
                    onChange={(next) => updateStoreDraft("cod_enabled", next)}
                    disabled={storeSaving}
                  />
                  <ToggleRow
                    id="guest_checkout_enabled"
                    label="Allow guest checkout"
                    description="Lets customers order without creating an account."
                    checked={storeDraft.guest_checkout_enabled}
                    onChange={(next) => updateStoreDraft("guest_checkout_enabled", next)}
                    disabled={storeSaving}
                  />
                  <ToggleRow
                    id="is_maintenance_mode"
                    label="Maintenance mode"
                    description="When enabled, the storefront is closed for orders."
                    checked={storeDraft.is_maintenance_mode}
                    onChange={(next) => updateStoreDraft("is_maintenance_mode", next)}
                    disabled={storeSaving}
                  />
                </div>

                <Field
                  id="maintenance_notice"
                  label="Maintenance notice"
                  hint="Displayed to customers while maintenance mode is enabled."
                >
                  <textarea
                    id="maintenance_notice"
                    rows={2}
                    className={`${inputClass} resize-y`}
                    value={storeDraft.maintenance_notice ?? ""}
                    onChange={(event) =>
                      updateStoreDraft(
                        "maintenance_notice",
                        event.target.value === "" ? null : event.target.value
                      )
                    }
                    disabled={storeSaving}
                  />
                </Field>

                <p className="text-xs text-slate-500 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  Saved through the existing company configuration API, which records every change in
                  the audit trail. Financial calculations, tax rates and delivery charges keep their
                  own dedicated modules and are not modified here.
                </p>
              </Panel>
            </form>
          ) : (
            <p className="text-sm text-slate-500">No configuration available.</p>
          )
        ) : null}

        {/* ============================= SYSTEM ============================ */}
        {activeSection === "system" ? (
          systemLoading && !system ? (
            <SectionSkeleton rows={3} />
          ) : systemError && !system ? (
            <ErrorBanner message={systemError} onRetry={() => reloadSection("system")} />
          ) : system ? (
            <div className="space-y-6">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => reloadSection("system")}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Re-run diagnostics
                </button>
              </div>

              <Panel
                title="Runtime"
                description="Read-only diagnostics obtained from the backend at request time. No secret, credential or database connection detail is exposed."
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                  <div>
                    <ReadOnlyRow label="Application version" value={system.app_version} mono />
                    <ReadOnlyRow label="API version" value={system.api_version} />
                    <ReadOnlyRow label="Environment" value={system.environment} />
                    <ReadOnlyRow
                      label="Debug mode"
                      value={system.debug ? "Enabled" : "Disabled"}
                    />
                    <ReadOnlyRow label="Server time zone" value={system.time_zone} />
                    <ReadOnlyRow label="Server time" value={formatDateTime(system.server_time)} />
                  </div>
                  <div>
                    <ReadOnlyRow label="Django" value={system.django_version} mono />
                    <ReadOnlyRow label="Django REST Framework" value={system.drf_version} mono />
                    <ReadOnlyRow label="Python" value={system.python_version} mono />
                    <ReadOnlyRow
                      label="API status"
                      value={system.api_status === "operational" ? "Operational" : "Degraded"}
                    />
                    <ReadOnlyRow
                      label="Database"
                      value={system.database_status === "connected" ? "Connected" : "Disconnected"}
                    />
                    <ReadOnlyRow
                      label="Database engine / latency"
                      value={`${system.database_engine} · ${system.database_latency_ms} ms`}
                    />
                  </div>
                </div>
              </Panel>

              <Panel
                title="Last system update"
                description="The most recent database migration applied to this deployment."
              >
                {system.last_migration ? (
                  <div>
                    <ReadOnlyRow
                      label="Migration"
                      value={`${system.last_migration.app}.${system.last_migration.name}`}
                      mono
                    />
                    <ReadOnlyRow
                      label="Applied at"
                      value={formatDateTime(system.last_migration.applied_at)}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No migration history recorded.</p>
                )}
                <p className="text-xs text-slate-500 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  Signing keys, database credentials, mail credentials and environment variable
                  values are deliberately excluded from this endpoint.
                </p>
              </Panel>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No system information available.</p>
          )
        ) : null}
      </div>

      <p className="text-xs text-slate-400">
        Settings are stored in MySQL through the existing Django APIs and are protected by
        administrative permissions on every request. Frontend route guards are never treated as
        authorization.
      </p>
    </div>
  );
}
