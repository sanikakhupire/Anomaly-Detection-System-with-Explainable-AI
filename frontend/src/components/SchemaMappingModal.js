import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Save, Sparkles, RefreshCw } from 'lucide-react';
import Modal from './Modal';
import { featureService } from '../services/featureService';
import { useToast } from '../context/ToastContext';

const CANONICAL_ROLES = [
  { value: 'unmapped', label: 'Unmapped (Exclude from templates)' },
  // Hierarchy
  { value: 'state', label: 'State / Province (Hierarchy Level 1)' },
  { value: 'district', label: 'District (Hierarchy Level 2)' },
  { value: 'block', label: 'Block / Tehsil / Sub-district (Level 3)' },
  { value: 'panchayat', label: 'Gram Panchayat / Village (Level 4)' },
  { value: 'constituency', label: 'Constituency / Assembly' },
  // Temporal
  { value: 'year', label: 'Year (Observation Time)' },
  { value: 'date', label: 'Date / Timestamp' },
  // Census
  { value: 'population_total', label: 'Total Population (Census)' },
  { value: 'population_male', label: 'Male Population (Census)' },
  { value: 'population_female', label: 'Female Population (Census)' },
  { value: 'area_sq_km', label: 'Area in Sq Km (Census)' },
  { value: 'literacy_total', label: 'Total Literate Population (Census)' },
  // MGNREGA
  { value: 'wages_total', label: 'Total Wages Disbursed (MGNREGA)' },
  { value: 'workdays_total', label: 'Total Persondays / Workdays (MGNREGA)' },
  { value: 'persons_worked', label: 'Individuals / Workers Employed (MGNREGA)' },
  { value: 'attendance_total', label: 'Muster Attendance (MGNREGA)' },
  { value: 'expenditure_total', label: 'Total Scheme Expenditure (MGNREGA)' },
  // Election
  { value: 'total_electors', label: 'Registered Electors / Voters (Election)' },
  { value: 'votes_polled', label: 'Total Votes Polled / Cast (Election)' },
  { value: 'candidate_votes', label: 'Candidate / Winner Votes (Election)' },
  { value: 'margin', label: 'Victory Margin (Election)' },
];

const SchemaMappingModal = ({ isOpen, onClose, datasetId, onMappingSaved }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mappingState, setMappingState] = useState({});
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (!isOpen || !datasetId) return;

    const loadMapping = async () => {
      setLoading(true);
      try {
        const res = await featureService.getSchemaMapping(datasetId);
        if (res.success && res.data) {
          setMappingState(res.data.mapping || {});
          setIsConfirmed(Boolean(res.data.isConfirmed));
        }
      } catch (err) {
        toast.error(err.message || 'Failed to retrieve schema mapping');
      } finally {
        setLoading(false);
      }
    };

    loadMapping();
  }, [isOpen, datasetId, toast]);

  const handleRoleChange = (colName, newRole) => {
    setMappingState((prev) => ({
      ...prev,
      [colName]: {
        ...(prev[colName] || {}),
        canonicalRole: newRole,
        confidence: 1.0, // user explicitly confirmed
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await featureService.updateSchemaMapping(datasetId, mappingState);
      if (res.success) {
        toast.success('Semantic schema mapping confirmed successfully.');
        if (onMappingSaved) onMappingSaved(res.data.mapping);
        onClose();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update schema mapping');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Semantic Schema Mapping"
      description="Confirm or edit the inferred semantic role of each column before generating domain features and peer baselines."
      maxWidth="2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center space-x-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Confirming...' : 'Confirm & Save Mapping'}</span>
          </button>
        </>
      }
    >
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">
          Inferring schema roles with ML heuristic engine...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-brand-50/70 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/60 flex items-start space-x-2.5 text-xs text-brand-900 dark:text-brand-200">
            <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
            <span>
              Heuristic inference automatically scanned column nomenclature. You may adjust any mapping using the dropdowns below. Confirmed mappings enable domain feature engineering plugins.
            </span>
          </div>

          <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-700 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="py-2.5 px-3">Column Name</th>
                  <th className="py-2.5 px-3">Inferred Role</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Assigned Canonical Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {Object.entries(mappingState).map(([colName, info]) => {
                  const role = info.canonicalRole || 'unmapped';
                  const conf = info.confidence || 0;

                  return (
                    <tr key={colName} className="hover:bg-slate-50/40 dark:hover:bg-slate-700/30">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {colName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {info.description || role}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            conf >= 0.8
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : conf > 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {conf > 0 ? `${Math.round(conf * 100)}%` : '0%'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={role}
                          onChange={(e) => handleRoleChange(colName, e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        >
                          {CANONICAL_ROLES.map((cr) => (
                            <option key={cr.value} value={cr.value}>
                              {cr.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default SchemaMappingModal;
