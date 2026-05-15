import React, { useState, useEffect, useCallback } from 'react';
import { Search, Info, AlertCircle, Loader2 } from 'lucide-react';
import { searchContents } from '../services/metricsApi';

const SearchPage = ({ addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const response = await searchContents({ query: searchQuery, type: searchType });
      setResults(response.rows);
      if (response.rows.length === 0) {
        addToast({ title: 'Search', message: 'No results found for your query.', type: 'info' });
      }
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.');
      addToast({ title: 'Search Error', message: err.message || 'Search failed.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, searchType, addToast]);

  return (
    <div className="search-page-container">
      <div className="search-controls-card glass">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-group">
            <div className="search-field-wrapper">
              <Search className="field-icon" size={20} />
              <input
                type="text"
                placeholder="Search by UPC, ISRC, Track ID or Album ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
            <select
              className="search-type-select"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
            >
              <option value="all">All Identifiers</option>
              <option value="upc">UPC ID</option>
              <option value="isrc">ISRC</option>
              <option value="trackId">Track ID</option>
              <option value="albumId">Album ID</option>
            </select>
            <button type="submit" className="search-submit-btn" disabled={loading || !searchQuery.trim()}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : 'Search'}
            </button>
          </div>
          <p className="search-hint">
            <Info size={14} style={{ marginRight: '4px' }} />
            Enter a valid identifier to locate content across the repository.
          </p>
        </form>
      </div>

      <div className="search-results-card glass">
        <div className="card-header">
          <h3>Search Results {results.length > 0 && `(${results.length})`}</h3>
        </div>

        {loading ? (
          <div className="results-loading">
            <Loader2 className="animate-spin" size={40} />
            <p>Searching repository...</p>
          </div>
        ) : error ? (
          <div className="results-error">
            <AlertCircle size={40} />
            <p>{error}</p>
            <button className="retry-btn" onClick={handleSearch}>Try Again</button>
          </div>
        ) : results.length === 0 ? (
          <div className="results-empty">
            <Search size={40} />
            <p>{searchQuery ? 'No matches found.' : 'Enter a query to start searching.'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Content ID</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>UPC / ISRC</th>
                  <th>Vendor ID</th>
                  <th>Status</th>
                  <th>Retailers</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr key={item.id}>
                    <td className="id-cell">{item.id}</td>
                    <td>
                      <span className={`type-pill ${item.contentType.toLowerCase()}`}>
                        {item.contentType}
                      </span>
                    </td>
                    <td className="title-cell">{item.title || '-'}</td>
                    <td className="code-cell">{item.code || '-'}</td>
                    <td>{item.vendorId || '-'}</td>
                    <td>
                      <span className={`status-pill ${item.status.toLowerCase().includes('live') ? 'status-live' : ''}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="retailer-count">{item.retailerCount} Retailers</td>
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
