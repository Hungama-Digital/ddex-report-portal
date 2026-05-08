import React, { useState, useMemo, useRef } from 'react';
import { FileQuestion, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import DetailModal from './DetailModal';

const ContentTable = ({ filteredContents, activeTab, activePage }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState(null);
  const downloadRef = useRef(null);
  const itemsPerPage = 10;
  
  const getTabTitle = () => {
    switch (activeTab) {
      case 'totalLive': return 'Currently Live Content';
      case 'deliveredThisMonth': return 'Content Delivered in Period';
      case 'takenDownThisMonth': return 'Content Taken Down in Period';
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
    return filteredContents.filter(item => 
      item.title.toLowerCase().includes(lower) || 
      item.isrc.toLowerCase().includes(lower) || 
      item.upc.includes(lower) ||
      item.id.toLowerCase().includes(lower) ||
      (activePage !== 'video-reports' && item.albumId && item.albumId.toLowerCase().includes(lower))
    );
  }, [filteredContents, searchTerm, activePage]);

  // Pagination logic
  const totalPages = Math.ceil(searchedData.length / itemsPerPage);
  const paginatedData = searchedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Generate Data URI for Excel Export natively
  const exportDataUri = useMemo(() => {
    if (searchedData.length === 0) return '#';
    
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
  }, [searchedData]);

  return (
    <div className="content-table-container">
      <div className="table-header-row">
        <h2 className="table-title">{getTabTitle()} ({searchedData.length})</h2>
        <div className="table-actions">
          <div className="search-bar">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder={activePage === 'video-reports' ? "Search ID, Title, ISRC, UPC..." : "Search ID, Title, Album ID..."} 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <a 
            className="export-btn" 
            href={exportDataUri}
            download={`DDEX_Export_${new Date().toISOString().split('T')[0]}.xls`}
            style={{ textDecoration: 'none' }}
          >
            <Download size={16} /> Export Excel
          </a>
        </div>
      </div>
      
      <div className="table-wrapper">
        {paginatedData.length > 0 ? (
          <table>
            <thead>
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
            </thead>
            <tbody>
              {paginatedData.map(content => (
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
        <div className="pagination">
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <a ref={downloadRef} style={{ display: 'none' }} />

      <DetailModal 
        isOpen={!!selectedRow} 
        onClose={() => setSelectedRow(null)} 
        content={selectedRow} 
      />
    </div>
  );
};

export default ContentTable;
