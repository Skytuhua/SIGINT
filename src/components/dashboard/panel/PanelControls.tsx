"use client";

import IconButton from "../controls/IconButton";
import DenseSelect from "../controls/DenseSelect";

interface PanelControlsProps {
  viewMode?: string;
  viewModes?: string[];
  onViewModeChange?: (mode: string) => void;
  onFilter?: () => void;
  onRefresh?: () => void;
  onPin?: () => void;
  onExpand?: () => void;
  onOverflow?: () => void;
  loading?: boolean;
  refreshText?: string;
  refreshLoadingText?: string;
}

export default function PanelControls({
  viewMode,
  viewModes,
  onViewModeChange,
  onFilter,
  onRefresh,
  onPin,
  onExpand,
  onOverflow,
  loading = false,
  refreshText = "REFRESH",
  refreshLoadingText = "LOADING",
}: PanelControlsProps) {
  const hasAnyAction =
    Boolean(onFilter) ||
    Boolean(onRefresh) ||
    Boolean(onPin) ||
    Boolean(onExpand) ||
    Boolean(onOverflow) ||
    Boolean(viewModes && viewMode && onViewModeChange);

  if (!hasAnyAction) {
    return null;
  }

  return (
    <div className="wv-panel-controls" aria-label="panel controls">
      {viewModes && viewMode && onViewModeChange ? (
        <DenseSelect
          value={viewMode}
          onChange={(value) => onViewModeChange(value)}
          options={viewModes.map((mode) => ({ label: mode.toUpperCase(), value: mode }))}
          ariaLabel="View mode"
        />
      ) : null}
      {onFilter ? <IconButton label="Filter data" text="FILTER" onClick={onFilter} /> : null}
      {onRefresh ? (
        <IconButton
          label="Refresh panel data"
          text={loading ? refreshLoadingText : refreshText}
          onClick={onRefresh}
        />
      ) : null}
      {onPin ? <IconButton label="Pin panel" text="PIN" onClick={onPin} /> : null}
      {onExpand ? <IconButton label="Expand panel" text="EXPAND" onClick={onExpand} /> : null}
      {onOverflow ? <IconButton label="Panel menu" text="MENU" onClick={onOverflow} /> : null}
    </div>
  );
}

