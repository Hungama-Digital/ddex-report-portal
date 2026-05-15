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
import SearchPage from './components/SearchPage';
import ConfirmDialog from './components/ConfirmDialog';
import NotificationToasts from './components/NotificationToasts';
import { Sun, Moon, Search, Download, Bell, Menu, User, ChevronUp } from 'lucide-react';
import {
  approvePendingUser,
  deleteReportById,
  fetchAudioDetailsRows,
  fetchAudioPartnerPeriodMetrics,
  fetchAudioPartnerSummary,
  fetchAudioPartnerTotalContentLive,
  fetchAudioRecentDeliveries,
  fetchAdminUsers,
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
  revokeAdminUser,
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

const EMPTY_AUDIO_PERIOD_METRICS = {
  queryKey: null,
  status: 'idle',
  error: null,
  deliveredInPeriod: 0,
  takenDownInPeriod: 0,
};

const NOTIFICATION_POLL_INTERVAL_MS = 60000;
const NOTIFICATION_TOAST_QUIET_PERIOD_MS = 45000;
const AUDIO_DETAILS_FETCH_LIMIT = 500000;

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

  useEffect(() => {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setEndDate(startDate);
    }
  }, [startDate, endDate, setEndDate]);

  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [audioSummary, setAudioSummary] = useState(EMPTY_AUDIO_SUMMARY);
  const [audioPeriodMetrics, setAudioPeriodMetrics] = useState(EMPTY_AUDIO_PERIOD_METRICS);
  const [recentDeliveriesState, setRecentDeliveriesState] = useState(EMPTY_RECENT_DELIVERIES);
  const [audioDetailsRowsState, setAudioDetailsRowsState] = useState(EMPTY_AUDIO_DETAILS_ROWS);
  const [dashboardRecentSearchTerm, setDashboardRecentSearchTerm] = useState('');

  const [reportsState, setReportsState] = useState({ loading: false, rows: [] });
  const [jobsState, setJobsState] = useState({ loading: false, rows: [] });
  const [approvalsState, setApprovalsState] = useState({ loading: false, rows: [] });
  const [adminUsersState, setAdminUsersState] = useState({ loading: false, rows: [] });

  const [notificationsState, setNotificationsState] = useState({ unreadCount: 0, rows: [] });
  const seenNotificationRef = useRef(new Set());
  const notificationsBootstrappedRef = useRef(false);
  const notificationToastReadyAtRef = useRef(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const notificationButtonRef = useRef(null);
  const notificationTrayRef = useRef(null);
  const [toasts, setToasts] = useState([]);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

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
        notificationToastReadyAtRef.current = Date.now() + NOTIFICATION_TOAST_QUIET_PERIOD_MS;
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
    notificationsBootstrappedRef.current = false;
    seenNotificationRef.current = new Set();
    notificationToastReadyAtRef.current = Date.now() + NOTIFICATION_TOAST_QUIET_PERIOD_MS;
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
    setAdminUsersState({ loading: false, rows: [] });
    notificationsBootstrappedRef.current = false;
    seenNotificationRef.current = new Set();
    notificationToastReadyAtRef.current = 0;
  };

  useEffect(() => {
    if (!authUser) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetchNotifications({ includeRead: true, limit: 120, days: 7 });
        if (cancelled) {
          return;
        }

        const rows = Array.isArray(response.notifications) ? response.notifications : [];
        setNotificationsState({ unreadCount: Number(response.unreadCount) || 0, rows });

        if (!notificationsBootstrappedRef.current) {
          seenNotificationRef.current = new Set(rows.map((item) => item.id));
          notificationsBootstrappedRef.current = true;
          return;
        }

        for (const item of rows) {
          if (seenNotificationRef.current.has(item.id)) {
            continue;
          }
          seenNotificationRef.current.add(item.id);

          if (Date.now() < notificationToastReadyAtRef.current) {
            continue;
          }

          if (item.type === 'report_ready') {
            addToast({ title: 'Report Ready', message: item.message, type: 'success' });
          } else if (item.type === 'report_started') {
            addToast({ title: 'Report Started', message: item.message, type: 'info' });
          } else if (item.type === 'report_failed') {
            addToast({ title: 'Report Failed', message: item.message, type: 'error' });
          } else if (item.type === 'approval_request' && authUser.role === 'admin') {
            addToast({ title: 'Approval Request', message: item.message, type: 'info' });
          } else if ((item.type === 'approval_granted' || item.type === 'approval_rejected') && authUser.role === 'admin') {
            addToast({ title: 'User Approval Update', message: item.message, type: 'info' });
          }
        }
      } catch (_error) {
        // skip transient poll errors
      }
    };

    poll();
    const interval = setInterval(poll, NOTIFICATION_POLL_INTERVAL_MS);
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
    setAdminUsersState((previous) => ({ ...previous, loading: true }));
    try {
      const [approvalsOutput, usersOutput] = await Promise.all([
        fetchPendingApprovals(),
        fetchAdminUsers(),
      ]);
      setApprovalsState({ loading: false, rows: approvalsOutput.rows || [] });
      setAdminUsersState({ loading: false, rows: usersOutput.rows || [] });
    } catch (error) {
      setApprovalsState({ loading: false, rows: [] });
      setAdminUsersState({ loading: false, rows: [] });
      addToast({ title: 'Admin', message: error?.message || 'Unable to fetch admin data.', type: 'error' });
    }
  }, [authUser, addToast]);

  const [showBackToTop, setShowBackToTop] = useState(false);
  const mainContentRef = useRef(null);

  const handleScroll = (e) => {
    if (e.target.scrollTop > 400) {
      setShowBackToTop(true);
    } else {
      setShowBackToTop(false);
    }
  };

  const scrollToTop = () => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

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

  const handleRevokeUser = async (userId) => {
    if (!window.confirm('Revoke this user access now? They will be logged out immediately.')) {
      return;
    }
    try {
      await revokeAdminUser(userId);
      addToast({ title: 'Admin', message: 'User access revoked successfully.', type: 'success' });
      fetchApprovalsData();
    } catch (error) {
      addToast({ title: 'Admin', message: error?.message || 'Failed to revoke access.', type: 'error' });
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

  const currentAudioLiveKey = useMemo(() => {
    if (!shouldLoadAudioMetrics) {
      return null;
    }
    return `${selectedPartner}|audio-live`;
  }, [shouldLoadAudioMetrics, selectedPartner]);

  const currentAudioPeriodKey = useMemo(() => {
    if (!shouldLoadAudioMetrics || !hasValidDateRange) {
      return null;
    }
    return `${selectedPartner}|${startDate}|${endDate}|audio-period`;
  }, [shouldLoadAudioMetrics, hasValidDateRange, selectedPartner, startDate, endDate]);

  const currentRecentDeliveriesKey = useMemo(() => {
    if (!recentDeliveriesPartner) {
      return null;
    }

    return `${recentDeliveriesPartner}|${startDate}|${endDate}|20`;
  }, [recentDeliveriesPartner, startDate, endDate]);

  const isAudioSummaryLoading =
    Boolean(currentAudioLiveKey) &&
    audioSummary.queryKey === currentAudioLiveKey &&
    audioSummary.status === 'loading';

  const isAudioSummaryReady =
    audioSummary.queryKey === currentAudioLiveKey &&
    audioSummary.status === 'success';

  const audioSummaryError =
    audioSummary.queryKey === currentAudioLiveKey && audioSummary.status === 'error'
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
    if (!authUser || !currentAudioLiveKey) {
      return;
    }

    const abortController = new AbortController();
    setAudioSummary((previous) => ({
      ...previous,
      queryKey: currentAudioLiveKey,
      status: 'loading',
      error: null,
    }));

    const livePromise = isAllAudioPartnersSelected
      ? fetchAudioPartnerTotalContentLive({
          partner: 'all',
          signal: abortController.signal,
        })
      : fetchAudioPartnerTotalContentLive({
          partner: selectedPartner,
          signal: abortController.signal,
        });

    livePromise
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        const summary = response || EMPTY_AUDIO_SUMMARY;
        setAudioSummary({
          queryKey: currentAudioLiveKey,
          status: 'success',
          error: null,
          metasea: Number(summary.metasea) || 0,
          partnerDb: Number(summary.partnerDb) || 0,
          total: Number(summary.total) || 0,
          deliveredInPeriod: 0,
          takenDownInPeriod: 0,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setAudioSummary({
          ...EMPTY_AUDIO_SUMMARY,
          queryKey: currentAudioLiveKey,
          status: 'error',
          error: error?.message || 'Unable to load live counts.',
        });
      });

    return () => {
      abortController.abort();
    };
  }, [currentAudioLiveKey, selectedPartner, isAllAudioPartnersSelected, authUser]);

  // Phase 2: Delivered + TakeDown — fires only after Phase 1 (Total Live) is shown.
  // All partner queries run in parallel via the dedicated /period-metrics endpoint.
  useEffect(() => {
    if (!authUser || !currentAudioPeriodKey || !isAudioSummaryReady) {
      return;
    }

    const abortController = new AbortController();
    setAudioPeriodMetrics({
      queryKey: currentAudioPeriodKey,
      status: 'loading',
      error: null,
      deliveredInPeriod: 0,
      takenDownInPeriod: 0,
    });

    const periodPromise = isAllAudioPartnersSelected
      ? (async () => {
          const results = await Promise.all(
            audioPartners.map((partner) =>
              fetchAudioPartnerPeriodMetrics({
                partner: partner.id,
                startDate,
                endDate,
                signal: abortController.signal,
              }).catch(() => null),
            ),
          );

          const successCount = results.filter(Boolean).length;
          if (!successCount) {
            throw new Error('Unable to fetch period metrics for any partner.');
          }

          return results.reduce(
            (acc, r) => ({
              deliveredInPeriod: acc.deliveredInPeriod + (Number(r?.deliveredInPeriod) || 0),
              takenDownInPeriod: acc.takenDownInPeriod + (Number(r?.takenDownInPeriod) || 0),
            }),
            { deliveredInPeriod: 0, takenDownInPeriod: 0 },
          );
        })()
      : fetchAudioPartnerPeriodMetrics({
          partner: selectedPartner,
          startDate,
          endDate,
          signal: abortController.signal,
        });

    periodPromise
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }
        const summary = response || {};
        setAudioPeriodMetrics({
          queryKey: currentAudioPeriodKey,
          status: 'success',
          error: null,
          deliveredInPeriod: Number(summary.deliveredInPeriod) || 0,
          takenDownInPeriod: Number(summary.takenDownInPeriod) || 0,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }
        setAudioPeriodMetrics({
          queryKey: currentAudioPeriodKey,
          status: 'error',
          error: error?.message || 'Unable to load date-range metrics.',
          deliveredInPeriod: 0,
          takenDownInPeriod: 0,
        });
      });

    return () => {
      abortController.abort();
    };
  }, [
    currentAudioPeriodKey,
    selectedPartner,
    isAllAudioPartnersSelected,
    startDate,
    endDate,
    isAudioSummaryReady,
    authUser,
  ]);

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

  const shouldUseDbMetricsForAudio = Boolean(currentAudioLiveKey) && isAudioSummaryReady;
  const isAudioPeriodReady =
    Boolean(currentAudioPeriodKey) &&
    audioPeriodMetrics.queryKey === currentAudioPeriodKey &&
    audioPeriodMetrics.status === 'success';
  const isAudioPeriodLoading =
    Boolean(currentAudioPeriodKey) &&
    audioPeriodMetrics.queryKey === currentAudioPeriodKey &&
    audioPeriodMetrics.status === 'loading';
  const audioPeriodError =
    Boolean(currentAudioPeriodKey) &&
    audioPeriodMetrics.queryKey === currentAudioPeriodKey &&
    audioPeriodMetrics.status === 'error'
      ? audioPeriodMetrics.error
      : null;

  useEffect(() => {
    if (!authUser || !currentRecentDeliveriesKey || !recentDeliveriesPartner || !isAudioSummaryReady) {
      return;
    }

    const allPartnerPeriodReady =
      selectedPartner !== 'all' ||
      !hasValidDateRange ||
      (Boolean(currentAudioPeriodKey) &&
        audioPeriodMetrics.queryKey === currentAudioPeriodKey &&
        audioPeriodMetrics.status === 'success');

    if (!allPartnerPeriodReady) {
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
  }, [
    currentRecentDeliveriesKey,
    recentDeliveriesPartner,
    startDate,
    endDate,
    hasValidDateRange,
    isAudioSummaryReady,
    selectedPartner,
    currentAudioPeriodKey,
    audioPeriodMetrics.queryKey,
    audioPeriodMetrics.status,
    authUser,
  ]);


  const currentAudioDetailsKey = useMemo(() => {
    if (activePage !== 'audio-reports' || !isAudioSelectionSupported) {
      return null;
    }
    return `${selectedPartner}|${activeTab}|${startDate}|${endDate}|audio-details`;
  }, [activePage, isAudioSelectionSupported, selectedPartner, activeTab, startDate, endDate]);

  const detailsLimit = useMemo(() => {
    return AUDIO_DETAILS_FETCH_LIMIT;
  }, []);

  useEffect(() => {
    if (!authUser || !currentAudioDetailsKey || !isAudioSummaryReady) {
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
  }, [activeTab, selectedPartner, startDate, endDate, currentAudioDetailsKey, hasValidDateRange, detailsLimit, isAudioSummaryReady, authUser]);

  const stats = {
    totalLive: shouldUseDbMetricsForAudio ? audioSummary.total : 0,
    deliveredThisMonth: isAudioPeriodReady ? audioPeriodMetrics.deliveredInPeriod : 0,
    takenDownThisMonth: isAudioPeriodReady ? audioPeriodMetrics.takenDownInPeriod : 0,
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
        deliveredThisMonth: isAudioPeriodReady ? audioPeriodMetrics.deliveredInPeriod : 0,
        takenDownThisMonth: isAudioPeriodReady ? audioPeriodMetrics.takenDownInPeriod : 0,
      },
    };
  }, [
    shouldUseDbMetricsForAudio,
    audioSummary.total,
    isAudioPeriodReady,
    audioPeriodMetrics.deliveredInPeriod,
    audioPeriodMetrics.takenDownInPeriod,
  ]);

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
    Boolean(currentAudioLiveKey) &&
    isAudioSummaryLoading &&
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video'));

  const shouldShowAudioMetricsError =
    Boolean(currentAudioLiveKey) &&
    audioSummaryError &&
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video'))
      ? audioSummaryError
      : null;

  const shouldShowAudioPeriodLoading =
    Boolean(currentAudioPeriodKey) &&
    isAudioPeriodLoading &&
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video'));

  const shouldShowAudioPeriodError =
    Boolean(currentAudioPeriodKey) &&
    audioPeriodError &&
    (activePage === 'audio-reports' || (activePage === 'dashboard' && dashboardMode !== 'video'))
      ? audioPeriodError
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

  const handleDeleteReport = async (report) => {
    if (!report?.id) {
      return;
    }
    if (!window.confirm(`Delete report "${report.file_name}" from server? This action cannot be undone.`)) {
      return;
    }

    setExportActionLoading(true);
    try {
      await deleteReportById(report.id);
      addToast({ title: 'Reports', message: 'Report deleted successfully.', type: 'success' });
      fetchReportsData();
    } catch (error) {
      addToast({ title: 'Reports', message: error?.message || 'Unable to delete report.', type: 'error' });
    } finally {
      setExportActionLoading(false);
    }
  };


  const reportNotificationCount = useMemo(
    () =>
      (notificationsState.rows || []).filter(
        (item) => !item.readAt && (item.type === 'report_ready' || item.type === 'report_failed'),
      ).length,
    [notificationsState.rows],
  );

  const notificationRows = useMemo(() => notificationsState.rows || [], [notificationsState.rows]);

  const markAllNotificationsRead = async () => {
    const unread = notificationRows.filter((item) => !item.readAt);
    if (!unread.length) {
      return;
    }

    await Promise.allSettled(unread.map((item) => markNotificationAsRead(item.id)));
    setNotificationsState((previous) => ({
      unreadCount: 0,
      rows: previous.rows.map((item) =>
        item.readAt ? item : { ...item, readAt: new Date().toISOString() },
      ),
    }));
  };

  const toggleNotifications = async () => {
    const next = !isNotificationOpen;
    setIsNotificationOpen(next);
    if (next) {
      await markAllNotificationsRead();
    }
  };

  useEffect(() => {
    if (!isNotificationOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const trayEl = notificationTrayRef.current;
      const buttonEl = notificationButtonRef.current;
      const target = event.target;
      if (trayEl?.contains(target) || buttonEl?.contains(target)) {
        return;
      }
      setIsNotificationOpen(false);
    };

    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isNotificationOpen]);

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
        reportsNotificationCount={notificationsState.unreadCount}
        onLogout={handleLogout}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <main className="main-content" ref={mainContentRef} onScroll={handleScroll}>
        <header className="app-header">
          <button className="mobile-menu-btn" onClick={toggleMobileMenu}>
            <Menu size={24} />
          </button>
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
                        : activePage === 'search'
                          ? 'Search Contents'
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
                      : activePage === 'search'
                        ? 'REPOSITORY LOOKUP'
                        : 'PREFERENCES & CONFIGURATION'}
            </span>
          </div>
          <div className="header-actions">
            {authUser && (
              <div className="header-user-profile">
                <div className="user-avatar-mini">
                  <User size={16} />
                </div>
                <div className="user-info-mini">
                  <span className="user-name-mini">{authUser.username}</span>
                  <span className="user-role-mini">{authUser.role}</span>
                </div>
              </div>
            )}
            <button
              className="header-notify-btn"
              ref={notificationButtonRef}
              onClick={toggleNotifications}
              title="Notifications"
            >
              <Bell size={18} />
              {notificationsState.unreadCount > 0 ? (
                <span className="header-notify-badge">{notificationsState.unreadCount}</span>
              ) : null}
            </button>
            <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Theme">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {isNotificationOpen ? (
          <div className="notification-popover" ref={notificationTrayRef}>
            <div className="notification-popover-header">
              <h4>Notifications</h4>
              <span>Last 7 days</span>
            </div>
            <div className="notification-popover-list">
              {notificationRows.length === 0 ? (
                <div className="notification-empty">No notifications available.</div>
              ) : (
                notificationRows.map((item) => (
                  <div key={item.id} className={`notification-item ${item.readAt ? 'read' : 'unread'}`}>
                    <span className={`notification-type-pill notification-type-pill--${item.type || 'general'}`}>
                      {String(item.type || 'notification')
                        .replaceAll('_', ' ')
                        .replace(/\b\w/g, (char) => char.toUpperCase())}
                    </span>
                    <p className="notification-message">{item.message}</p>
                    <span className="notification-time">
                      {item.createdAt || '-'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

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
              setActiveTab={setActiveTab}
              isDashboard={true}
              dashboardMode={dashboardMode}
              liveBreakdown={dashboardMode !== 'video' ? liveBreakdown : null}
              metricsLoading={shouldShowAudioMetricsLoading}
              metricsError={shouldShowAudioMetricsError}
              periodLoading={shouldShowAudioPeriodLoading}
              periodError={shouldShowAudioPeriodError}
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

            <SummaryCards
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              stats={stats}
              liveBreakdown={activePage === 'audio-reports' ? liveBreakdown : null}
              metricsLoading={activePage === 'audio-reports' ? shouldShowAudioMetricsLoading : false}
              metricsError={activePage === 'audio-reports' ? shouldShowAudioMetricsError : null}
              periodLoading={activePage === 'audio-reports' ? shouldShowAudioPeriodLoading : false}
              periodError={activePage === 'audio-reports' ? shouldShowAudioPeriodError : null}
              startDate={startDate}
              endDate={endDate}
              liveActions={
                activePage === 'audio-reports'
                  ? (
                      <div className="report-source-actions report-source-actions--inside">
                        <button onClick={() => handleOpenExportConfirm('metasea')}>
                          <Download size={15} /> Download Metasea
                        </button>
                        <button onClick={() => handleOpenExportConfirm('partnerdb')}>
                          <Download size={15} /> Download Retailer DB
                        </button>
                      </div>
                    )
                  : null
              }
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
            authUser={authUser}
            loading={reportsState.loading || jobsState.loading}
            actionLoading={exportActionLoading}
            onRefresh={fetchReportsData}
            onGenerateDifference={handleGenerateDifference}
            onDownloadReport={handleDownloadReport}
            onDeleteReport={handleDeleteReport}
          />
        ) : activePage === 'admin' && authUser.role === 'admin' ? (
          <AdminPage
            rows={approvalsState.rows}
            loading={approvalsState.loading || adminUsersState.loading}
            activeUsers={adminUsersState.rows}
            onApprove={handleApproveUser}
            onReject={handleRejectUser}
            onRevoke={handleRevokeUser}
          />
        ) : activePage === 'search' ? (
          <SearchPage addToast={addToast} />
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

        {showBackToTop && (
          <button className="back-to-top" onClick={scrollToTop} title="Back to Top">
            <ChevronUp size={24} />
          </button>
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
