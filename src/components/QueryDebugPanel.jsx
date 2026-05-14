import { Copy, RefreshCw } from 'lucide-react';

function QueryBlock({ title, sql, onCopy }) {
  return (
    <div className="debug-query-block">
      <div className="debug-query-block-header">
        <h4>{title}</h4>
        <button type="button" onClick={() => onCopy(sql)}>
          <Copy size={14} /> Copy
        </button>
      </div>
      <pre>{sql}</pre>
    </div>
  );
}

const QUERY_KEYS = [
  { key: 'metaseaTotalContentLive', label: 'Metasea - Total Content Live' },
  { key: 'partnerDbTotalContentLive', label: 'Partner DB - Total Content Live' },
  { key: 'partnerDbDeliveredInPeriod', label: 'Partner DB - Delivered in Period' },
  { key: 'partnerDbTakenDownInPeriod', label: 'Partner DB - Taken Down in Period' },
];

export default function QueryDebugPanel({
  loading,
  error,
  payload,
  onRefresh,
  onCopy,
}) {
  const items = payload?.partner === 'all'
    ? payload.items || []
    : payload?.item
      ? [payload.item]
      : [];

  return (
    <section className="query-debug-panel">
      <div className="query-debug-header">
        <div>
          <h3>DB Query Debug</h3>
          <p>Copy SQL and run directly in DBeaver for verification.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} /> Refresh Queries
        </button>
      </div>

      {loading ? <div className="query-debug-loading">Loading debug queries...</div> : null}
      {error ? <div className="query-debug-error">{error}</div> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="query-debug-empty">No query payload available.</div>
      ) : null}

      {!loading && !error
        ? items.map((item) => (
            <div key={item.partner} className="debug-partner-card">
              <div className="debug-partner-card-header">
                <h4>{item.partner}</h4>
                <span>
                  retailer_id: {item.retailerId} | tables: {item.tables?.contents}/{item.tables?.push}
                </span>
                {item.dateRange ? (
                  <span>
                    range: {item.dateRange.startDateTime} to {item.dateRange.endExclusiveDateTime} (exclusive)
                  </span>
                ) : null}
              </div>
              <div className="debug-query-grid">
                {QUERY_KEYS.map(({ key, label }) => (
                  <QueryBlock
                    key={`${item.partner}-${key}`}
                    title={label}
                    sql={item.queries?.[key] || '-- Not available --'}
                    onCopy={onCopy}
                  />
                ))}
              </div>
            </div>
          ))
        : null}
    </section>
  );
}

