import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

const SummaryCards = ({
  activeTab,
  setActiveTab,
  stats,
  dashboardStats,
  isDashboard,
  dashboardMode,
  liveBreakdown,
  metricsLoading = false,
  metricsError = null,
  startDate,
  endDate,
  liveActions = null,
}) => {
  const numberFormatter = new Intl.NumberFormat('en-IN');

  const getAggregated = (key) => {
    if (!isDashboard || !dashboardStats) return 0;
    if (dashboardMode === 'audio') return dashboardStats.audio[key];
    if (dashboardMode === 'video') return dashboardStats.video[key];
    return dashboardStats.audio[key] + dashboardStats.video[key];
  };

  const getBreakdown = (key) => {
    if (!isDashboard || !dashboardStats || dashboardMode !== 'combined') return null;
    return (
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
        Audio: {numberFormatter.format(dashboardStats.audio[key])} &nbsp;|&nbsp; Video: {numberFormatter.format(dashboardStats.video[key])}
      </span>
    );
  };

  const renderLoadingValue = () => (
    <div className="metric-loading">
      <span className="metric-loading-dot"></span>
      <span className="metric-loading-dot"></span>
      <span className="metric-loading-dot"></span>
      <span className="metric-loading-text">Loading</span>
    </div>
  );

  const totalLiveCount = isDashboard ? getAggregated('totalLive') : (stats?.totalLive ?? 0);
  const deliveredCount = isDashboard
    ? getAggregated('deliveredThisMonth')
    : (stats?.deliveredThisMonth ?? 0);
  const takenDownCount = isDashboard
    ? getAggregated('takenDownThisMonth')
    : (stats?.takenDownThisMonth ?? 0);

  const liveMetaseaCount = Number(liveBreakdown?.metasea) || 0;
  const livePartnerDbCount = Number(liveBreakdown?.partnerDb) || 0;
  const liveShareTotal = liveMetaseaCount + livePartnerDbCount;
  const metaseaPct = liveShareTotal > 0
    ? Math.round((liveMetaseaCount / liveShareTotal) * 100)
    : 0;
  const partnerDbPct = liveShareTotal > 0 ? 100 - metaseaPct : 0;

  const formatCount = (value) => numberFormatter.format(Number(value) || 0);

  const dateRangeLabel = startDate && endDate
    ? `${startDate} to ${endDate}`
    : 'Selected period';

  const getLiveSubtitle = () => {
    if (metricsLoading) {
      return 'Loading metrics from databases...';
    }
    if (metricsError) {
      return metricsError;
    }
    if (liveBreakdown?.isLiveData) {
      return liveActions ? '' : 'Source-wise live count';
    }
    if (isDashboard) {
      return getBreakdown('totalLive');
    }
    return 'Overall cumulative count';
  };

  const renderLiveValue = () => {
    if (metricsLoading) {
      return renderLoadingValue();
    }
    const displayValue = liveBreakdown?.isLiveData
      ? livePartnerDbCount
      : totalLiveCount;
    return <span className="metric-value-large">{formatCount(displayValue)}</span>;
  };

  const renderValue = (key) => {
    if (metricsLoading) {
      return renderLoadingValue();
    }
    const value = key === 'deliveredThisMonth' ? deliveredCount : takenDownCount;
    return <span className="metric-value-large">{formatCount(value)}</span>;
  };

  const renderPeriodMiniChart = ({ label, count, strokeColor, gradientId }) => {
    if (metricsLoading || metricsError) {
      return null;
    }

    const buildSeries = (count) => {
      const normalizedCount = Number(count) || 0;
      return [
        { index: 0, value: 0 },
        { index: 1, value: Math.round(normalizedCount * 0.28) },
        { index: 2, value: Math.round(normalizedCount * 0.58) },
        { index: 3, value: Math.round(normalizedCount * 0.82) },
        { index: 4, value: normalizedCount },
      ];
    };

    const series = buildSeries(count);

    return (
      <div className="period-mini-chart period-mini-chart--line">
        <div className="period-sparkline-block">
          <span className="period-sparkline-label">{label}</span>
          <div className="period-sparkline-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={strokeColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const renderLiveMiniChart = () => {
    if (metricsLoading || metricsError || !liveBreakdown?.isLiveData) {
      return null;
    }

    const buildSeries = (count) => {
      const normalizedCount = Number(count) || 0;
      return [
        { index: 0, value: 0 },
        { index: 1, value: Math.round(normalizedCount * 0.28) },
        { index: 2, value: Math.round(normalizedCount * 0.58) },
        { index: 3, value: Math.round(normalizedCount * 0.82) },
        { index: 4, value: normalizedCount },
      ];
    };

    const metaseaSeries = buildSeries(liveMetaseaCount);
    const partnerSeries = buildSeries(livePartnerDbCount);

    return (
      <div className="period-mini-chart period-mini-chart--line">
        <div className="period-sparkline">
          <div className="period-sparkline-block">
            <span className="period-sparkline-label">
              Metasea ({metaseaPct}%)
            </span>
            <div className="period-sparkline-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metaseaSeries}>
                  <defs>
                    <linearGradient id="sparkMetaseaLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#sparkMetaseaLive)"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="source-caption-value">{formatCount(liveMetaseaCount)}</span>
          </div>

          <div className="period-sparkline-block">
            <span className="period-sparkline-label">
              Partner DB ({partnerDbPct}%)
            </span>
            <div className="period-sparkline-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={partnerSeries}>
                  <defs>
                    <linearGradient id="sparkPartnerLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#sparkPartnerLive)"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <span className="source-caption-value">{formatCount(livePartnerDbCount)}</span>
          </div>
        </div>
      </div>
    );
  };

  const cards = [
    {
      id: 'totalLive',
      title: 'Total Content Live',
      value: renderLiveValue(),
      icon: <Activity size={24} />,
      subtitle: getLiveSubtitle(),
      kind: 'live',
      footerChart: renderLiveMiniChart(),
      liveActions,
    },
    {
      id: 'deliveredThisMonth',
      title: 'Delivered in Period',
      value: renderValue('deliveredThisMonth'),
      icon: <ArrowUpRight size={24} />,
      subtitle: metricsLoading
        ? 'Query in progress for selected date range'
        : (isDashboard ? getBreakdown('deliveredThisMonth') : `Derived from ${dateRangeLabel}`),
      kind: 'delivered',
      footerChart: renderPeriodMiniChart({
        label: 'Delivered Trend',
        count: deliveredCount,
        strokeColor: '#10b981',
        gradientId: 'sparkDeliveredOnly',
      }),
    },
    {
      id: 'takenDownThisMonth',
      title: 'Taken Down in Period',
      value: renderValue('takenDownThisMonth'),
      icon: <ArrowDownRight size={24} />,
      subtitle: metricsLoading
        ? 'Query in progress for selected date range'
        : (isDashboard ? getBreakdown('takenDownThisMonth') : `Derived from ${dateRangeLabel}`),
      kind: 'taken',
      footerChart: renderPeriodMiniChart({
        label: 'Taken Down Trend',
        count: takenDownCount,
        strokeColor: '#ef4444',
        gradientId: 'sparkTakenOnly',
      }),
    },
  ];

  return (
    <div className="summary-cards-container">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`summary-card summary-card--${card.kind} ${!isDashboard && activeTab === card.id ? 'active' : ''}`}
          onClick={() => !isDashboard && setActiveTab(card.id)}
          style={isDashboard ? { cursor: 'default', transform: 'none', borderColor: 'var(--border-color)' } : {}}
        >
          <div className="card-header">
            <h3 className="card-title">{card.title}</h3>
            <div className="card-icon">{card.icon}</div>
          </div>
          <div className="card-value">{card.value}</div>
          {card.footerChart}
          {card.id === 'totalLive' && card.liveActions ? (
            <div className="card-live-actions">{card.liveActions}</div>
          ) : null}
          <div className="card-subtitle">{card.subtitle}</div>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
