import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export const FeeRulesModal = ({ onClose }: { onClose: () => void }) => {
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  
  // Rule Builder State
  const [selectedCriteria, setSelectedCriteria] = useState<{field: string, value: string}[]>([]);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [fineAmount, setFineAmount] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  // Live Match Preview State
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [matchedStudents, setMatchedStudents] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  useEffect(() => {
    loadData();
  }, []);

  // Update preview whenever criteria changes
  useEffect(() => {
    let isCancelled = false;
    const updatePreview = async () => {
      setPreviewLoading(true);
      try {
        const res = await api.previewRuleMatch(selectedCriteria);
        if (!isCancelled && res?.data) {
          setMatchCount(res.data.count);
          setMatchedStudents(res.data.students || []);
        }
      } catch (err) {
        console.error('Failed to preview rule match', err);
      } finally {
        if (!isCancelled) setPreviewLoading(false);
      }
    };
    updatePreview();
    return () => { isCancelled = true; };
  }, [selectedCriteria]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dimRes, rulesRes] = await Promise.all([
        api.discoverDimensions(),
        api.getFeeRules()
      ]);
      setDimensions(dimRes.dimensions || []);
      setRules(rulesRes.rules || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCriteria = (field: string, value: string) => {
    setSelectedCriteria(prev => {
      const filtered = prev.filter(c => c.field !== field);
      return [...filtered, { field, value }];
    });
  };

  const handleRemoveCriteria = (field: string) => {
    setSelectedCriteria(prev => prev.filter(c => c.field !== field));
  };

  const handleCreateRule = async () => {
    if (!amount || !dueDate) return;
    if (selectedCriteria.length > 0 && matchCount === 0) {
      alert('Cannot create rule: 0 students match this criteria combination in your Google Sheet.');
      return;
    }
    
    setSubmitting(true);
    try {
      const name = selectedCriteria.length > 0
        ? selectedCriteria.map(c => `${c.field}=${c.value}`).join(' + ')
        : 'All Students';
      await api.createFeeRule({
        name: `Dynamic Rule: ${name}`,
        criteria: selectedCriteria,
        amount: Number(amount),
        dueDate,
        fineAmount: Number(fineAmount)
      });
      setSelectedCriteria([]);
      setAmount('');
      setDueDate('');
      setActiveTab('list');
      await loadData();
      window.dispatchEvent(new CustomEvent('campusflow:data-updated'));
    } catch (err) {
      console.error(err);
      alert('Failed to create rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await api.deleteFeeRule(id);
      await loadData();
      window.dispatchEvent(new CustomEvent('campusflow:data-updated'));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-lowest">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Fee Rules Engine</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Define flexible fee structures based on synced data.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-highest transition-colors text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant/30 px-6 bg-surface-container-lowest">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'create' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            Create New Rule
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'list' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
          >
            Active Rules ({rules.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-container-lowest">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
            </div>
          ) : activeTab === 'create' ? (
            <div className="space-y-6">
              
              {/* Step 1: Select Criteria */}
              <div>
                <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">1</span>
                  Target Students (Select Columns)
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedCriteria.map((c) => (
                    <div key={c.field} className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold flex items-center gap-2 shadow-sm">
                      <span>{c.field} = {c.value}</span>
                      <button onClick={() => handleRemoveCriteria(c.field)} className="hover:text-primary-container"><span className="material-symbols-outlined text-[14px]">close</span></button>
                    </div>
                  ))}
                  {selectedCriteria.length === 0 && (
                    <span className="text-xs text-on-surface-variant italic py-1.5">No criteria selected. Rule will apply to ALL students if left empty.</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dimensions.map((dim: any) => (
                    <div key={dim.field} className="p-3 border border-outline-variant/30 rounded-xl bg-surface-container flex flex-col">
                      <span className="text-xs font-bold text-on-surface mb-2">{dim.field}</span>
                      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                        {dim.values.map((val: string) => {
                          const isSelected = selectedCriteria.some(c => c.field === dim.field && c.value === val);
                          return (
                            <button
                              key={val}
                              onClick={() => isSelected ? handleRemoveCriteria(dim.field) : handleAddCriteria(dim.field, val)}
                              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                                isSelected ? 'bg-primary text-on-primary shadow-sm ring-2 ring-primary/40' : 'bg-surface-container-highest text-on-surface hover:bg-outline-variant/30'
                              }`}
                            >
                              {val} ({dim.studentCounts[val]})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Student Match Preview Banner */}
                <div className={`mt-4 p-3.5 rounded-xl border transition-all ${
                  previewLoading ? 'bg-surface-container/50 border-outline-variant/30 text-on-surface' :
                  selectedCriteria.length === 0 ? 'bg-primary/5 border-primary/20 text-on-surface' :
                  matchCount === 0 ? 'bg-error/10 border-error/40 text-error' :
                  'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                }`}>
                  <div className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-[20px] mt-0.5 shrink-0">
                      {previewLoading ? 'hourglass_top' :
                       selectedCriteria.length === 0 ? 'info' :
                       matchCount === 0 ? 'error' : 'verified'}
                    </span>
                    <div className="flex-1 text-xs">
                      <div className="font-bold text-sm flex items-center justify-between">
                        <span>
                          {previewLoading ? 'Checking Google Sheets student records...' :
                           selectedCriteria.length === 0 ? `Targeting All Students (${matchCount ?? 0} active students)` :
                           matchCount === 0 ? '0 Students Match This Combination!' :
                           `✓ ${matchCount} Student(s) Match This Rule`}
                        </span>
                      </div>
                      
                      {matchCount === 0 && selectedCriteria.length > 0 && (
                        <div className="mt-1.5 leading-relaxed text-xs text-error/90 font-medium">
                          ⚠️ No students in your Google Sheet match all selected filters at the same time.
                          <br />
                          <span className="text-[11px] opacity-80 mt-0.5 block">
                            (For instance, if you selected <strong>Course = BSC CS</strong> and <strong>Year = I</strong>, check whether BSC CS students are actually in <strong>Year II</strong>).
                          </span>
                        </div>
                      )}

                      {matchedStudents.length > 0 && selectedCriteria.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-75 block mb-1">Affected Students:</span>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {matchedStudents.map(s => (
                              <span key={s.id} className="px-2 py-0.5 rounded-md bg-surface text-on-surface border border-outline-variant/30 text-[11px] font-semibold shadow-xs">
                                {s.name} ({s.registerNo} • {s.course} • Yr {s.year})
                              </span>
                            ))}
                            {(matchCount || 0) > matchedStudents.length && (
                              <span className="text-[11px] font-medium opacity-75">+{(matchCount || 0) - matchedStudents.length} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Step 2: Set Amount */}
              <div className="border-t border-outline-variant/30 pt-6">
                <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">2</span>
                  Set Fee Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Total Fee Amount (₹)</label>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full h-10 px-3 bg-surface border border-outline-variant/30 rounded-lg text-sm font-bold focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" placeholder="e.g. 45000" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full h-10 px-3 bg-surface border border-outline-variant/30 rounded-lg text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1">Late Fine Amount (Optional)</label>
                    <input type="number" value={fineAmount} onChange={e => setFineAmount(e.target.value)} className="w-full h-10 px-3 bg-surface border border-outline-variant/30 rounded-lg text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" placeholder="e.g. 500" />
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] opacity-50 block mb-2">rule</span>
                  <p>No active rules found. Create one to get started.</p>
                </div>
              ) : rules.map(rule => (
                <div key={rule._id} className="p-4 rounded-xl border border-outline-variant/30 bg-surface flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      {rule.name}
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] uppercase font-bold">₹{rule.amount}</span>
                    </h4>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {rule.criteria.length === 0 ? (
                        <span className="text-[11px] px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant">All Students</span>
                      ) : rule.criteria.map((c: any, i: number) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 bg-surface-container-high rounded-full font-medium text-on-surface">
                          {c.field} = {c.value}
                        </span>
                      ))}
                      <span className={`text-[11px] ml-2 flex items-center gap-1 font-semibold ${rule.appliedCount === 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                        <span className="material-symbols-outlined text-[12px]">{rule.appliedCount === 0 ? 'warning' : 'group'}</span>
                        {rule.appliedCount} applied
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteRule(rule._id)} className="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center hover:bg-error/20 transition-colors shrink-0" title="Delete Rule">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'create' && (
          <div className="px-6 py-4 border-t border-outline-variant/30 bg-surface-container flex items-center justify-between">
            <p className="text-xs text-on-surface-variant">
              {matchCount !== null && matchCount > 0
                ? `⚡ Ready to update ${matchCount} student(s) in database and Google Sheets.`
                : 'Define target criteria above.'}
            </p>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
              <button
                onClick={handleCreateRule}
                disabled={submitting || !amount || !dueDate || (selectedCriteria.length > 0 && matchCount === 0)}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold shadow-md hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> : <span className="material-symbols-outlined text-[16px]">add_task</span>}
                {selectedCriteria.length > 0 && matchCount === 0
                  ? '0 Students Match (Cannot Apply)'
                  : matchCount !== null && matchCount > 0
                  ? `Apply to ${matchCount} Student(s)`
                  : 'Create & Apply Rule'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
