import { useState, useMemo, useRef, useEffect } from 'react';
import { FileQuestion, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import DetailModal from './DetailModal';

const ContentTable = ({
  filteredContents,
  activeTab,
  activePage,
  tableLoading = false,
  tableError = null,
  reportPartnerLabel = '',
  reportFileNamePrefix = 'DDEX',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState(null);
  const downloadRef = useRef(null);
  const itemsPerPage = 20;
  const isDbDetailsMode =
    activePage === 'audio-reports' &&
    Array.isArray(filteredContents) &&
    filteredContents.length > 0 &&
    Object.prototype.hasOwnProperty.call(filteredContents[0], 'addedOn');
  
  const getTabTitle = () => {
    const suffix = reportPartnerLabel ? ` (${reportPartnerLabel})` : '';
    switch (activeTab) {
      case 'totalLive': return `Currently Live Content${suffix}`;
      case 'deliveredThisMonth': return `Content Delivered in Period${suffix}`;
      case 'takenDownThisMonth': return `Content Taken Down in Period${suffix}`;
      default: return 'Content Details';
    }
  };

  const getStatusClass = (status) => {
    switch(status.toLowerCase()) {
      case 'live': return 'status-live';
      case 'delivered': return 'status-delivered';
      case 'taken down': return 'status-takendown';
      default: return 'status-processing';
    }
  };

  // Filter based on search
  const searchedData = useMemo(() => {
    if (!searchTerm) return filteredContents;
    const lower = searchTerm.toLowerCase();
    if (isDbDetailsMode) {
      return filteredContents.filter((item) =>
        [
          item.albumId,
          item.albumName,
          item.upc,
          item.addedOn,
          item.updatedOn,
          item.batchId,
          item.trackIdsCsv,
          String(item.trackCount || 0),
        ]
          .join(' ')
          .toLowerCase()
          .includes(lower),
      );
    }

    return filteredContents.filter(item => 
      item.title.toLowerCase().includes(lower) || 
      item.isrc.toLowerCase().includes(lower) || 
      item.upc.includes(lower) ||
      item.id.toLowerCase().includes(lower) ||
      (activePage !== 'video-reports' && item.albumId && item.albumId.toLowerCase().includes(lower))
    );
  }, [filteredContents, searchTerm, activePage, isDbDetailsMode]);

  // Pagination logic
  const totalPages = Math.ceil(searchedData.length / itemsPerPage);
  const paginatedData = searchedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
      return;
    }
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginationModel = useMemo(() => {
    if (totalPages <= 1) {
      return [];
    }

    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    const windowSize = 6;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages - 1, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    const pages = [];
    for (let value = start; value <= end; value += 1) {
      pages.push(value);
    }
    if (end < totalPages - 1) {
      pages.push('ellipsis');
    }
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  // Generate Data URI for Excel Export natively
  const exportDataUri = useMemo(() => {
    if (searchedData.length === 0) return '#';
    if (isDbDetailsMode) {
      const expandedTrackRows = [];
      searchedData.forEach((row) => {
        const trackIds = String(row.trackIdsCsv || '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => /^\d+$/.test(item));
        if (trackIds.length === 0) {
          expandedTrackRows.push({
            trackId: '',
            albumId: row.albumId || '',
            albumName: row.albumName || '',
            upc: row.upc || '',
            addedOn: row.addedOn || '',
            batchId: row.batchId || '',
          });
          return;
        }

        trackIds.forEach((trackId) => {
          expandedTrackRows.push({
            trackId,
            albumId: row.albumId || '',
            albumName: row.albumName || '',
            upc: row.upc || '',
            addedOn: row.addedOn || '',
            batchId: row.batchId || '',
          });
        });
      });

      let htmlStr = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <style>
            th { background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 8px; font-weight: bold; text-align: left; }
            td { border: 1px solid #e5e7eb; padding: 8px; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                <th>Track ID</th>
                <th>Album ID</th>
                <th>Album Name</th>
                <th>UPC</th>
                <th>Added On</th>
                <th>Batch ID</th>
              </tr>
            </thead>
            <tbody>`;

      expandedTrackRows.forEach((row) => {
        const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        htmlStr += `
              <tr>
                <td>${escapeHtml(row.trackId)}</td>
                <td>${escapeHtml(row.albumId)}</td>
                <td>${escapeHtml(row.albumName)}</td>
                <td>${escapeHtml(row.upc)}</td>
                <td>${escapeHtml(row.addedOn)}</td>
                <td>${escapeHtml(row.batchId)}</td>
              </tr>`;
      });

      htmlStr += `
            </tbody>
          </table>
        </body>
      </html>`;

      return 'data:application/vnd.ms-excel;charset=utf-8,' + encodeURIComponent(htmlStr);
    }
    
    let htmlStr = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          th { background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 8px; font-weight: bold; text-align: left; }
          td { border: 1px solid #e5e7eb; padding: 8px; }
          .text { mso-number-format: "\\@"; } 
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th>Content ID</th>
              <th>Title</th>
              ${activePage !== 'video-reports' ? '<th>Artist</th><th>Album ID</th>' : ''}
              <th>ISRC</th>
              <th>UPC</th>
              <th>Release Date</th>
              <th>Action Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>`;

    searchedData.forEach(row => {
      const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      htmlStr += `
            <tr>
              <td>${escapeHtml(row.id)}</td>
              <td>${escapeHtml(row.title)}</td>
              ${activePage !== 'video-reports' ? `<td>${escapeHtml(row.artist)}</td><td>${escapeHtml(row.albumId)}</td>` : ''}
              <td class="text">${escapeHtml(row.isrc)}</td>
              <td class="text">${escapeHtml(row.upc)}</td>
              <td>${escapeHtml(row.releaseDate)}</td>
              <td>${escapeHtml(row.actionDate)}</td>
              <td>${escapeHtml(row.status)}</td>
            </tr>`;
    });

    htmlStr += `
          </tbody>
        </table>
      </body>
    </html>`;

    return 'data:application/vnd.ms-excel;charset=utf-8,' + encodeURIComponent(htmlStr);
  }, [searchedData, activePage, isDbDetailsMode]);

  const exportFileName = useMemo(() => {
    const prefix = String(reportFileNamePrefix || 'DDEX').replace(/\s+/g, '_');
    const date = new Date().toISOString().split('T')[0];
    return `${prefix}_DDEX_Export_${date}.xls`;
  }, [reportFileNamePrefix]);

  return (
    <div className="content-table-container">
      <div className="table-header-row">
        <h2 className="table-title">{getTabTitle()}</h2>
        <div className="table-actions">
          <div className="search-bar">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder={
                isDbDetailsMode
                  ? "Search album, UPC, batch, tracks..."
                  : activePage === 'video-reports'
                    ? "Search ID, Title, ISRC, UPC..."
                    : "Search ID, Title, Album ID..."
              } 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <a 
            className="export-btn" 
            href={exportDataUri}
            download={exportFileName}
            style={{ textDecoration: 'none' }}
          >
            <Download size={16} /> Export Excel
          </a>
          {totalPages > 1 && (
            <div className="pagination pagination-inline">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => page - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              {paginationModel.map((entry, index) =>
                entry === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={entry}
                    className={`page-number ${currentPage === entry ? 'active' : ''}`}
                    onClick={() => setCurrentPage(entry)}
                  >
                    {entry}
                  </button>
                ),
              )}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="table-wrapper">
        {tableLoading ? (
          <div className="empty-state">
            <h3>Loading content rows...</h3>
          </div>
        ) : tableError ? (
          <div className="empty-state">
            <h3>Unable to load content rows</h3>
            <p>{tableError}</p>
          </div>
        ) : paginatedData.length > 0 ? (
          <table>
            <thead>
              {isDbDetailsMode ? (
                <tr>
                  <th>Album ID</th>
                  <th>Album Name</th>
                  <th>UPC</th>
                  <th>Added On</th>
                  <th>Batch ID</th>
                  <th>Track IDs</th>
                </tr>
              ) : (
                <tr>
                  <th>Content ID</th>
                  <th>Title</th>
                  {activePage !== 'video-reports' && <th>Artist</th>}
                  {activePage !== 'video-reports' && <th>Album ID</th>}
                  <th>ISRC</th>
                  <th>UPC</th>
                  <th>Release Date</th>
                  <th>Action Date</th>
                  <th>Status</th>
                </tr>
              )}
            </thead>
            <tbody>
              {isDbDetailsMode
                ? paginatedData.map((content) => (
                    <tr key={content.id}>
                      <td style={{ fontWeight: 500 }}>{content.albumId}</td>
                      <td>{content.albumName || '-'}</td>
                      <td>{content.upc || '-'}</td>
                      <td>{content.addedOn || '-'}</td>
                      <td>{content.batchId}</td>
                      <td>
                        <div className="track-ids-cell" title={content.trackIdsCsv || '-'}>
                          {content.trackIdsCsv || '-'}
                        </div>
                      </td>
                    </tr>
                  ))
                : paginatedData.map(content => (
                    <tr key={content.id} onClick={() => setSelectedRow(content)} className="clickable-row">
                      <td style={{fontWeight: 500}}>{content.id}</td>
                      <td>{content.title}</td>
                      {activePage !== 'video-reports' && <td>{content.artist}</td>}
                      {activePage !== 'video-reports' && <td style={{fontWeight: 500}}>{content.albumId}</td>}
                      <td style={{fontFamily: 'monospace', color: 'var(--text-secondary)'}}>{content.isrc}</td>
                      <td style={{fontFamily: 'monospace', color: 'var(--text-secondary)'}}>{content.upc}</td>
                      <td>{content.releaseDate}</td>
                      <td style={{color: 'var(--text-secondary)'}}>{content.actionDate}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(content.status)}`}>
                          {content.status}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <FileQuestion size={48} className="empty-icon" />
            <h3>No contents found</h3>
            <p>Try adjusting your filters or search term to see more results.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination pagination-bottom-right">
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          {paginationModel.map((entry, index) =>
            entry === 'ellipsis' ? (
              <span key={`ellipsis-bottom-${index}`} className="pagination-ellipsis">...</span>
            ) : (
              <button
                key={`bottom-${entry}`}
                className={`page-number ${currentPage === entry ? 'active' : ''}`}
                onClick={() => setCurrentPage(entry)}
              >
                {entry}
              </button>
            ),
          )}
          <button 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <a ref={downloadRef} style={{ display: 'none' }} />

      {!isDbDetailsMode && (
        <DetailModal 
          isOpen={!!selectedRow} 
          onClose={() => setSelectedRow(null)} 
          content={selectedRow} 
        />
      )}
    </div>
  );
};

export default ContentTable;
