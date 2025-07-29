declare module 'react-calendar-timeline' {
  import * as React from 'react';

  export interface TimelineGroup {
    id: number | string;
    title: React.ReactNode;
    rightTitle?: React.ReactNode;
  }

  export interface TimelineItem {
    id: number | string;
    group: number | string;
    title?: React.ReactNode;
    start_time: number;
    end_time: number;
    canMove?: boolean;
    canResize?: boolean | 'left' | 'right' | 'both';
    canChangeGroup?: boolean;
    className?: string;
    itemProps?: object;
  }

  export interface TimelineContext {
    timelineWidth: number;
    visibleTimeStart: number;
    visibleTimeEnd: number;
    canvasTimeStart: number;
    canvasTimeEnd: number;
  }

  export interface TimelineProps {
    groups: TimelineGroup[];
    items: TimelineItem[];
    defaultTimeStart?: number;
    defaultTimeEnd?: number;
    visibleTimeStart?: number;
    visibleTimeEnd?: number;
    selected?: Array<number | string>;
    sidebarContent?: React.ReactNode;
    sidebarWidth?: number;
    rightSidebarContent?: React.ReactNode;
    rightSidebarWidth?: number;
    dragSnap?: number;
    minResizeWidth?: number;
    lineHeight?: number;
    itemHeightRatio?: number;
    minZoom?: number;
    maxZoom?: number;
    canMove?: boolean;
    canChangeGroup?: boolean;
    canResize?: boolean | 'left' | 'right' | 'both';
    canSelect?: boolean;
    stackItems?: boolean;
    traditionalZoom?: boolean;
    itemTouchSendsClick?: boolean;
    timeSteps?: object;
    onItemMove?: (itemId: string | number, dragTime: number, newGroupOrder: number) => void;
    onItemResize?: (itemId: string | number, time: number, edge: 'left' | 'right') => void;
    onItemSelect?: (itemId: string | number, e: any, time: number) => void;
    onItemClick?: (itemId: string | number, e: any, time: number) => void;
    onItemDoubleClick?: (itemId: string | number, e: any, time: number) => void;
    onItemContextMenu?: (itemId: string | number, e: any, time: number) => void;
    onCanvasClick?: (groupId: string | number, time: number, e: any) => void;
    onCanvasDoubleClick?: (groupId: string | number, time: number, e: any) => void;
    onCanvasContextMenu?: (groupId: string | number, time: number, e: any) => void;
    onZoom?: (timelineContext: TimelineContext) => void;
    onTimeChange?: (visibleTimeStart: number, visibleTimeEnd: number, updateScrollCanvas: (start: number, end: number) => void) => void;
    itemRenderer?: (props: any) => React.ReactNode;
    groupRenderer?: (props: any) => React.ReactNode;
    buffer?: number;
    horizontalLineClassNamesForGroup?: (group: TimelineGroup) => string[];
  }

  const Timeline: React.FC<TimelineProps>;
  export default Timeline;
}