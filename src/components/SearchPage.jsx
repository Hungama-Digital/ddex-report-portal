import React, { useState, useCallback } from 'react';
import { Search, AlertCircle, Loader2 } from 'lucide-react';
import { searchContents } from '../services/metricsApi';

const RETAILER_LABELS = {
  amazon: 'Amazon',
  bytedance: 'ByteDance',
  facebook: 'Facebook',
  jiosaavn: 'JioSaavn',
  spotify: 'Spotify',
  virgin: 'Virgin',
};

const MATCHED_BY_LABELS = {
  upc: 'UPC',
  albumId: 'Album ID',
  batchId: 'Batch ID',
  trackId: 'Track ID',
};

const STATUS_LABELS = {
  1: 'Generation stage 1',
  2: 'Push failed (reset)',
  3: 'Generation stage 3',
  4: 'Generation stage 4',
  5: 'Generation stage 5',
  6: 'Generation stage 6',
  7: 'Generation stage 7',
  8: 'Fetch started',
  9: 'Ready to push',
  10: 'Push in progress',
  11: 'Partially fetched / ready to push',
};

function formatStatus(raw) {
  if (raw === '' || raw === null || raw === undefined) return '-';
  const num = Number(raw);
  return STATUS_LABELS[num] ?? raw;
}

const SEARCH_TYPE_OPTIONS = [
  { value: 'all', label: 'All Identifiers' },
  { value: 'upc', label: 'UPC' },
  { value: 'albumId', label: 'Album ID' },
  { value: 'batchId', label: 'Batch ID' },
  { value: 'trackId', label: 'Track ID' },
];

const SearchPage = ({ addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await searchContents({ query: q, type: searchType });
      setResults(response.rows);
      setTotal(response.total || response.rows.length);
      if (response.rows.length === 0) {
        addToast({ title: 'Search', message: 'No results found for your query.', type: 'info' });
      }
    } catch (err) {
      const msg = err.message || 'Search failed. Please try again.';
      setError(msg);
      addToast({ title: 'Search Error', message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, searchType, addToast]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch(e);
  };

  return (
    <div className="search-page-container">
      <div className="search-controls-card glass">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-group">
            <div className="search-field-wrapper">
              <Search className="field-icon" size={20} />
              <input
                type="text"
                placeholder="Enter UPC, Album ID, Batch ID or Track ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="search-input"
              />
            </div>
            <select
              className="search-type-select"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
            >
              {SEARCH_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="submit"
              className="search-submit-btn"
              disabled={loading || !searchQuery.trim()}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : 'Search'}
            </button>
          </div>
        </form>
      </div>

      <div className="search-results-card glass">
        <div className="card-header">
          <h3>
            Search Results
            {total > 0 && <span className="result-count"> ({total})</span>}
          </h3>
        </div>

        {loading ? (
          <div className="results-loading">
            <Loader2 className="animate-spin" size={40} />
            <p>Searching across all partners...</p>
          </div>
        ) : error ? (
          <div className="results-error">
            <AlertCircle size={40} />
            <p>{error}</p>
            <button className="retry-btn" onClick={handleSearch}>Try Again</button>
          </div>
        ) : !hasSearched ? (
          <div className="results-empty">
            <Search size={40} />
            <p>Enter a value above and click Search.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="results-empty">
            <Search size={40} />
            <p>No matches found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Retailer</th>
                  <th>Album ID</th>
                  <th>Album Title</th>
                  <th>UPC</th>
                  <th>Batch ID</th>
                  <th>DDEX Type</th>
                  <th>Status</th>
                  <th>Added On</th>
                  <th>Updated On</th>
                  {searchType === 'all' && <th>Matched By</th>}
                </tr>
              </thead>
              <tbody>
                {results.map((item, index) => (
                  <tr key={`${item.retailer}-${item.albumId}-${item.batchId}-${index}`}>
                    <td>
                      <span className="retailer-badge">
                        {RETAILER_LABELS[item.retailer] || item.retailer}
                      </span>
                    </td>
                    <td className="id-cell">{item.albumId || '-'}</td>
                    <td className="title-cell">{item.albumTitle || '-'}</td>
                    <td className="code-cell">{item.upc || '-'}</td>
                    <td className="code-cell">{item.batchId || '-'}</td>
                    <td>
                      <span className={`type-pill ${(item.ddexType || '').toLowerCase().replace(/_/g, '-')}`}>
                        {item.ddexType || '-'}
                      </span>
                    </td>
                    <td>{formatStatus(item.status)}</td>
                    <td className="date-cell">{item.addedOn || '-'}</td>
                    <td className="date-cell">{item.updatedOn || '-'}</td>
                    {searchType === 'all' && (
                      <td>
                        <span className="matched-by-pill">
                          {MATCHED_BY_LABELS[item.matchedBy] || item.matchedBy || '-'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
