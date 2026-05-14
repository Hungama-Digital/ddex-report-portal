import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { audioContents, videoContents, audioPartners } from './data/mockData';
import FilterBar from './components/FilterBar';
import SummaryCards from './components/SummaryCards';
import ContentTable from './components/ContentTable';
import DashboardCharts from './components/DashboardCharts';
import Sidebar from './components/Sidebar';
import AuthScreen from './components/AuthScreen';
import ReportsPage from './components/ReportsPage';
import AdminPage from './components/AdminPage';
import ConfirmDialog from './components/ConfirmDialog';
import NotificationToasts from './components/NotificationToasts';
import { Sun, Moon, Search, Download } from 'lucide-react';
import {
  approvePendingUser,
  fetchAudioDetailsRows,
  fetchAudioPartnerSummary,
  fetchAudioPartnerTotalContentLive,
  fetchAudioRecentDeliveries,
  fetchMe,
  fetchNotifications,
  fetchPendingApprovals,
  fetchReportJobs,
  fetchReports,
  isValidDateInput,
  logout,
  markNotificationAsRead,
  queueDifferenceReport,
  queueExportReport,
  rejectPendingUser,
} from './services/metricsApi';
import { getPartnerDisplayName } from './utils/partnerDisplay';

const EMPTY_AUDIO_SUMMARY = {
  queryKey: null,
  status: 'idle',
  error: null,
  metasea: 0,
  partnerDb: 0,
  total: 0,
  deliveredInPeriod: 0,
  takenDownInPeriod: 0,
};

const EMPTY_RECENT_DELIVERIES = {
  queryKey: null,
  status: 'idle',
  error: null,
  rows: [],
};

const EMPTY_AUDIO_DETAILS_ROWS = {
  queryKey: null,
  status: 'idle',
  error: null,
  rows: [],
};

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

function App() {
  const [selectedPartner, setSelectedPartner] = useLocalStorage('ddex_partner', 'all');
  const [startDate, setStartDate] = useLocalStorage('ddex_startDate', '2026-05-01');
  const [endDate, setEndDate] = useLocalStorage('ddex_endDate', '2026-05-31');
  const [activeTab, setActiveTab] = useLocalStorage('ddex_activeTab', 'totalLive');
  const [isDarkMode, setIsDarkMode] = useLocalStorage('ddex_darkMode', false);
  const [activePage, setActivePage] = useLocalStorage('ddex_activePage', 'dashboard');
  const [dashboardMode, setDashboardMode] = useLocalStorage('ddex_dashboardMode', 'combined');

  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [audioSummary, setAudioSummary] = useState(EMPTY_AUDIO_SUMMARY);
  const [recentDeliveriesState, setRecentDeliveriesState] = useState(EMPTY_RECENT_DELIVERIES);
  const [audioDetailsRowsState, setAudioDetailsRowsState] = useState(EMPTY_AUDIO_DETAILS_ROWS);
  const [dashboardRecentSearchTerm, setDashboardRecentSearchTerm] = useState('');

  const [reportsState, setReportsState] = useState({ loading: false, rows: [] });
  const [jobsState, setJobsState] = useState({ loading: false, rows: [] });
  const [approvalsState, setApprovalsState] = useState({ loading: false, rows: [] });

  const [notificationsState, setNotificationsState] = useState({ unreadCount: 0, rows: [] });
  const seenNotificationRef = useRef(new Set());
  const [toasts, setToasts] = useState([]);

  const [exportActionLoading, setExportActionLoading] = useState(false);
  const [confirmDialogState, setConfirmDialogState] = useState({
    open: false,
    source: null,
    title: '',
    message: '',
  });

  const addToast = useCallback((payload) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((previous) => [...previous, { id, ...payload }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, 7000);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const token = window.localStorage.getItem('ddex_auth_token');
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const me = await fetchMe();
        setAuthUser(me.user);
        setNotificationsState((prev) => ({ ...prev, unreadCount: Number(me.unreadNotifications) || 0 }));
      } catch (_error) {
        window.localStorage.removeItem('ddex_auth_token');
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    bootstrap();
  }, []);

  const handleAuthenticated = (user) => {
    setAuthUser(user);
    setAuthLoading(false);
    addToast({ title: 'Welcome', message: `Logged in as ${user.username}`, type: 'success' });
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (_error) {
      // silent
    }
    window.localStorage.removeItem('ddex_auth_token');
    setAuthUser(null);
    setNotificationsState({ unreadCount: 0, rows: [] });
    setApprovalsState({ loading: false, rows: [] });
  };

  useEffect(() => {
    if (!authUser) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetchNotifications({ includeRead: false, limit: 30 });
        if (cancelled) {
          return;
        }

        const rows = Array.isArray(response.notifications) ? response.notifications : [];
        setNotificationsState({ unreadCount: Number(response.unreadCount) || 0, rows });

        for (const item of rows) {
          if (seenNotificationRef.current.has(item.id)) {
            continue;
          }
          seenNotificationRef.current.add(item.id);

          if (item.type === 'report_ready') {
            addToast({ title: 'Report Ready', message: item.message, type: 'success' });
          } else if (item.type === 'report_failed') {
            addToast({ title: 'Report Failed', message: item.message, type: 'error' });
          } else if (item.type === 'approval_request' && authUser.role === 'admin') {
            addToast({ title: 'Approval Request', message: item.message, type: 'info' });
          }

          markNotificationAsRead(item.id).catch(() => {});
        }
      } catch (_error) {
        // skip transient poll errors
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authUser, addToast]);

  const fetchReportsData = useCallback(async () => {
    if (!authUser) {
      return;
    }
    setReportsState((previous) => ({ ...previous, loading: true }));
    setJobsState((previous) => ({ ...previous, loading: true }));

    try {
      const [reportsResponse, jobsResponse] = await Promise.all([
        fetchReports({ days: 7 }),
        fetchReportJobs({ limit: 50 }),
      ]);
      setReportsState({ loading: false, rows: reportsResponse.rows || [] });
      setJobsState({ loading: false, rows: jobsResponse.rows || [] });
    } catch (error) {
      setReportsState({ loading: false, rows: [] });
      setJobsState({ loading: false, rows: [] });
      addToast({ title: 'Reports', message: error?.message || 'Unable to fetch reports.', type: 'error' });
    }
  }, [authUser, addToast]);

  useEffect(() => {
    if (!authUser || activePage !== 'reports') {
      return;
    }
    fetchReportsData();
  }, [authUser, activePage, fetchReportsData]);

  const fetchApprovalsData = useCallback(async () => {
    if (!authUser || authUser.role !== 'admin') {
      return;
    }

    setApprovalsState((previous) => ({ ...previous, loading: true }));
    try {
      const output = await fetchPendingApprovals();
      setApprovalsState({ loading: false, rows: output.rows || [] });
    } catch (error) {
      setApprovalsState({ loading: false, rows: [] });
      addToast({ title: 'Admin', message: error?.message || 'Unable to fetch approvals.', type: 'error' });
    }
  }, [authUser, addToast]);

  useEffect(() => {
    if (!authUser || authUser.role !== 'admin' || activePage !== 'admin') {
      return;
    }
    fetchApprovalsData();
  }, [authUser, activePage, fetchApprovalsData]);

  const handleApproveUser = async (userId) => {
    try {
      await approvePendingUser(userId);
      addToast({ title: 'Admin', message: 'User approved successfully.', type: 'success' });
      fetchApprovalsData();
    } catch (error) {
      addToast({ title: 'Admin', message: error?.message || 'Approval failed.', type: 'error' });
    }
  };

  const handleRejectUser = async (userId) => {
    try {
      await rejectPendingUser(userId);
      addToast({ title: 'Admin', message: 'User rejected.', type: 'success' });
      fetchApprovalsData();
    } catch (error) {
      addToast({ title: 'Admin', message: error?.message || 'Rejection failed.', type: 'error' });
    }
  };

  const audioPartnerIdSet = useMemo(() => new Set(audioPartners.map((partner) => partner.id)), []);

  const isAudioPartnerSelected = selectedPartner !== 'all' && audioPartnerIdSet.has(selectedPartner);
  const isAllAudioPartnersSelected = selectedPartner === 'all';
  const isAudioSelectionSupported = isAllAudioPartnersSelected || isAudioPartnerSelected;
  const shouldLoadAudioMetrics =
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video')) &&
    isAudioSelectionSupported;
  const hasValidDateRange =
    isValidDateInput(startDate) &&
    isValidDateInput(endDate) &&
    new Date(`${startDate}T00:00:00Z`) <= new Date(`${endDate}T00:00:00Z`);

  const recentDeliveriesPartner = useMemo(() => {
    if (dashboardMode === 'video') {
      return null;
    }

    if (selectedPartner === 'all') {
      return 'all';
    }

    if (isAudioPartnerSelected) {
      return selectedPartner;
    }

    return null;
  }, [dashboardMode, selectedPartner, isAudioPartnerSelected]);

  const currentAudioSummaryKey = useMemo(() => {
    if (!shouldLoadAudioMetrics) {
      return null;
    }
    return `${selectedPartner}|${startDate}|${endDate}|audio-summary`;
  }, [shouldLoadAudioMetrics, selectedPartner, startDate, endDate]);

  const currentRecentDeliveriesKey = useMemo(() => {
    if (!recentDeliveriesPartner) {
      return null;
    }

    return `${recentDeliveriesPartner}|${startDate}|${endDate}|20`;
  }, [recentDeliveriesPartner, startDate, endDate]);

  const isAudioSummaryLoading =
    Boolean(currentAudioSummaryKey) &&
    audioSummary.queryKey === currentAudioSummaryKey &&
    audioSummary.status === 'loading';

  const isAudioSummaryReady =
    audioSummary.queryKey === currentAudioSummaryKey &&
    audioSummary.status === 'success';

  const audioSummaryError =
    audioSummary.queryKey === currentAudioSummaryKey && audioSummary.status === 'error'
      ? audioSummary.error
      : null;

  const liveBreakdown = isAudioSummaryReady
    ? {
        isLiveData: true,
        metasea: audioSummary.metasea,
        partnerDb: audioSummary.partnerDb,
      }
    : null;

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!authUser || !currentAudioSummaryKey) {
      return;
    }

    const abortController = new AbortController();
    setAudioSummary((previous) => ({
      ...previous,
      queryKey: currentAudioSummaryKey,
      status: 'loading',
      error: null,
    }));

    const allPartnersPromise = isAllAudioPartnersSelected
      ? Promise.all(
          audioPartners.map((partner) =>
            hasValidDateRange
              ? fetchAudioPartnerSummary({
                  partner: partner.id,
                  startDate,
                  endDate,
                  signal: abortController.signal,
                })
              : fetchAudioPartnerTotalContentLive({
                  partner: partner.id,
                  signal: abortController.signal,
                }),
          ),
        ).then((responses) => {
          const summaries = responses.filter(Boolean);
          return summaries.reduce(
            (acc, item) => ({
              metasea: acc.metasea + (Number(item.metasea) || 0),
              partnerDb: acc.partnerDb + (Number(item.partnerDb) || 0),
              total: acc.total + (Number(item.total) || 0),
              deliveredInPeriod: acc.deliveredInPeriod + (Number(item.deliveredInPeriod) || 0),
              takenDownInPeriod: acc.takenDownInPeriod + (Number(item.takenDownInPeriod) || 0),
            }),
            {
              metasea: 0,
              partnerDb: 0,
              total: 0,
              deliveredInPeriod: 0,
              takenDownInPeriod: 0,
            },
          );
        })
      : hasValidDateRange
        ? fetchAudioPartnerSummary({
            partner: selectedPartner,
            startDate,
            endDate,
            signal: abortController.signal,
          })
        : fetchAudioPartnerTotalContentLive({
            partner: selectedPartner,
            signal: abortController.signal,
          }).then((item) => ({
            ...item,
            deliveredInPeriod: 0,
            takenDownInPeriod: 0,
          }));

    allPartnersPromise
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        const summary = response || EMPTY_AUDIO_SUMMARY;
        setAudioSummary({
          queryKey: currentAudioSummaryKey,
          status: 'success',
          error: null,
          metasea: Number(summary.metasea) || 0,
          partnerDb: Number(summary.partnerDb) || 0,
          total: Number(summary.total) || 0,
          deliveredInPeriod: Number(summary.deliveredInPeriod) || 0,
          takenDownInPeriod: Number(summary.takenDownInPeriod) || 0,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setAudioSummary({
          ...EMPTY_AUDIO_SUMMARY,
          queryKey: currentAudioSummaryKey,
          status: 'error',
          error: error?.message || 'Unable to load audio partner metrics.',
        });
      });

    return () => {
      abortController.abort();
    };
  }, [currentAudioSummaryKey, selectedPartner, startDate, endDate, isAllAudioPartnersSelected, hasValidDateRange, authUser]);

  const { totalLiveArr, deliveredArr, takenDownArr } = useMemo(() => {
    let data = activePage === 'video-reports' ? videoContents : audioContents;
    if (selectedPartner !== 'all') {
      data = data.filter((item) => item.partner === selectedPartner);
    }

    const end = new Date(endDate);
    const start = new Date(startDate);

    const live = data.filter((item) => item.isLive);
    const delivered = data.filter((item) => {
      const itemDate = new Date(item.releaseDate);
      return itemDate >= start && itemDate <= end && item.deliveredThisMonth && item.status !== 'Taken Down';
    });
    const takenDown = data.filter((item) => {
      const itemDate = new Date(item.releaseDate);
      return itemDate >= start && itemDate <= end && item.takenDownThisMonth;
    });

    return { totalLiveArr: live, deliveredArr: delivered, takenDownArr: takenDown };
  }, [selectedPartner, startDate, endDate, activePage]);

  const shouldUseDbMetricsForAudio = Boolean(currentAudioSummaryKey) && isAudioSummaryReady;

  useEffect(() => {
    if (!authUser || !currentRecentDeliveriesKey || !recentDeliveriesPartner) {
      return;
    }
    if (!hasValidDateRange) {
      setRecentDeliveriesState({
        queryKey: currentRecentDeliveriesKey,
        status: 'success',
        error: null,
        rows: [],
      });
      return;
    }

    const abortController = new AbortController();
    setRecentDeliveriesState((previous) => ({
      ...previous,
      queryKey: currentRecentDeliveriesKey,
      status: 'loading',
      error: null,
      rows: [],
    }));

    fetchAudioRecentDeliveries({
      partner: recentDeliveriesPartner,
      startDate,
      endDate,
      limit: 20,
      signal: abortController.signal,
    })
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        setRecentDeliveriesState({
          queryKey: currentRecentDeliveriesKey,
          status: 'success',
          error: null,
          rows: response.rows,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setRecentDeliveriesState({
          queryKey: currentRecentDeliveriesKey,
          status: 'error',
          error: error?.message || 'Unable to load recent deliveries.',
          rows: [],
        });
      });

    return () => {
      abortController.abort();
    };
  }, [currentRecentDeliveriesKey, recentDeliveriesPartner, startDate, endDate, hasValidDateRange, authUser]);

  const currentAudioDetailsKey = useMemo(() => {
    if (activePage !== 'audio-reports' || !isAudioSelectionSupported) {
      return null;
    }
    return `${selectedPartner}|${activeTab}|${startDate}|${endDate}|audio-details`;
  }, [activePage, isAudioSelectionSupported, selectedPartner, activeTab, startDate, endDate]);

  const detailsLimit = useMemo(() => {
    const byTab = {
      totalLive: Number(audioSummary.partnerDb) || 0,
      deliveredThisMonth: Number(audioSummary.deliveredInPeriod) || 0,
      takenDownThisMonth: Number(audioSummary.takenDownInPeriod) || 0,
    };
    const raw = byTab[activeTab] || 0;
    const withBuffer = raw > 0 ? raw + 500 : 10000;
    return Math.max(10000, Math.min(withBuffer, 300000));
  }, [activeTab, audioSummary.partnerDb, audioSummary.deliveredInPeriod, audioSummary.takenDownInPeriod]);

  useEffect(() => {
    if (!authUser || !currentAudioDetailsKey) {
      return;
    }

    const detailTypeByTab = {
      totalLive: 'live',
      deliveredThisMonth: 'delivered',
      takenDownThisMonth: 'takedown',
    };
    const detailType = detailTypeByTab[activeTab] || 'live';
    if (detailType !== 'live' && !hasValidDateRange) {
      setAudioDetailsRowsState({
        queryKey: currentAudioDetailsKey,
        status: 'success',
        error: null,
        rows: [],
      });
      return;
    }

    const abortController = new AbortController();
    setAudioDetailsRowsState({
      queryKey: currentAudioDetailsKey,
      status: 'loading',
      error: null,
      rows: [],
    });

    fetchAudioDetailsRows({
      partner: selectedPartner,
      type: detailType,
      startDate,
      endDate,
      limit: detailsLimit,
      signal: abortController.signal,
    })
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        setAudioDetailsRowsState({
          queryKey: currentAudioDetailsKey,
          status: 'success',
          error: null,
          rows: response.rows,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setAudioDetailsRowsState({
          queryKey: currentAudioDetailsKey,
          status: 'error',
          error: error?.message || 'Unable to load detailed rows.',
          rows: [],
        });
      });

    return () => {
      abortController.abort();
    };
  }, [activeTab, selectedPartner, startDate, endDate, currentAudioDetailsKey, hasValidDateRange, detailsLimit, authUser]);

  const stats = {
    totalLive: shouldUseDbMetricsForAudio ? audioSummary.total : 0,
    deliveredThisMonth: shouldUseDbMetricsForAudio ? audioSummary.deliveredInPeriod : 0,
    takenDownThisMonth: shouldUseDbMetricsForAudio ? audioSummary.takenDownInPeriod : 0,
  };

  const dashboardStats = useMemo(() => {
    const computedStats = {
      audio: {
        totalLive: 0,
        deliveredThisMonth: 0,
        takenDownThisMonth: 0,
      },
      video: {
        totalLive: 0,
        deliveredThisMonth: 0,
        takenDownThisMonth: 0,
      },
    };

    if (!shouldUseDbMetricsForAudio) {
      return computedStats;
    }

    return {
      ...computedStats,
      audio: {
        totalLive: audioSummary.total,
        deliveredThisMonth: audioSummary.deliveredInPeriod,
        takenDownThisMonth: audioSummary.takenDownInPeriod,
      },
    };
  }, [shouldUseDbMetricsForAudio, audioSummary.total, audioSummary.deliveredInPeriod, audioSummary.takenDownInPeriod]);

  const shouldUseLiveRecentDeliveries =
    dashboardMode !== 'video' &&
    Boolean(currentRecentDeliveriesKey) &&
    recentDeliveriesState.queryKey === currentRecentDeliveriesKey &&
    recentDeliveriesState.status === 'success';

  const isRecentDeliveriesLoading =
    dashboardMode !== 'video' &&
    Boolean(currentRecentDeliveriesKey) &&
    recentDeliveriesState.queryKey === currentRecentDeliveriesKey &&
    recentDeliveriesState.status === 'loading';

  const recentDeliveriesError =
    dashboardMode !== 'video' &&
    Boolean(currentRecentDeliveriesKey) &&
    recentDeliveriesState.queryKey === currentRecentDeliveriesKey &&
    recentDeliveriesState.status === 'error'
      ? recentDeliveriesState.error
      : null;

  const recentDeliveries = shouldUseLiveRecentDeliveries ? recentDeliveriesState.rows : [];

  const dashboardRecentRows = useMemo(() => {
    const search = dashboardRecentSearchTerm.trim().toLowerCase();
    if (!search) {
      return recentDeliveries;
    }
    return recentDeliveries.filter((item) =>
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
        .includes(search),
    );
  }, [recentDeliveries, dashboardRecentSearchTerm]);

  const tableContents = useMemo(() => {
    if (activePage === 'audio-reports') {
      if (audioDetailsRowsState.queryKey === currentAudioDetailsKey && audioDetailsRowsState.status === 'success') {
        return audioDetailsRowsState.rows;
      }
      return [];
    }

    switch (activeTab) {
      case 'totalLive':
        return totalLiveArr;
      case 'deliveredThisMonth':
        return deliveredArr;
      case 'takenDownThisMonth':
        return takenDownArr;
      default:
        return totalLiveArr;
    }
  }, [
    activePage,
    activeTab,
    totalLiveArr,
    deliveredArr,
    takenDownArr,
    audioDetailsRowsState.queryKey,
    audioDetailsRowsState.status,
    audioDetailsRowsState.rows,
    currentAudioDetailsKey,
  ]);

  const audioDetailsLoading =
    activePage === 'audio-reports' &&
    Boolean(currentAudioDetailsKey) &&
    audioDetailsRowsState.queryKey === currentAudioDetailsKey &&
    audioDetailsRowsState.status === 'loading';

  const audioDetailsError =
    activePage === 'audio-reports' &&
    Boolean(currentAudioDetailsKey) &&
    audioDetailsRowsState.queryKey === currentAudioDetailsKey &&
    audioDetailsRowsState.status === 'error'
      ? audioDetailsRowsState.error
      : null;

  const reportPartnerLabel = useMemo(() => {
    if (selectedPartner === 'all') {
      return 'All Partners';
    }
    return getPartnerDisplayName(selectedPartner);
  }, [selectedPartner]);

  const shouldShowAudioMetricsLoading =
    Boolean(currentAudioSummaryKey) &&
    isAudioSummaryLoading &&
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video'));

  const shouldShowAudioMetricsError =
    Boolean(currentAudioSummaryKey) &&
    audioSummaryError &&
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video'))
      ? audioSummaryError
      : null;

  const handleOpenExportConfirm = (source) => {
    if (selectedPartner === 'all') {
      addToast({
        title: 'Export',
        message: 'Please select a specific partner to generate Metasea/Retailer DB export.',
        type: 'error',
      });
      return;
    }

    const sourceLabel = source === 'metasea' ? 'Metasea' : 'Retailer DB';
    setConfirmDialogState({
      open: true,
      source,
      title: 'Download Confirmation',
      message: `Do you really want to download ${sourceLabel} data for partner ${reportPartnerLabel}? Click Yes to proceed or Cancel to cancel this.`,
    });
  };

  const handleConfirmExport = async () => {
    const source = confirmDialogState.source;
    if (!source) {
      return;
    }

    setExportActionLoading(true);
    try {
      await queueExportReport({
        partner: selectedPartner,
        source,
      });
      addToast({
        title: 'Export Started',
        message: 'Report generation started in background. It will be available in Reports section.',
        type: 'info',
      });
      setConfirmDialogState({ open: false, source: null, title: '', message: '' });
      fetchReportsData();
    } catch (error) {
      addToast({ title: 'Export Failed', message: error?.message || 'Unable to start export job.', type: 'error' });
    } finally {
      setExportActionLoading(false);
    }
  };

  const handleGenerateDifference = async (selectedReportIds) => {
    setExportActionLoading(true);
    try {
      await queueDifferenceReport({ reportIds: selectedReportIds });
      addToast({
        title: 'Difference Job Started',
        message: 'Difference report is being generated in background.',
        type: 'info',
      });
      fetchReportsData();
    } catch (error) {
      addToast({ title: 'Difference Failed', message: error?.message || 'Unable to start difference job.', type: 'error' });
    } finally {
      setExportActionLoading(false);
    }
  };

  const handleDownloadReport = async (report) => {
    const token = window.localStorage.getItem('ddex_auth_token');
    if (!token) {
      addToast({ title: 'Download', message: 'Please login again.', type: 'error' });
      return;
    }

    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(report.id)}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to download report.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = report.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      addToast({ title: 'Download', message: error?.message || 'Download failed.', type: 'error' });
    }
  };

  if (authLoading) {
    return <div className="app-loading-screen">Loading portal...</div>;
  }

  if (!authUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="layout-container">
      <NotificationToasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />

      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        authUser={authUser}
        adminNotificationCount={authUser.role === 'admin' ? Math.max(notificationsState.unreadCount, approvalsState.rows.length) : 0}
        onLogout={handleLogout}
      />

      <main className="main-content">
        <header className="app-header">
          <div className="header-text-container">
            <h1 className="app-title-main">
              {activePage === 'dashboard'
                ? 'Content Delivery Reports Dashboard'
                : activePage === 'audio-reports'
                  ? 'Audio Reports'
                  : activePage === 'video-reports'
                    ? 'Video Reports'
                    : activePage === 'reports'
                      ? 'Reports'
                      : activePage === 'admin'
                        ? 'Admin'
                        : 'Settings'}
            </h1>
            <span className="app-subtitle">
              {activePage === 'dashboard'
                ? 'DDEX REPOSITORY'
                : activePage === 'audio-reports' || activePage === 'video-reports'
                  ? 'DATA EXPORT & ANALYSIS'
                  : activePage === 'reports'
                    ? 'EXPORT REPOSITORY'
                    : activePage === 'admin'
                      ? 'ACCESS CONTROL'
                      : 'PREFERENCES & CONFIGURATION'}
            </span>
          </div>
          <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Theme">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        {activePage === 'dashboard' ? (
          <div className="dashboard-content">
            <FilterBar
              selectedPartner={selectedPartner}
              setSelectedPartner={setSelectedPartner}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              activePage={activePage}
              dashboardMode={dashboardMode}
            />

            <div className="dashboard-toggle-wrapper">
              <div className="dashboard-toggle">
                <button className={`toggle-btn ${dashboardMode === 'combined' ? 'active' : ''}`} onClick={() => setDashboardMode('combined')}>
                  Combined
                </button>
                <button className={`toggle-btn ${dashboardMode === 'audio' ? 'active' : ''}`} onClick={() => setDashboardMode('audio')}>
                  Audio Only
                </button>
                <button className={`toggle-btn ${dashboardMode === 'video' ? 'active' : ''}`} onClick={() => setDashboardMode('video')}>
                  Video Only
                </button>
              </div>
            </div>

            <SummaryCards
              dashboardStats={dashboardStats}
              activeTab={activeTab}
              setActiveTab={() => {}}
              isDashboard={true}
              dashboardMode={dashboardMode}
              liveBreakdown={dashboardMode !== 'video' ? liveBreakdown : null}
              metricsLoading={shouldShowAudioMetricsLoading}
              metricsError={shouldShowAudioMetricsError}
              startDate={startDate}
              endDate={endDate}
            />

            <DashboardCharts dashboardStats={dashboardStats} dashboardMode={dashboardMode} />

            <div className="recent-deliveries-container">
              <h3 className="section-title">Recent Deliveries</h3>
              <div className="table-actions" style={{ justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                <div className="search-bar">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search album, UPC, batch, tracks..."
                    value={dashboardRecentSearchTerm}
                    onChange={(event) => setDashboardRecentSearchTerm(event.target.value)}
                  />
                </div>
              </div>
              <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Album ID</th>
                      <th>Album Name</th>
                      <th>UPC</th>
                      <th>Added On</th>
                      <th>Batch ID</th>
                      <th>Track IDs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isRecentDeliveriesLoading ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>
                          Loading recent deliveries...
                        </td>
                      </tr>
                    ) : recentDeliveriesError ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#b91c1c' }}>
                          {recentDeliveriesError}
                        </td>
                      </tr>
                    ) : dashboardRecentRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>
                          No deliveries found for selected filters.
                        </td>
                      </tr>
                    ) : (
                      dashboardRecentRows.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 500 }}>{item.albumId || '-'}</td>
                          <td>{item.albumName || '-'}</td>
                          <td>{item.upc || '-'}</td>
                          <td>{item.addedOn || '-'}</td>
                          <td>{item.batchId || '-'}</td>
                          <td>
                            <div className="track-ids-cell" title={item.trackIdsCsv || '-'}>
                              {item.trackIdsCsv || '-'}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activePage === 'audio-reports' || activePage === 'video-reports' ? (
          <div className="dashboard-content">
            <FilterBar
              selectedPartner={selectedPartner}
              setSelectedPartner={setSelectedPartner}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              activePage={activePage}
            />

            {activePage === 'audio-reports' ? (
              <div className="report-source-actions">
                <button onClick={() => handleOpenExportConfirm('metasea')}>
                  <Download size={16} /> Download Metasea
                </button>
                <button onClick={() => handleOpenExportConfirm('partnerdb')}>
                  <Download size={16} /> Download Retailer DB
                </button>
              </div>
            ) : null}

            <SummaryCards
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              stats={stats}
              liveBreakdown={activePage === 'audio-reports' ? liveBreakdown : null}
              metricsLoading={activePage === 'audio-reports' ? shouldShowAudioMetricsLoading : false}
              metricsError={activePage === 'audio-reports' ? shouldShowAudioMetricsError : null}
              startDate={startDate}
              endDate={endDate}
            />

            <ContentTable
              activeTab={activeTab}
              filteredContents={tableContents}
              activePage={activePage}
              tableLoading={audioDetailsLoading}
              tableError={audioDetailsError}
              reportPartnerLabel={reportPartnerLabel}
              reportFileNamePrefix={reportPartnerLabel}
            />
          </div>
        ) : activePage === 'reports' ? (
          <ReportsPage
            reports={reportsState.rows}
            jobs={jobsState.rows}
            loading={reportsState.loading || jobsState.loading}
            actionLoading={exportActionLoading}
            onRefresh={fetchReportsData}
            onGenerateDifference={handleGenerateDifference}
            onDownloadReport={handleDownloadReport}
          />
        ) : activePage === 'admin' && authUser.role === 'admin' ? (
          <AdminPage
            rows={approvalsState.rows}
            loading={approvalsState.loading}
            onApprove={handleApproveUser}
            onReject={handleRejectUser}
          />
        ) : (
          <div className="settings-container">
            <div className="settings-card">
              <h2>Theme Preferences</h2>
              <div className="setting-row">
                <div>
                  <span className="setting-label">Dark Mode</span>
                  <p className="setting-desc">Enable or disable the sleek dark theme.</p>
                </div>
                <button className={`toggle-switch ${isDarkMode ? 'active' : ''}`} onClick={() => setIsDarkMode(!isDarkMode)}>
                  <div className="toggle-thumb"></div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmDialogState.open}
        title={confirmDialogState.title}
        message={confirmDialogState.message}
        loading={exportActionLoading}
        onCancel={() => setConfirmDialogState({ open: false, source: null, title: '', message: '' })}
        onConfirm={handleConfirmExport}
      />
    </div>
  );
}

export default App;
