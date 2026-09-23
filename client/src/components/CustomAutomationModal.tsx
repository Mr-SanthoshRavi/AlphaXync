import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';

export interface VariableItem {
  tag: string;
  label: string;
  sample: string;
  category: string;
}

export interface AudienceCriterion {
  field: string;
  operator: 'EQUALS' | 'CONTAINS' | 'NOT_EQUALS';
  value: string;
}

export interface FilterColumnItem {
  key: string;
  label: string;
  values: string[];
}

interface CustomAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialData?: any | null;
}

export const CustomAutomationModal: React.FC<CustomAutomationModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialData
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('');
  const [targetType, setTargetType] = useState<'ALL' | 'CRITERIA'>('ALL');
  const [criteria, setCriteria] = useState<AudienceCriterion[]>([]);
  const [filterColumns, setFilterColumns] = useState<FilterColumnItem[]>([]);
  const [loadingFilterOptions, setLoadingFilterOptions] = useState(false);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [totalEligible, setTotalEligible] = useState<number | null>(null);
  const [sampleRecipients, setSampleRecipients] = useState<string[]>([]);
  const [loadingMatchCount, setLoadingMatchCount] = useState(false);
  const [selectedFeeStatus, setSelectedFeeStatus] = useState('ALL');
  const [triggerType, setTriggerType] = useState<'MANUAL' | 'ON_SYNC' | 'BEFORE_DUE_DATE' | 'AFTER_PAYMENT' | 'SCHEDULED' | 'RECURRING'>('MANUAL');
  const [offsetDays, setOffsetDays] = useState<number>(-2);
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<number>(2);
  const [maxExecutions, setMaxExecutions] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [recurringInterval, setRecurringInterval] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');
  const [isOneTimeOnly, setIsOneTimeOnly] = useState(true);
  const [mediaUrl, setMediaUrl] = useState('');
  const [isAiPolishing, setIsAiPolishing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ polished: string; corrections: string[]; summary: string } | null>(null);

  // Variable Discovery & Autocomplete
  const [variables, setVariables] = useState<VariableItem[]>([]);
  const [loadingVars, setLoadingVars] = useState(true);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live Student Preview
  const [students, setStudents] = useState<any[]>([]);
  const [previewStudentId, setPreviewStudentId] = useState<string>('');
  const [renderedPreview, setRenderedPreview] = useState<string>('');
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tagColumnFilter, setTagColumnFilter] = useState<string>('ALL');
  const [tagSearchQuery, setTagSearchQuery] = useState<string>('');
  const [imageInputMode, setImageInputMode] = useState<'UPLOAD' | 'LINK'>('UPLOAD');
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Upload Handler for Invitation Card / Flyer
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image file size must be less than 10MB');
      return;
    }

    setIsUploadingImage(true);
    setErrorMsg(null);
    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await api.uploadAutomationMedia(file.name, base64Data);
        if (res?.mediaUrl) {
          setMediaUrl(res.mediaUrl);
        } else {
          setMediaUrl(base64Data);
        }
      } catch (err: any) {
        console.warn('Upload API error, using direct image data URL fallback:', err);
        setMediaUrl(reader.result as string);
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read image file');
      setIsUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  // 1-Tap Quick-Start Preset Applicator
  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    if (presetKey === 'GREETING') {
      setName('New Contact / Welcome Greeting');
      setDescription('Sends automatic personalized WhatsApp greeting upon new contact detection in Google Sheets');
      setTriggerType('ON_SYNC');
      setIsOneTimeOnly(true);
      setMaxExecutions(1);
      setSelectedFeeStatus('ALL');
      setTargetType('ALL');
      setTemplate(
        'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nWe will use this WhatsApp number for important updates regarding {{course}}.\nIf you have any questions, feel free to reply directly to this message.'
      );
    } else if (presetKey === 'PRE_PAYMENT') {
      setName('Pre-Payment Due Date Reminder');
      setDescription('Sends fee reminder 2 days before payment due date with secure online payment link');
      setTriggerType('BEFORE_DUE_DATE');
      setOffsetDays(-2);
      setIsOneTimeOnly(false);
      setRepeatIntervalDays(2);
      setMaxExecutions(2);
      setSelectedFeeStatus('HAS_BALANCE');
      setTargetType('ALL');
      setTemplate(
        'Dear {{student_name}}, gentle reminder from {{college_name}} that your tuition fee balance of {{balance}} is due on {{due_date}}.\nPlease complete your payment securely online:\n👉 {{payment_link}}\n(Disregard if already paid).'
      );
    } else if (presetKey === 'POST_PAYMENT') {
      setName('Payment Success & Instant Receipt');
      setDescription('Dispatches instant thank you note and payment acknowledgment as soon as payment is captured');
      setTriggerType('AFTER_PAYMENT');
      setIsOneTimeOnly(true);
      setMaxExecutions(1);
      setSelectedFeeStatus('PAID');
      setTargetType('ALL');
      setTemplate(
        'Hello {{student_name}}! 🎉\nWe have successfully received your payment of {{paid_amount}}.\nReceipt Reference: {{receipt_number}}\nRemaining Balance: {{balance}}.\nThank you for choosing {{college_name}}!'
      );
    } else if (presetKey === 'OVERDUE') {
      setName('Urgent Overdue Balance Chaser');
      setDescription('Chases overdue balances 1 day after due date with repeating follow-up every 2 days (max 3 times)');
      setTriggerType('BEFORE_DUE_DATE');
      setOffsetDays(1); // 1 day overdue
      setIsOneTimeOnly(false);
      setRepeatIntervalDays(2);
      setMaxExecutions(3);
      setSelectedFeeStatus('HAS_BALANCE');
      setTargetType('ALL');
      setTemplate(
        '⚠️ Urgent Notice: Dear {{student_name}}, your outstanding balance of {{balance}} is overdue as of {{due_date}}.\nPlease clear your dues immediately to prevent late-fee penalties:\n👉 {{payment_link}}\nContact the accounts office if you need assistance.'
      );
    } else if (presetKey === 'TAG_TARGET') {
      setName('Segmented Tag Notice');
      setDescription('Broadcasts announcement to contacts matching a specific tag or department in Google Sheets');
      setTriggerType('MANUAL');
      setIsOneTimeOnly(true);
      setMaxExecutions(1);
      setSelectedFeeStatus('ALL');
      setTargetType('CRITERIA');
      const firstCol = filterColumns[0]?.key || 'Course';
      const firstVal = filterColumns[0]?.values[0] || '';
      setCriteria([{ field: firstCol, operator: 'EQUALS', value: firstVal }]);
      setTemplate(
        '📢 Circular from {{college_name}}:\nHello {{student_name}}, please note that updates have been published for your batch ({{course}}).\nKindly review the schedule today.'
      );
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Load available dynamic variables from backend
    const loadVariables = async () => {
      try {
        setLoadingVars(true);
        const res = await api.getAutomationVariables();
        setVariables(res.variables || []);
      } catch (e) {
        console.error('Failed to load variables:', e);
      } finally {
        setLoadingVars(false);
      }
    };

    // Load dynamic Google Sheet filter columns and their distinct values
    const loadFilterOptions = async () => {
      try {
        setLoadingFilterOptions(true);
        const res = await api.getAutomationFilterOptions();
        const cols = res.columns || [];
        setFilterColumns(cols);
      } catch (e) {
        console.error('Failed to load filter options:', e);
      } finally {
        setLoadingFilterOptions(false);
      }
    };

    // Load student list for live preview
    const loadStudents = async () => {
      try {
        const feesRes = await api.getFees({ limit: 10 });
        const list = feesRes.fees || [];
        setStudents(list);
        if (list.length > 0 && !previewStudentId) {
          setPreviewStudentId(list[0].studentId || list[0].id);
        }
      } catch (e) {
        console.error('Failed to load students for preview:', e);
      }
    };

    loadVariables();
    loadFilterOptions();
    loadStudents();

    // Populate editing data if passed
    if (initialData) {
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      setTemplate(initialData.template || '');
      const aud = initialData.audience || {};
      const crit = aud.criteria || [];
      if (crit.length > 0 || (aud.feeStatus && aud.feeStatus !== 'ALL')) {
        setTargetType('CRITERIA');
        setCriteria(
          crit.map((c: any) => ({
            field: c.field || '',
            operator: c.operator || 'EQUALS',
            value: c.value || ''
          }))
        );
        setSelectedFeeStatus(aud.feeStatus || 'ALL');
      } else {
        setTargetType('ALL');
        setCriteria([]);
        setSelectedFeeStatus('ALL');
      }

      const sch = initialData.schedule || {};
      setTriggerType(sch.triggerType || 'MANUAL');
      setScheduledDate(sch.scheduledDate ? sch.scheduledDate.slice(0, 10) : '');
      setOffsetDays(sch.offsetDays ?? -2);
      setRepeatIntervalDays(sch.repeatIntervalDays ?? 2);
      setMaxExecutions(sch.maxExecutions ?? (sch.triggerType === 'MANUAL' ? 1 : 1));
      setRecurringInterval(sch.interval || 'DAILY');
      setIsOneTimeOnly(sch.maxExecutions === 1 || !sch.maxExecutions);
      setMediaUrl(initialData.mediaUrl || '');
      setAiSuggestion(null);
      setActivePreset(null);
    } else {
      setName('');
      setDescription('');
      setTemplate(
        'Hello {{student_name}} 👋\nWelcome to {{college_name}}.\nDear Parent: {{father_name}},\nWe will use this WhatsApp number for important updates regarding {{course}}.\nFee Balance: {{balance}}.'
      );
      setTargetType('ALL');
      setCriteria([]);
      setSelectedFeeStatus('ALL');
      setTriggerType('MANUAL');
      setOffsetDays(-2);
      setRepeatIntervalDays(2);
      setMaxExecutions(1);
      setIsOneTimeOnly(true);
      setMediaUrl('');
      setAiSuggestion(null);
      setActivePreset(null);
    }
    setErrorMsg(null);
  }, [isOpen, initialData]);

  // Live Recipient Matching Count update
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      try {
        setLoadingMatchCount(true);
        const validCriteria = criteria.filter((c) => c.field && c.value && c.value.trim());
        const res = await api.getAutomationMatchingCount({
          target: targetType,
          criteria: validCriteria,
          feeStatus: selectedFeeStatus
        });
        setMatchingCount(res.matchingCount);
        setTotalEligible(res.totalEligible);
        setSampleRecipients(res.sampleRecipients || []);
      } catch (err) {
        console.error('Failed to fetch matching recipient count:', err);
      } finally {
        setLoadingMatchCount(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, targetType, criteria, selectedFeeStatus]);

  // Live preview update
  useEffect(() => {
    if (!template) {
      setRenderedPreview('');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.previewAutomation(template, previewStudentId || undefined);
        setRenderedPreview(res.rendered || '');
      } catch {
        setRenderedPreview(template);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [template, previewStudentId]);

  // Textarea input watcher for inline autocomplete
  const handleTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTemplate(val);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastOpenBrace = textBeforeCursor.lastIndexOf('{');

    if (lastOpenBrace !== -1 && cursorPos - lastOpenBrace <= 20) {
      const query = textBeforeCursor.slice(lastOpenBrace + 1).replace(/^\{/, '');
      setShowAutocomplete(true);
      setAutocompleteFilter(query.toLowerCase());
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  // Filter autocomplete recommendations
  const filteredVariables = variables.filter((v) => {
    if (!autocompleteFilter) return true;
    const cleanTag = v.tag.replace(/[{}]/g, '').toLowerCase();
    const cleanLabel = v.label.toLowerCase();
    return cleanTag.includes(autocompleteFilter) || cleanLabel.includes(autocompleteFilter);
  });

  // Insert variable into template
  const insertVariable = (tag: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    let before = template.substring(0, start);
    let after = template.substring(end);

    // If typing autocomplete, replace open brace
    if (showAutocomplete) {
      const lastOpen = before.lastIndexOf('{');
      if (lastOpen !== -1) {
        before = before.substring(0, lastOpen);
      }
      setShowAutocomplete(false);
    }

    const newText = before + tag + after;
    setTemplate(newText);

    // Set cursor position right after inserted tag
    setTimeout(() => {
      textarea.focus();
      const newPos = before.length + tag.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 10);
  };

  // Keyboard navigation for autocomplete popup
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showAutocomplete || filteredVariables.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocompleteIndex((prev) => (prev + 1) % filteredVariables.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocompleteIndex((prev) => (prev - 1 + filteredVariables.length) % filteredVariables.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = filteredVariables[autocompleteIndex] || filteredVariables[0];
      if (selected) {
        insertVariable(selected.tag);
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  };

  const copyToClipboard = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    insertVariable(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const handleAiAutoCheck = async () => {
    if (!template.trim()) {
      setErrorMsg('Please write some draft text in the message template box first');
      return;
    }
    setIsAiPolishing(true);
    setErrorMsg(null);
    try {
      const res = await api.aiPolishAutomationTemplate(template);
      setAiSuggestion(res);
    } catch (err: any) {
      setErrorMsg(`AI Auto-Check failed: ${err.message || 'Error communicating with AI service'}`);
    } finally {
      setIsAiPolishing(false);
    }
  };

  const applyAiSuggestion = () => {
    if (aiSuggestion) {
      setTemplate(aiSuggestion.polished);
      setAiSuggestion(null);
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Please enter a campaign name');
      return;
    }
    if (!template.trim()) {
      setErrorMsg('Please write a message template');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const validCriteria = targetType === 'CRITERIA'
      ? criteria.filter((c) => c.field.trim() && c.value.trim())
      : [];

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      template: template.trim(),
      mediaUrl: mediaUrl.trim() || undefined,
      audience: {
        target: targetType,
        criteria: validCriteria,
        feeStatus: selectedFeeStatus
      },
      schedule: {
        triggerType,
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
        offsetDays: triggerType === 'BEFORE_DUE_DATE' ? offsetDays : undefined,
        repeatIntervalDays: !isOneTimeOnly ? repeatIntervalDays : undefined,
        interval: triggerType === 'RECURRING' ? recurringInterval : undefined,
        maxExecutions: isOneTimeOnly ? 1 : maxExecutions
      },
      enabled: true
    };

    try {
      const campaignId = initialData?.id || initialData?._id;
      if (campaignId) {
        await api.updateCustomAutomation(campaignId, payload);
      } else {
        await api.createCustomAutomation(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save automation campaign');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl max-w-4xl w-full shadow-2xl border border-outline-variant/30 max-h-[92vh] flex flex-col my-auto overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">smart_toy</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">
                {initialData ? 'Edit Automation Campaign' : 'Create Custom Automation Campaign'}
              </h2>
              <p className="text-xs text-on-surface-variant">
                Personalized WhatsApp delivery with dynamic Google Sheets variables and multi-condition targeting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-surface-container text-outline hover:text-on-surface flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 bg-error/10 border border-error/25 rounded-lg text-error text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <form id="custom-auto-form" onSubmit={handleSubmit} className="space-y-5">
            {/* Quick-Start Presets Selection */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-primary/10 via-surface-container-low to-secondary/10 border border-primary/25 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[18px]">bolt</span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    1-Tap Prebuilt Automation Presets
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant font-medium">Click any preset to auto-configure settings & template</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'GREETING', icon: 'waving_hand', title: 'Welcome Greeting', subtitle: 'New Sheet Row', color: 'text-blue-600 dark:text-blue-400' },
                  { id: 'PRE_PAYMENT', icon: 'alarm', title: 'Pre-Payment Due', subtitle: '2 Days Before Due', color: 'text-amber-600 dark:text-amber-400' },
                  { id: 'POST_PAYMENT', icon: 'verified', title: 'Payment Receipt', subtitle: 'On Payment Success', color: 'text-emerald-600 dark:text-emerald-400' },
                  { id: 'OVERDUE', icon: 'warning', title: 'Overdue Chaser', subtitle: 'Repeat every 2 days', color: 'text-rose-600 dark:text-rose-400' },
                  { id: 'TAG_TARGET', icon: 'sell', title: 'Tag Campaign', subtitle: 'Target Sheet Column', color: 'text-purple-600 dark:text-purple-400' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      activePreset === preset.id
                        ? 'bg-primary/15 border-primary shadow-xs ring-1 ring-primary'
                        : 'bg-surface-container-lowest hover:bg-surface-container-low border-outline-variant/30'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`material-symbols-outlined text-[16px] ${preset.color}`}>{preset.icon}</span>
                      <span className="text-xs font-bold text-on-surface truncate">{preset.title}</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant truncate">{preset.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">
                  Campaign Title <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2nd Year Orientation Notice"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/35 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">
                  Purpose / Description <span className="text-on-surface-variant/60 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Broadcasts circular to Computer Science students"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-9 px-3 bg-surface-container-low border border-outline-variant/35 rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Audience Targeting Configuration */}
            <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/25 space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">filter_alt</span>
                  <div>
                    <span className="text-xs font-bold text-on-surface uppercase tracking-wider block">Audience Targeting</span>
                    <span className="text-[11px] text-on-surface-variant">Choose who receives this message based on your active Google Sheet</span>
                  </div>
                </div>
                <div className="flex rounded-lg bg-surface-container-high/60 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTargetType('ALL')}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                      targetType === 'ALL'
                        ? 'bg-surface-container-lowest shadow-2xs text-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">groups</span>
                    <span>Everyone in Sheet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetType('CRITERIA');
                      if (criteria.length === 0) {
                        const defaultField = filterColumns[0]?.key || 'Course';
                        setCriteria([{ field: defaultField, operator: 'EQUALS', value: '' }]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                      targetType === 'CRITERIA'
                        ? 'bg-surface-container-lowest shadow-2xs text-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">tune</span>
                    <span>Specific Contacts</span>
                  </button>
                </div>
              </div>

              {/* Clickable Payment Status Chips */}
              <div className="pt-2 border-t border-outline-variant/15 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
                    🎯 Target By Payment Status:
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Tap chip to filter</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'ALL', label: 'All Contacts', icon: 'groups' },
                    { id: 'HAS_BALANCE', label: '🔴 Unpaid / Balance > ₹0', icon: 'pending' },
                    { id: 'PARTIAL', label: '🟡 Partially Paid', icon: 'pie_chart' },
                    { id: 'PAID', label: '🟢 Fully Paid', icon: 'check_circle' },
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setSelectedFeeStatus(chip.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        selectedFeeStatus === chip.id
                          ? 'bg-primary text-on-primary shadow-xs font-bold'
                          : 'bg-surface-container-high/60 text-on-surface hover:bg-surface-container border border-outline-variant/20'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">{chip.icon}</span>
                      <span>{chip.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Google Sheet Tag Pills (All Options & Search) */}
              {filterColumns.length > 0 && (
                <div className="pt-2.5 border-t border-outline-variant/15 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
                        🏷️ Quick Sheet Tags (All Options):
                      </span>
                      <span className="text-[10px] text-on-surface-variant font-medium">
                        Tap chip to auto-add filter rule
                      </span>
                    </div>

                    {/* Quick Tag Search Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={tagSearchQuery}
                        onChange={(e) => setTagSearchQuery(e.target.value)}
                        placeholder="Search all tags..."
                        className="h-6 px-2 pl-6 bg-surface-container-low border border-outline-variant/30 rounded-md text-[11px] text-on-surface focus:outline-none focus:border-primary w-40"
                      />
                      <span className="material-symbols-outlined text-[13px] text-outline absolute left-1.5 top-1.5">
                        search
                      </span>
                      {tagSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setTagSearchQuery('')}
                          className="absolute right-1 top-1 text-outline hover:text-on-surface"
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Column Filters Pills: All vs Specific Column */}
                  <div className="flex items-center gap-1 flex-wrap overflow-x-auto pb-0.5">
                    <button
                      type="button"
                      onClick={() => setTagColumnFilter('ALL')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        tagColumnFilter === 'ALL'
                          ? 'bg-primary text-on-primary shadow-2xs'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      All Columns ({filterColumns.reduce((acc, col) => acc + col.values.length, 0)})
                    </button>
                    {filterColumns.map((col) => (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => setTagColumnFilter(col.key)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                          tagColumnFilter === col.key
                            ? 'bg-primary text-on-primary font-bold shadow-2xs'
                            : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {col.label} ({col.values.length})
                      </button>
                    ))}
                  </div>

                  {/* All Discovered Sheet Tag Chips List */}
                  <div className="flex items-center gap-1.5 flex-wrap max-h-36 overflow-y-auto pr-1 p-1.5 rounded-lg bg-surface-container-lowest/70 border border-outline-variant/20">
                    {filterColumns
                      .filter((col) => tagColumnFilter === 'ALL' || col.key.toLowerCase() === tagColumnFilter.toLowerCase())
                      .flatMap((col) =>
                        col.values
                          .filter((val) =>
                            !tagSearchQuery ||
                            val.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                            col.label.toLowerCase().includes(tagSearchQuery.toLowerCase())
                          )
                          .map((val) => {
                            const isSelected = criteria.some(
                              (c) => c.field.toLowerCase() === col.key.toLowerCase() && c.value.toLowerCase() === val.toLowerCase()
                            );
                            return (
                              <button
                                key={`${col.key}-${val}`}
                                type="button"
                                onClick={() => {
                                  setTargetType('CRITERIA');
                                  if (isSelected) {
                                    setCriteria((prev) =>
                                      prev.filter(
                                        (c) =>
                                          !(c.field.toLowerCase() === col.key.toLowerCase() && c.value.toLowerCase() === val.toLowerCase())
                                      )
                                    );
                                  } else {
                                    setCriteria((prev) => [...prev, { field: col.key, operator: 'EQUALS', value: val }]);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer border ${
                                  isSelected
                                    ? 'bg-secondary/15 text-secondary border-secondary/50 font-bold shadow-2xs'
                                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
                                }`}
                              >
                                <span className="opacity-75">{col.label}:</span>
                                <span className="font-semibold text-on-surface">{val}</span>
                                {isSelected && <span className="material-symbols-outlined text-[13px]">check</span>}
                              </button>
                            );
                          })
                      )}
                  </div>
                </div>
              )}

              {/* Conversational Sentence Controls */}
              {targetType === 'CRITERIA' ? (
                <div className="space-y-3 pt-2 border-t border-outline-variant/15">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px] text-primary">chat_bubble_outline</span>
                    <span>Send WhatsApp message only when:</span>
                  </div>

                  {/* Dynamic Rule Rows */}
                  <div className="space-y-2">
                    {criteria.map((c, index) => {
                      const selectedColMeta = filterColumns.find(
                        (col) => col.key.toLowerCase() === c.field.toLowerCase()
                      );
                      const availableValues = selectedColMeta?.values || [];

                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex-wrap sm:flex-nowrap animate-fade-in"
                        >
                          {/* Prefix pill */}
                          <span className="text-[10px] font-bold uppercase tracking-wider text-outline px-1.5 py-0.5 rounded bg-surface-container shrink-0 min-w-[42px] text-center">
                            {index === 0 ? 'Where' : 'And'}
                          </span>

                          {/* Column selector */}
                          <select
                            value={c.field}
                            onChange={(e) => {
                              const newField = e.target.value;
                              setCriteria((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, field: newField, value: '' } : item
                                )
                              );
                            }}
                            className="h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded-md text-xs font-semibold text-on-surface shrink-0 focus:outline-none focus:border-primary max-w-[170px]"
                          >
                            {loadingFilterOptions && filterColumns.length === 0 ? (
                              <option disabled>Loading sheet columns...</option>
                            ) : (
                              filterColumns.map((col) => (
                                <option key={col.key} value={col.key}>
                                  {col.label}
                                </option>
                              ))
                            )}
                            {!filterColumns.some((col) => col.key.toLowerCase() === c.field.toLowerCase()) && c.field && (
                              <option value={c.field}>{c.field}</option>
                            )}
                          </select>

                          {/* Operator selector */}
                          <select
                            value={c.operator}
                            onChange={(e) => {
                              const newOp = e.target.value as any;
                              setCriteria((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, operator: newOp } : item))
                              );
                            }}
                            className="h-8 px-2 bg-surface-container-low border border-outline-variant/30 rounded-md text-xs text-on-surface shrink-0 focus:outline-none focus:border-primary"
                          >
                            <option value="EQUALS">is</option>
                            <option value="CONTAINS">contains</option>
                            <option value="NOT_EQUALS">is not</option>
                          </select>

                          {/* Value Combobox with datalist */}
                          <div className="relative flex-1 min-w-[140px]">
                            <input
                              type="text"
                              list={`col-values-${index}`}
                              value={c.value}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                setCriteria((prev) =>
                                  prev.map((item, i) => (i === index ? { ...item, value: newVal } : item))
                                );
                              }}
                              placeholder={
                                availableValues.length > 0
                                  ? `Select or type (e.g. ${availableValues[0]})`
                                  : 'Type value...'
                              }
                              className="w-full h-8 px-2.5 bg-surface-container-low border border-outline-variant/30 rounded-md text-xs text-on-surface focus:outline-none focus:border-primary font-medium"
                            />
                            <datalist id={`col-values-${index}`}>
                              {availableValues.map((val, vIdx) => (
                                <option key={vIdx} value={val} />
                              ))}
                            </datalist>
                          </div>

                          {/* Remove rule button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (criteria.length === 1) {
                                setCriteria([{ field: filterColumns[0]?.key || 'Course', operator: 'EQUALS', value: '' }]);
                              } else {
                                setCriteria((prev) => prev.filter((_, i) => i !== index));
                              }
                            }}
                            className="w-7 h-7 rounded hover:bg-error/10 text-outline hover:text-error flex items-center justify-center shrink-0 transition-colors"
                            title="Remove condition"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Condition & Fee Checkbox */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const nextField =
                          filterColumns.find((fc) => !criteria.some((c) => c.field === fc.key))?.key ||
                          filterColumns[0]?.key ||
                          '';
                        setCriteria((prev) => [...prev, { field: nextField, operator: 'EQUALS', value: '' }]);
                      }}
                      className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 py-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      <span>+ Add another condition</span>
                    </button>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-on-surface select-none">
                      <input
                        type="checkbox"
                        checked={selectedFeeStatus === 'HAS_BALANCE'}
                        onChange={(e) => setSelectedFeeStatus(e.target.checked ? 'HAS_BALANCE' : 'ALL')}
                        className="w-3.5 h-3.5 rounded text-primary border-outline-variant/40 focus:ring-0"
                      />
                      <span>Only contacts with unpaid balance (&gt; ₹0)</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-outline-variant/15 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-secondary text-[16px]">check_circle</span>
                    <span>All active contacts with valid WhatsApp numbers in your Google Sheet will receive this message.</span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-on-surface select-none">
                    <input
                      type="checkbox"
                      checked={selectedFeeStatus === 'HAS_BALANCE'}
                      onChange={(e) => setSelectedFeeStatus(e.target.checked ? 'HAS_BALANCE' : 'ALL')}
                      className="w-3.5 h-3.5 rounded text-primary border-outline-variant/40 focus:ring-0"
                    />
                    <span>Only contacts with unpaid balance (&gt; ₹0)</span>
                  </label>
                </div>
              )}

              {/* Dynamic Live Match Badge */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container/70 border border-outline-variant/20 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5 font-bold text-primary">
                    <span className="material-symbols-outlined text-[17px] text-secondary">
                      {loadingMatchCount ? 'sync' : 'contact_emergency'}
                    </span>
                    <span>
                      {loadingMatchCount ? (
                        'Calculating recipients...'
                      ) : matchingCount !== null ? (
                        `Matches ${matchingCount} of ${totalEligible ?? matchingCount} contacts in your sheet`
                      ) : (
                        'Evaluating Google Sheet audience...'
                      )}
                    </span>
                  </span>
                  {sampleRecipients.length > 0 && !loadingMatchCount && (
                    <span className="text-on-surface-variant text-[11px] truncate max-w-sm hidden sm:inline">
                      (e.g., {sampleRecipients.join(', ')})
                    </span>
                  )}
                </div>

                {matchingCount === 0 && !loadingMatchCount && (
                  <span className="text-[11px] font-semibold text-error flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    No contacts match
                  </span>
                )}
              </div>
            </div>

            {/* Schedule & Trigger Modes */}
            <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/25 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-[18px]">schedule</span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">Trigger & Frequency</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-on-surface select-none">
                  <input
                    type="checkbox"
                    checked={isOneTimeOnly}
                    onChange={(e) => setIsOneTimeOnly(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-primary border-outline-variant/40 focus:ring-0"
                  />
                  <span>Strictly One-Time per student (anti-duplicate)</span>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                {[
                  { id: 'ON_SYNC', icon: 'sync', label: 'On New Row / Sync', desc: 'New contact in sheet' },
                  { id: 'BEFORE_DUE_DATE', icon: 'hourglass_top', label: 'Before Due Date', desc: 'Pre-payment reminder' },
                  { id: 'AFTER_PAYMENT', icon: 'verified', label: 'After Payment', desc: 'Instant receipt/welcome' },
                  { id: 'SCHEDULED', icon: 'event', label: 'Target Date', desc: 'At scheduled date/time' },
                  { id: 'MANUAL', icon: 'touch_app', label: 'Manual On-Demand', desc: 'Trigger on demand' }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTriggerType(item.id as any)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      triggerType === item.id
                        ? 'border-primary bg-primary/10 text-primary shadow-2xs font-semibold'
                        : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                      <span className="text-xs font-bold">{item.label}</span>
                    </div>
                    <p className="text-[10px] text-on-surface-variant leading-tight">{item.desc}</p>
                  </button>
                ))}
              </div>

              {/* Relative Due Date Sub-Chips */}
              {triggerType === 'BEFORE_DUE_DATE' && (
                <div className="p-3 bg-surface-container-lowest rounded-lg border border-primary/25 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[16px]">alarm</span>
                      <span>When should the reminder fire?</span>
                    </span>
                    <span className="text-[11px] text-on-surface-variant">Compared to Google Sheet Due Date</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { offset: -3, label: '⏳ 3 Days Before Due Date' },
                      { offset: -2, label: '⏳ 2 Days Before Due Date' },
                      { offset: -1, label: '⏳ 1 Day Before Due Date' },
                      { offset: 0, label: '🎯 Exactly on Due Date' },
                      { offset: 1, label: '⚠️ 1 Day Overdue' },
                      { offset: 3, label: '🚨 3 Days Overdue' },
                    ].map((opt) => (
                      <button
                        key={opt.offset}
                        type="button"
                        onClick={() => setOffsetDays(opt.offset)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          offsetDays === opt.offset
                            ? 'bg-primary text-on-primary font-bold shadow-xs'
                            : 'bg-surface-container-high/60 text-on-surface hover:bg-surface-container border border-outline-variant/20'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Frequency / Repeat Limits */}
              <div className="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary text-[16px]">repeat</span>
                    <span>How Many Times to Send (Frequency)?</span>
                  </span>
                  <span className="text-[11px] text-on-surface-variant">Stops automatically once condition is resolved</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: '🎯 Send Strictly Once (1-Time)', isOneTime: true, max: 1, repeat: 1 },
                    { label: '🔁 Repeat Every 2 Days (Max 3 Times)', isOneTime: false, max: 3, repeat: 2 },
                    { label: '🔁 Repeat Every 3 Days (Max 2 Times)', isOneTime: false, max: 2, repeat: 3 },
                    { label: '🔁 Weekly (Every 7 Days, Max 4 Times)', isOneTime: false, max: 4, repeat: 7 },
                  ].map((freq, idx) => {
                    const isSelected =
                      (freq.isOneTime && isOneTimeOnly) ||
                      (!freq.isOneTime && !isOneTimeOnly && maxExecutions === freq.max && repeatIntervalDays === freq.repeat);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setIsOneTimeOnly(freq.isOneTime);
                          setMaxExecutions(freq.max);
                          setRepeatIntervalDays(freq.repeat);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-secondary text-on-secondary font-bold shadow-xs'
                            : 'bg-surface-container-high/60 text-on-surface hover:bg-surface-container border border-outline-variant/20'
                        }`}
                      >
                        {freq.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {triggerType === 'SCHEDULED' && (
                <div className="pt-2 flex items-center gap-3">
                  <label className="text-xs text-on-surface font-medium">Select Scheduled Date:</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="h-8 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-xs"
                  />
                </div>
              )}

              {triggerType === 'RECURRING' && (
                <div className="pt-2 flex items-center gap-3">
                  <label className="text-xs text-on-surface font-medium">Repeat Every:</label>
                  <select
                    value={recurringInterval}
                    onChange={(e) => setRecurringInterval(e.target.value as any)}
                    className="h-8 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-xs"
                  >
                    <option value="DAILY">Day (Daily)</option>
                    <option value="WEEKLY">Week (Weekly)</option>
                    <option value="MONTHLY">Month (Monthly)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Invitation Card / Image Attachment (Upload or Link) */}
            <div className="p-3.5 rounded-xl bg-surface-container-low/50 border border-outline-variant/25 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[18px]">image</span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    Attach Invitation Card / Flyer Image
                  </span>
                  <span className="text-[10px] text-on-surface-variant/70">(Optional)</span>
                </div>

                {/* Segmented Mode: Upload vs Link */}
                <div className="flex items-center gap-1 bg-surface-container-high/60 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setImageInputMode('UPLOAD')}
                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                      imageInputMode === 'UPLOAD'
                        ? 'bg-surface-container-lowest text-primary shadow-2xs font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">upload_file</span>
                    <span>Upload File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageInputMode('LINK')}
                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                      imageInputMode === 'LINK'
                        ? 'bg-surface-container-lowest text-primary shadow-2xs font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">link</span>
                    <span>Image URL / Link</span>
                  </button>
                </div>
              </div>

              {imageInputMode === 'UPLOAD' ? (
                <div className="space-y-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-outline-variant/40 hover:border-primary/60 bg-surface-container-lowest/80 hover:bg-surface-container-lowest rounded-xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5"
                  >
                    <span className={`material-symbols-outlined text-primary text-[28px] ${isUploadingImage ? 'animate-spin' : ''}`}>
                      {isUploadingImage ? 'sync' : 'cloud_upload'}
                    </span>
                    <p className="text-xs font-semibold text-on-surface">
                      {isUploadingImage ? 'Uploading image to server...' : 'Click to Browse or Drag Image File Here'}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      Supports PNG, JPG, JPEG, WEBP up to 10MB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Paste direct Image URL (e.g. https://example.com/invitation.jpg or flyer link)"
                    className="w-full h-8 px-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {mediaUrl && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <img
                      src={mediaUrl}
                      alt="Invitation Preview"
                      className="w-14 h-14 object-cover rounded-md border border-outline-variant/30 shadow-xs"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="text-[11px] text-on-surface-variant leading-relaxed">
                      <p className="font-semibold text-primary">✓ Image flyer attached</p>
                      <p className="text-[10px] truncate max-w-md">{uploadedFileName || mediaUrl}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaUrl('');
                      setUploadedFileName('');
                    }}
                    className="text-[11px] text-error hover:underline flex items-center gap-0.5 cursor-pointer px-2 py-1 rounded hover:bg-error/10"
                  >
                    <span className="material-symbols-outlined text-[13px]">delete</span>
                    <span>Remove</span>
                  </button>
                </div>
              )}
            </div>

            {/* Template Editor & Interactive Autocomplete */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[18px]">chat</span>
                  <span>WhatsApp Message Content</span>
                  <span className="text-[11px] font-normal text-on-surface-variant hidden sm:inline">
                    (Type <kbd className="px-1 py-0.5 bg-surface-container rounded font-data-mono">{`{`}</kbd> for recommendations)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAiAutoCheck}
                    disabled={isAiPolishing || !template.trim()}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                    title="Check variable typos, grammar, and format as professional WhatsApp message"
                  >
                    <span className={`material-symbols-outlined text-[15px] ${isAiPolishing ? 'animate-spin' : ''}`}>
                      {isAiPolishing ? 'sync' : 'auto_fix_high'}
                    </span>
                    <span>{isAiPolishing ? 'AI Checking...' : '✨ AI Auto-Check & Polish'}</span>
                  </button>

                  {copiedTag && (
                    <span className="text-xs font-medium text-secondary flex items-center gap-1 animate-fade-in">
                      <span className="material-symbols-outlined text-[14px]">check</span>
                      Inserted {copiedTag}
                    </span>
                  )}
                </div>
              </div>

              {/* AI Auto-Check Suggestion Card */}
              {aiSuggestion && (
                <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/25 space-y-2.5 animate-fade-in shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                      <span>AI Review & Variable Typo Corrections</span>
                    </span>
                    <span className="text-[11px] text-on-surface-variant font-medium">{aiSuggestion.summary}</span>
                  </div>

                  {aiSuggestion.corrections.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {aiSuggestion.corrections.map((corr, cIdx) => (
                        <span key={cIdx} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          <span>{corr}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-xs font-mono whitespace-pre-wrap text-on-surface max-h-36 overflow-y-auto">
                    {aiSuggestion.polished}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAiSuggestion(null)}
                      className="px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:text-on-surface cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={applyAiSuggestion}
                      className="px-3 py-1.5 text-xs font-bold bg-primary text-on-primary rounded-lg shadow-sm hover:bg-primary/90 flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">done_all</span>
                      <span>Apply to Template</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Clickable Variable Insert Bar */}
              <div className="p-2.5 rounded-lg bg-surface-container-low/60 border border-outline-variant/25 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider block">
                    Click to Insert Dynamic Variable:
                  </span>
                  <span className="text-[10px] text-on-surface-variant">Click any pill to add into template</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { tag: '{{student_name}}', label: 'Name' },
                    { tag: '{{balance}}', label: 'Fee Balance' },
                    { tag: '{{due_date}}', label: 'Due Date' },
                    { tag: '{{payment_link}}', label: 'Payment Link' },
                    { tag: '{{paid_amount}}', label: 'Paid Amount' },
                    { tag: '{{receipt_number}}', label: 'Receipt No' },
                    { tag: '{{college_name}}', label: 'College' },
                    { tag: '{{course}}', label: 'Course' },
                    { tag: '{{department}}', label: 'Department' },
                    { tag: '{{father_name}}', label: 'Father' },
                    { tag: '{{whatsapp_number}}', label: 'Phone' },
                  ].map((pill) => (
                    <button
                      key={pill.tag}
                      type="button"
                      onClick={() => insertVariable(pill.tag)}
                      className="px-2 py-0.5 rounded bg-surface-container-lowest hover:bg-primary/10 border border-outline-variant/30 hover:border-primary text-[11px] font-mono text-primary font-medium transition-colors cursor-pointer"
                      title={`Insert ${pill.tag}`}
                    >
                      + {pill.label} ({pill.tag})
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <textarea
                  ref={textareaRef}
                  rows={5}
                  value={template}
                  onChange={handleTemplateChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your WhatsApp template here... Use {{variable}} to personalize with Google Sheet data"
                  required
                  className="w-full p-3 bg-surface-container-low border border-outline-variant/35 rounded-xl text-sm font-body-md text-on-surface focus:outline-none focus:border-primary leading-relaxed font-normal"
                />

                {/* Inline Typing Autocomplete Popup */}
                {showAutocomplete && filteredVariables.length > 0 && (
                  <div className="absolute left-4 bottom-3 z-30 w-72 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden text-xs animate-fade-in">
                    <div className="px-3 py-1.5 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between text-[11px] text-on-surface-variant font-medium">
                      <span>Insert Variable ({filteredVariables.length})</span>
                      <span className="font-data-mono text-[10px]">Enter or Tab ↵</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-outline-variant/10">
                      {filteredVariables.map((item, idx) => (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => insertVariable(item.tag)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors ${
                            idx === autocompleteIndex
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'hover:bg-surface-container-low text-on-surface'
                          }`}
                        >
                          <div>
                            <div className="font-data-mono font-medium">{item.tag}</div>
                            <div className="text-[10px] text-on-surface-variant">{item.label}</div>
                          </div>
                          <span className="text-[10px] text-outline font-data-mono">
                            {item.sample}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Google Sheets Variables Palette */}
              <div className="p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/25">
                <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Available Google Sheet Variables (1-Click Insert)</span>
                  <span className="font-normal text-[10px] text-outline">Click any tag to insert into message</span>
                </div>
                {loadingVars ? (
                  <div className="py-2 text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    <span>Scanning Google Sheet headers and variables...</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {variables.map((v) => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => copyToClipboard(v.tag)}
                        title={`Sample: ${v.sample} (Click to insert)`}
                        className={`h-6 px-2 rounded-md font-data-mono text-[11px] flex items-center gap-1 border transition-all hover:scale-102 ${
                          v.category === 'FINANCIAL'
                            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20'
                            : v.category === 'CUSTOM_SHEET'
                            ? 'bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-500/25 hover:bg-purple-500/20'
                            : v.category === 'SYSTEM'
                            ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25 hover:bg-amber-500/20'
                            : 'bg-primary/10 text-primary border-primary/25 hover:bg-primary/20'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[12px]">add</span>
                        <span>{v.tag}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Live WhatsApp Chat Bubble Preview */}
            <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/25 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-700 dark:text-emerald-400 text-[18px]">visibility</span>
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">Live WhatsApp Message Preview</span>
                </div>

                {/* Preview student dropdown */}
                {students.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-on-surface-variant font-medium">Preview as:</span>
                    <select
                      value={previewStudentId}
                      onChange={(e) => setPreviewStudentId(e.target.value)}
                      className="h-7 px-2 bg-surface-container-lowest border border-outline-variant/30 rounded text-xs font-semibold text-on-surface"
                    >
                      {students.map((s) => (
                        <option key={s.id || s.studentId} value={s.studentId || s.id}>
                          {s.studentName} ({s.registerNo})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* WhatsApp Message Bubble Container */}
              <div className="p-4 rounded-lg bg-[#EFEAE2] dark:bg-[#0c1317] border border-black/5 dark:border-white/5 flex justify-start">
                <div className="max-w-md bg-white dark:bg-[#202c33] rounded-lg rounded-tl-none p-3 shadow-sm border border-black/5 text-xs text-[#111b21] dark:text-[#e9edef] leading-relaxed relative space-y-1.5">
                  {mediaUrl && (
                    <div className="rounded-md overflow-hidden mb-1.5 border border-black/10">
                      <img
                        src={mediaUrl}
                        alt="Invitation Flyer"
                        className="w-full max-h-48 object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="whitespace-pre-wrap font-sans">{renderedPreview || 'Start typing above to see live preview...'}</div>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-black/40 dark:text-white/40 pt-1">
                    <span>12:45 PM</span>
                    <span className="material-symbols-outlined text-[13px] text-emerald-600">done_all</span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
          <span className="text-xs text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary text-[16px]">verified_user</span>
            <span>Zero-spam guarantee: Pacing engine protects phone reputation</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="custom-auto-form"
              disabled={submitting}
              className="h-9 px-5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  <span>Saving Campaign...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>{initialData ? 'Save Changes' : 'Create Campaign'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
