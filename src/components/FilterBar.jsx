import React from 'react';
import { Calendar, Building2 } from 'lucide-react';
import { audioPartners, videoPartners } from '../data/mockData';

const FilterBar = ({ selectedPartner, setSelectedPartner, startDate, setStartDate, endDate, setEndDate, activePage, dashboardMode }) => {
  const currentPartners = activePage === 'video-reports' || dashboardMode === 'video'
    ? videoPartners 
    : activePage === 'audio-reports' || dashboardMode === 'audio'
      ? audioPartners 
      : [...audioPartners, ...videoPartners];

  const partnerLabel = activePage === 'video-reports' || dashboardMode === 'video'
    ? 'Select Video Partner' 
    : activePage === 'audio-reports' || dashboardMode === 'audio'
      ? 'Select Audio Partner' 
      : 'Select Partner';

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label htmlFor="partner">
          <Building2 size={16} />
          {partnerLabel}
        </label>
        <select 
          id="partner" 
          className="filter-input"
          value={selectedPartner}
          onChange={(e) => setSelectedPartner(e.target.value)}
        >
          <option value="all">All Partners</option>
          {currentPartners.map(partner => (
            <option key={partner.id} value={partner.id}>{partner.name}</option>
          ))}
        </select>
      </div>
      
      <div className="filter-group">
        <label htmlFor="startDate">
          <Calendar size={16} />
          From Date
        </label>
        <input 
          type="date" 
          id="startDate" 
          className="filter-input"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      
      <div className="filter-group">
        <label htmlFor="endDate">
          <Calendar size={16} />
          To Date
        </label>
        <input 
          type="date" 
          id="endDate" 
          className="filter-input"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
    </div>
  );
};

export default FilterBar;
