import { useMemo, useState } from 'react';
import { Download, FileDiff } from 'lucide-react';

const ReportsPage = ({ reports, jobs, onRefresh, onGenerateDifference, onDownloadReport, loading, actionLoading }) => {
  const [selectedIds, setSelectedIds] = useState([]);

  const canIdentify = selectedIds.length === 2;

  const selectedReports = useMemo(
    () => reports.filter((item) => selectedIds.includes(item.id)),
    [reports, selectedIds],
  );

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
          <p>Note: only latest 7 days reports are available.</p>
        </div>
        <div className="reports-actions">
          <button onClick={onRefresh} disabled={loading}>Refresh</button>
          {canIdentify ? (
            <button className="identify-btn" onClick={handleIdentify} disabled={actionLoading}>
              <FileDiff size={16} /> Identify Differences
            </button>
          ) : null}
        </div>
      </div>

      {selectedReports.length === 2 ? (
        <div className="report-selection-hint">
          Selected: {selectedReports.map((item) => item.file_name).join(' and ')}
        </div>
      ) : null}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Report Name</th>
              <th>Partner</th>
              <th>Source</th>
              <th>Date</th>
              <th>Rows</th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }}>
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
                  <td>{row.partner_label}</td>
                  <td>{row.source}</td>
                  <td>{String(row.created_at || '').replace('T', ' ').slice(0, 19)}</td>
                  <td>{row.track_count || 0}</td>
                  <td>
                    <button className="icon-btn" onClick={() => onDownloadReport(row)} title="Download report">
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="reports-jobs">
        <h3>Recent Report Jobs</h3>
        <ul>
          {(jobs || []).slice(0, 8).map((job) => (
            <li key={job.id}>
              <strong>#{job.id}</strong> {job.job_type} - {job.partner} - <span className={`job-status ${job.status}`}>{job.status}</span>
              {job.error_message ? ` (${job.error_message})` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ReportsPage;
