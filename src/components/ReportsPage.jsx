import { useEffect, useMemo, useState } from 'react';
import { Download, FileDiff, RefreshCw, Trash2 } from 'lucide-react';
import { formatDateTimeIst } from '../utils/time';

function sourceLabel(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'metasea') return 'Metasea';
  if (key === 'partnerdb') return 'Partner DB';
  if (key === 'difference') return 'Difference';
  return value || '-';
}

function partnerLabel(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'jiosaavn') return 'Jio Saavn';
  if (key === 'bytedance') return 'Bytedance';
  if (key === 'amazon') return 'Amazon';
  if (key === 'facebook') return 'Facebook';
  if (key === 'spotify') return 'Spotify';
  if (key === 'virgin') return 'Virgin';
  return value || '-';
}

const ReportsPage = ({
  reports,
  jobs,
  authUser,
  onRefresh,
  onGenerateDifference,
  onDownloadReport,
  onDeleteReport,
  loading,
  actionLoading,
}) => {
  const [selectedIds, setSelectedIds] = useState([]);

  const canIdentify = selectedIds.length === 2;

  const selectedReports = useMemo(
    () => reports.filter((item) => selectedIds.includes(item.id)),
    [reports, selectedIds],
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => reports.some((row) => row.id === id)).slice(-2));
  }, [reports]);

  const toggleSelection = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));
  };

  const handleIdentify = () => {
    if (!canIdentify) {
      return;
    }
    onGenerateDifference(selectedIds);
  };

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h2>Reports</h2>
          <p>Note: Reports will only be available for the next 7 days.</p>
        </div>
        <div className="reports-actions">
          <button onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className={`identify-btn ${canIdentify ? 'ready' : 'disabled'}`}
            onClick={handleIdentify}
            disabled={actionLoading || !canIdentify}
            title={canIdentify ? 'Generate difference report' : 'Select one Metasea and one Partner DB report'}
          >
            <FileDiff size={16} /> Identify Differences
          </button>
        </div>
      </div>

      {selectedReports.length === 2 ? (
        <div className="report-selection-hint">
          Selected: {selectedReports.map((item) => item.file_name).join(' and ')}
        </div>
      ) : null}

      <div className="table-wrapper reports-main-table">
        <table className="reports-table">
          <thead>
            <tr>
              <th></th>
              <th>Report Name</th>
              <th>Partner</th>
              <th>Source</th>
              <th>Date</th>
              <th>Rows</th>
              <th>Download</th>
              {authUser?.role === 'admin' ? <th>Delete</th> : null}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={authUser?.role === 'admin' ? 8 : 7} style={{ textAlign: 'center', padding: '1rem' }}>
                  No reports available yet.
                </td>
              </tr>
            ) : (
              reports.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelection(row.id)}
                    />
                  </td>
                  <td>{row.file_name}</td>
                  <td>{partnerLabel(row.partner_label || row.partner)}</td>
                  <td>{sourceLabel(row.source)}</td>
                  <td>{formatDateTimeIst(row.created_at)}</td>
                  <td>{row.track_count || 0}</td>
                  <td>
                    <button className="icon-btn" onClick={() => onDownloadReport(row)} title="Download report">
                      <Download size={16} />
                    </button>
                  </td>
                  {authUser?.role === 'admin' ? (
                    <td>
                      <button className="icon-btn delete-btn" onClick={() => onDeleteReport(row)} title="Delete report">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="reports-jobs">
        <h3>Recent Report Jobs</h3>
        <div className="table-wrapper reports-jobs-table">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Type</th>
                <th>Partner</th>
                <th>Source</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {(jobs || []).slice(0, 20).length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }}>
                    No job history available.
                  </td>
                </tr>
              ) : (
                (jobs || []).slice(0, 20).map((job) => (
                  <tr key={job.id}>
                    <td>#{job.id}</td>
                    <td>{job.job_type}</td>
                    <td>{partnerLabel(job.partner)}</td>
                    <td>{sourceLabel(job.source)}</td>
                    <td><span className={`job-status ${job.status}`}>{job.status}</span></td>
                    <td>{job.started_at ? formatDateTimeIst(job.started_at) : '-'}</td>
                    <td>{job.finished_at ? formatDateTimeIst(job.finished_at) : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
