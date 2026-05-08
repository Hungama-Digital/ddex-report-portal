import React from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';

const DetailModal = ({ isOpen, onClose, content }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !content) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content.rawXml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>DDEX XML Data: {content.id}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="modal-body">
          <div className="metadata-grid">
            <div className="meta-item">
              <span className="meta-label">Title</span>
              <span className="meta-value">{content.title}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Artist</span>
              <span className="meta-value">{content.artist}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">ISRC</span>
              <span className="meta-value monospace">{content.isrc}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">UPC</span>
              <span className="meta-value monospace">{content.upc}</span>
            </div>
          </div>
          
          <div className="xml-viewer-header">
            <h3>Raw XML Message</h3>
            <button className="copy-btn" onClick={handleCopy}>
              {copied ? <><CheckCircle size={14} /> Copied</> : <><Copy size={14} /> Copy XML</>}
            </button>
          </div>
          <pre className="xml-viewer">
            <code>{content.rawXml}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
