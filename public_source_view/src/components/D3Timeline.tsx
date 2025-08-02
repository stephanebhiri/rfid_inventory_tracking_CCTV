import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface TimelineGroup {
  key: string;
  label: string;
  color: string | null;
}

interface TimelineEvent {
  id: string;
  rfid_tag_id: string;
  text: string;
  start_date: string;
  end_date: string | null;
  section_id: string;
  color: string;
}

interface D3TimelineProps {
  groups: TimelineGroup[];
  events: TimelineEvent[];
  onItemClick?: (event: TimelineEvent) => void;
  width?: number;
  height?: number;
  timeScale?: 'day' | 'week' | 'month' | 'year';
}

const D3Timeline: React.FC<D3TimelineProps> = ({
  groups,
  events,
  onItemClick,
  width = 1200,
  height = 600, // Minimum height, will be expanded based on groups
  timeScale = 'day'
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Throttle adaptive format calculations
  const lastFormatCalculation = useRef<{domain: [Date, Date], result: any}>({
    domain: [new Date(), new Date()],
    result: null
  });

  useEffect(() => {
    if (!svgRef.current || !groups.length || !events.length) return;
    
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Track number of touch points for mobile
    let lastValidY = 0; // Store last Y position for when we block vertical pan

    setIsLoading(true);
    
    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    // Set up dimensions and margins
    const margin = { top: 80, right: 40, bottom: 60, left: 220 };
    const innerWidth = width - margin.left - margin.right;
    const groupHeight = 220; // Height for 8 lanes with 25px spacing + margin

    // Calculate total height needed for all groups (will be updated after calculating lanes)
    let totalHeight = Math.max(height, groups.length * groupHeight + margin.top + margin.bottom + 50);
    
    // Create main SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', totalHeight);

    // Create main group for content - start below fixed header
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top + 60})`);

    // Clip path will be created after calculating total height

    // Parse dates
    const parseTime = d3.timeParse('%Y-%m-%d %H:%M:%S');
    const parsedEvents = events.map(event => {
      const startDate = parseTime(event.start_date) || new Date(event.start_date);
      const endDate = event.end_date ? (parseTime(event.end_date) || new Date(event.end_date)) : null;
      
      if (!parseTime(event.start_date)) {
        console.warn('Failed to parse date with d3.timeParse:', event.start_date, '- using Date constructor');
      }
      
      return {
        ...event,
        startDate,
        endDate
      };
    });

    // Create time scale based on timeScale prop
    const now = new Date();
    let timeWindow;
    
    switch (timeScale) {
      case 'day':
        timeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
        break;
      case 'week':
        timeWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
        break;
      case 'month':
        timeWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
        break;
      case 'year':
        timeWindow = 365 * 24 * 60 * 60 * 1000; // 365 days
        break;
      default:
        timeWindow = 24 * 60 * 60 * 1000;
    }
    
    const startTime = new Date(now.getTime() - timeWindow);
    
    const xScale = d3.scaleTime()
      .domain([startTime, now])
      .range([0, innerWidth]);

    // Adaptive time formats based on visible time range (with throttling)
    const getAdaptiveTimeFormats = (domain: [Date, Date]) => {
      const [start, end] = domain;
      const durationMs = end.getTime() - start.getTime();
      
      // Throttle: Skip recalculation if duration change < 10%
      const lastDuration = lastFormatCalculation.current.domain[1].getTime() - lastFormatCalculation.current.domain[0].getTime();
      if (lastFormatCalculation.current.result && Math.abs(durationMs - lastDuration) / lastDuration < 0.1) {
        return lastFormatCalculation.current.result;
      }
      
      const durationHours = durationMs / (1000 * 60 * 60);
      const durationDays = durationHours / 24;
      const durationWeeks = durationDays / 7;
      const durationMonths = durationDays / 30;
      
      const durationMinutes = durationHours * 60;
      const durationSeconds = durationMinutes * 60;
      
      console.log('Adaptive zoom - Duration:', { durationSeconds, durationMinutes, durationHours, durationDays, durationWeeks, durationMonths });
      
      let result;
      
      if (durationMinutes <= 2) {
        // Ultra-ultra close zoom: secondes précises
        result = {
          tickFormat: d3.timeFormat('%H:%M:%S'),
          majorTickFormat: d3.timeFormat('%d/%m %H:%M:%S'),
          tickCount: Math.max(8, Math.min(30, Math.floor(durationSeconds / 10))),
          level: 'seconds'
        };
      } else if (durationMinutes <= 30) {
        // Ultra close zoom: minutes fines
        result = {
          tickFormat: d3.timeFormat('%H:%M:%S'),
          majorTickFormat: d3.timeFormat('%d/%m %H:%M'),
          tickCount: Math.max(10, Math.min(30, Math.floor(durationMinutes / 2))),
          level: 'seconds'
        };
      } else if (durationMinutes <= 120) {
        // Ultra close zoom: minutes and hours
        result = {
          tickFormat: d3.timeFormat('%H:%M'),
          majorTickFormat: d3.timeFormat('%d/%m %H:%M'),
          tickCount: Math.max(8, Math.min(24, Math.floor(durationMinutes / 5))),
          level: 'minutes'
        };
      } else if (durationHours <= 168) { // 7 jours
        // Close zoom: hours and date
        result = {
          tickFormat: d3.timeFormat('%H:%M'),
          majorTickFormat: d3.timeFormat('%d/%m'),
          tickCount: Math.max(8, Math.min(36, Math.floor(durationHours / 3))),
          level: 'hours'
        };
      } else if (durationDays <= 30) {
        // Medium zoom: days and weeks  
        result = {
          tickFormat: d3.timeFormat('%d/%m'),
          majorTickFormat: d3.timeFormat('%B %Y'),
          tickCount: Math.max(10, Math.min(30, Math.floor(durationDays))),
          level: 'days'
        };
      } else if (durationWeeks <= 24) {
        // Wide zoom: weeks and months
        result = {
          tickFormat: d3.timeFormat('%d/%m'),
          majorTickFormat: d3.timeFormat('%B %Y'),
          tickCount: Math.max(6, Math.min(24, Math.floor(durationWeeks))),
          level: 'weeks'
        };
      } else if (durationMonths <= 48) {
        // Very wide zoom: months and years
        result = {
          tickFormat: d3.timeFormat('%m/%Y'),
          majorTickFormat: d3.timeFormat('%Y'),
          tickCount: Math.max(8, Math.min(48, Math.floor(durationMonths))),
          level: 'months'
        };
      } else {
        // Ultra wide zoom: years
        result = {
          tickFormat: d3.timeFormat('%Y'),
          majorTickFormat: d3.timeFormat('%Y'),
          tickCount: Math.max(6, Math.min(20, Math.floor(durationMonths / 12))),
          level: 'years'
        };
      }
      
      // Cache the result
      lastFormatCalculation.current = { domain, result };
      return result;
    };

    // Get initial adaptive formats
    const initialFormats = getAdaptiveTimeFormats([startTime, now]);
    let tickFormat = initialFormats.tickFormat;
    let majorTickFormat = initialFormats.majorTickFormat;
    let tickCount = initialFormats.tickCount;
    
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(tickFormat as any)
      .ticks(tickCount);
    
    // Create a major axis for date information (especially useful for 24h view)
    const xAxisMajor = d3.axisTop(xScale)
      .tickFormat(majorTickFormat as any)
      .ticks(Math.max(4, Math.floor(tickCount / 3))); // Fewer major ticks

    // X-axis will be positioned after calculating group heights
      

    // Filter events to only show those in the current time window
    const recentEvents = parsedEvents.filter(event => 
      event.startDate >= startTime && event.startDate <= now
    );
    
    console.log('D3Timeline debug:', {
      totalEvents: events.length,
      parsedEvents: parsedEvents.length,
      recentEvents: recentEvents.length,
      startTime,
      now,
      timeScale
    });
    
    // Count unique groups including virtual ones from events
    const eventGroupIds = new Set(recentEvents.map(e => e.section_id.toString()));
    const virtualGroups = Array.from(eventGroupIds).filter(gId => !groups.some(g => g.key === gId));
    
    // Rendering will be done after lane assignment

    // Create zoomable content group FIRST (before backgrounds)
    const zoomGroup = g.append('g')
      .attr('class', 'zoom-group')
      .attr('clip-path', 'url(#timeline-clip)');
    
    // Create fixed group for labels that don't move with vertical scroll
    const fixedLabelsGroup = svg.append('g')
      .attr('class', 'fixed-labels')
      .attr('transform', `translate(0, ${margin.top + 60})`);
    
    // Create fixed header zone for time axes
    svg.append('rect')
      .attr('class', 'timeline-header-bg')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', 60)
      .attr('fill', '#ffffff')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-width', 1);
    
    // Create fixed group for time axes in header zone
    const fixedAxesGroup = svg.append('g')
      .attr('class', 'fixed-axes')
      .attr('transform', `translate(${margin.left}, 50)`);

    // Dedicated lane assignment - each item gets its own permanent lane
    const eventsWithPositions: any[] = [];
    
    // Create a stable mapping of RFID tags to lanes within each group
    const rfidToLane: { [groupId: string]: { [rfidId: string]: number } } = {};
    const groupLaneCounters: { [groupId: string]: number } = {};
    
    // First pass: assign lanes to unique RFID tags
    const uniqueRfidTags = new Set();
    recentEvents.forEach(event => {
      const groupId = event.section_id.toString();
      const rfidId = event.rfid_tag_id;
      const uniqueKey = `${groupId}-${rfidId}`;
      
      if (!uniqueRfidTags.has(uniqueKey)) {
        uniqueRfidTags.add(uniqueKey);
        
        // Check if this group exists in the groups list  
        // const groupExists = groups.some(g => g.key === groupId);
        // if (!groupExists) {
        //   console.warn(`⚠️ Event in Group ${groupId} but group not in timeline groups list!`);
        // } // Disabled for performance
        
        if (!rfidToLane[groupId]) {
          rfidToLane[groupId] = {};
          groupLaneCounters[groupId] = 0;
        }
        
        if (!rfidToLane[groupId][rfidId]) {
          rfidToLane[groupId][rfidId] = groupLaneCounters[groupId];
          // console.log(`🏁 Lane assigned: Group ${groupId}, RFID ${rfidId} -> Lane ${groupLaneCounters[groupId]}`); // Disabled for performance
          groupLaneCounters[groupId]++;
        }
      }
    });
    
    // Calculate adaptive group heights based on actual lane counts
    const groupHeights: { [groupId: string]: number } = {};
    const baseHeightPerLane = 30; // Height per lane
    const minGroupHeight = 60; // Minimum height per group
    
    // Calculate heights for real groups
    groups.forEach(group => {
      const groupId = group.key;
      const lanesInGroup = groupLaneCounters[groupId] || 1;
      groupHeights[groupId] = Math.max(minGroupHeight, lanesInGroup * baseHeightPerLane + 20);
    });
    
    // Calculate heights for virtual groups
    virtualGroups.forEach(groupId => {
      const lanesInGroup = groupLaneCounters[groupId] || 1;
      groupHeights[groupId] = Math.max(minGroupHeight, lanesInGroup * baseHeightPerLane + 20);
    });
    
    // Calculate cumulative Y positions for groups
    const groupYPositions: { [groupId: string]: number } = {};
    let cumulativeY = 0;
    
    // Real groups first
    groups.forEach(group => {
      groupYPositions[group.key] = cumulativeY;
      cumulativeY += groupHeights[group.key];
    });
    
    // Virtual groups after
    virtualGroups.forEach(groupId => {
      groupYPositions[groupId] = cumulativeY;
      cumulativeY += groupHeights[groupId];
    });
    
    // Sort events by start time for consistent lane assignment
    const sortedEvents = recentEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    // Second pass: assign positions using the stable lane mapping
    sortedEvents.forEach(event => {
      const groupId = event.section_id.toString();
      const rfidId = event.rfid_tag_id;
      
      // Use adaptive group positioning
      const baseY = groupYPositions[groupId] || 0;
      
      // Get the pre-assigned lane for this RFID tag
      const assignedLane = rfidToLane[groupId] && rfidToLane[groupId][rfidId] !== undefined 
        ? rfidToLane[groupId][rfidId] 
        : 0; // Fallback to lane 0 if somehow not found
      
      // Calculate Y position based on assigned lane with adaptive spacing
      const laneY = baseY + 10 + (assignedLane * baseHeightPerLane);
      
      eventsWithPositions.push({
        ...event,
        yPosition: laneY,
        assignedLane: assignedLane,
        rfidId: rfidId
      });
      
      // console.log(`📍 Event positioned: Group ${groupId}, "${event.text}" (${rfidId}) -> Lane ${assignedLane}`); // Disabled for performance
    });

    // Update total height and SVG
    totalHeight = Math.max(height, cumulativeY + margin.top + margin.bottom + 50);
    svg.attr('height', totalHeight);
    
    // Create clip path with correct height
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'timeline-clip')
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', cumulativeY);
    
    // Create adaptive group backgrounds and labels
    const allGroupData = [
      ...groups.map(g => ({ ...g, isVirtual: false })),
      ...virtualGroups.map(id => ({ key: id, label: `Virtual Group ${id}`, isVirtual: true }))
    ];
    
    // Add group background rectangles INSIDE zoomGroup (behind items)
    zoomGroup.selectAll('.group-background')
      .data(allGroupData)
      .enter()
      .append('rect')
      .attr('class', 'group-background')
      .attr('x', 0)
      .attr('y', d => groupYPositions[d.key])
      .attr('width', innerWidth)
      .attr('height', d => groupHeights[d.key] - 2)
      .attr('fill', (d, i) => i % 2 === 0 ? '#f8fafc' : '#ffffff');
    
    // Add group labels to fixed group (will follow vertical scroll)
    fixedLabelsGroup
      .selectAll('.group-label')
      .data(allGroupData)
      .enter()
      .append('text')
      .attr('class', 'group-label')
      .attr('x', 10) // Left side
      .attr('y', d => groupYPositions[d.key] + groupHeights[d.key]/2)
      .attr('dy', '0.35em')
      .text(d => d.label)
      .style('font-size', '14px')
      .style('font-weight', '600') // Bold for group names
      .style('fill', d => d.isVirtual ? '#e53e3e' : '#1a202c');
      
    // Add vertical grid lines for time reference
    g.append('g')
      .attr('class', 'grid-lines')
      .selectAll('.grid-line')
      .data(xScale.ticks(tickCount))
      .enter()
      .append('line')
      .attr('class', 'grid-line')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', -5)
      .attr('y2', cumulativeY + 5)
      .attr('stroke', '#e2e8f0')
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.7);

    // Add major X-axis at the top (with date/time info) - In fixed header
    fixedAxesGroup.append('g')
      .attr('class', 'x-axis-major')
      .attr('transform', `translate(0, -25)`)
      .call(xAxisMajor.tickSizeOuter(0));
    
    // Add minor X-axis (time only for 24h view) - In fixed header
    fixedAxesGroup.append('g')
      .attr('class', 'x-axis-minor')
      .attr('transform', `translate(0, -10)`)
      .call(xAxis.tickSizeOuter(0));

    // Create timeline items
    console.log('Creating items with positions:', eventsWithPositions.length);
    const items = zoomGroup.selectAll('.timeline-item')
      .data(eventsWithPositions)
      .enter()
      .append('g')
      .attr('class', 'timeline-item')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        if (onItemClick) onItemClick(d);
      });

    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-timeline-tooltip')
      .style('position', 'absolute')
      .style('padding', '8px 12px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);

    // Add range items (rectangles)
    const rangeItems = items.filter(d => d.endDate !== null);
    console.log('Range items (with end date):', rangeItems.size());
    
    rangeItems.append('rect')
      .attr('x', d => xScale(d.startDate))
      .attr('y', d => d.yPosition)
      .attr('width', d => {
        const width = Math.max(xScale(d.endDate!) - xScale(d.startDate), 3);
        if (d.id === eventsWithPositions[0]?.id) {
          console.log('First rect dimensions:', {
            x: xScale(d.startDate),
            y: d.yPosition,
            width,
            color: d.color,
            startDate: d.startDate,
            endDate: d.endDate,
            xScaleStart: xScale(d.startDate),
            xScaleEnd: xScale(d.endDate),
            domain: xScale.domain(),
            range: xScale.range()
          });
        }
        return width;
      })
      .attr('height', 20)
      .attr('rx', 2)
      .attr('fill', d => d.color)
      .on('mouseover', function(event, d) {
        const duration = d.endDate ? 
          `${Math.round((d.endDate.getTime() - d.startDate.getTime()) / (1000 * 60))} min` : 
          'En cours';
        
        tooltip.style('opacity', 1);
        tooltip.html(`
          <strong>${d.text}</strong><br/>
          Début: ${d.startDate.toLocaleString('fr-FR')}<br/>
          Fin: ${d.endDate?.toLocaleString('fr-FR') || 'En cours'}<br/>
          Durée: ${duration}
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('opacity', 0);
      });

    // Add point items (circles for ongoing events)
    const pointItems = items.filter(d => d.endDate === null);
    console.log('Point items (no end date):', pointItems.size());
    
    pointItems.append('circle')
      .attr('cx', d => xScale(d.startDate))
      .attr('cy', d => d.yPosition + 10) // Center in the lane
      .attr('r', 12)
      .attr('fill', d => d.color)
      .on('mouseover', function(event, d) {
        tooltip.style('opacity', 1);
        tooltip.html(`
          <strong>${d.text}</strong><br/>
          Début: ${d.startDate.toLocaleString('fr-FR')}<br/>
          <span className="timeline-current-indicator">● En cours</span>
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        tooltip.style('opacity', 0);
      });

    // Add lane labels that span the full width
    // Collect unique lanes and their labels - group by RFID tag, not by event
    const rfidLanes: { [key: string]: { text: string, y: number, rfidId: string } } = {};
    
    eventsWithPositions.forEach(event => {
      const laneKey = `${event.section_id}-${event.assignedLane}`;
      const rfidId = event.rfid_tag_id;
      
      if (!rfidLanes[laneKey]) {
        rfidLanes[laneKey] = {
          text: event.text, // Use item designation
          y: event.yPosition,
          rfidId: rfidId
        };
      } else {
        // Verify it's the same RFID tag (should be, but let's check)
        if (rfidLanes[laneKey].rfidId !== rfidId) {
          console.warn(`🚨 REAL conflict! Lane ${laneKey}: RFID "${rfidLanes[laneKey].rfidId}" vs "${rfidId}"`);
          rfidLanes[laneKey].text = `${rfidLanes[laneKey].text} / ${event.text}`;
        }
        // Same RFID tag, same lane - that's expected, no need to change the label
      }
    });
    
    // Convert to the expected format
    const laneLabels: { [key: string]: { text: string, y: number } } = {};
    Object.entries(rfidLanes).forEach(([key, value]) => {
      laneLabels[key] = { text: value.text, y: value.y };
    });
    
    // Create lane background and labels
    Object.entries(laneLabels).forEach(([laneKey, lane]) => {
      
      // Simplified lane background 
      zoomGroup.append('rect')
        .attr('x', 0)
        .attr('y', lane.y - 2)
        .attr('width', innerWidth)
        .attr('height', 20)
        .attr('fill', 'rgba(255,255,255,0.1)')
        .style('pointer-events', 'none');
      
      // Lane label text with group info - FIXED position, décalé à droite
      fixedLabelsGroup.append('text')
        .attr('x', 120) // Décalé à droite pour éviter superposition avec labels groupes
        .attr('y', lane.y + 10)
        .attr('dy', '0.35em')
        .text(`${lane.text}`) // Sans le préfixe [G...] pour plus de clarté
        .style('font-size', '10px')
        .style('font-weight', '400')
        .style('fill', '#4a5568')
        .style('pointer-events', 'none');
    });

    // Add current time indicator
    const currentTime = new Date();
    const currentTimeLine = g.append('line')
      .attr('class', 'current-time-line')
      .attr('x1', xScale(currentTime))
      .attr('x2', xScale(currentTime))
      .attr('y1', 0)
      .attr('y2', cumulativeY)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 1); // Simplified - no dashed lines or opacity

    // Add zoom level indicator
    g.append('text')
      .attr('class', 'zoom-indicator')
      .attr('x', innerWidth - 10)
      .attr('y', -45)
      .attr('text-anchor', 'end')
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#4a5568')
      .style('background', 'rgba(255,255,255,0.8)')
      .text(`🔍 ${initialFormats.level}`);

    // Add zoom and pan behavior with mouse-centered zooming and vertical scrolling
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.01, 2000]) // Zoom ultra-extrême : 100x plus puissant
      .extent([[0, 0], [width, height]]) // Define pan boundaries
      .filter((event) => {
        // Allow all events except right-click
        return !event.ctrlKey && !event.button;
      })
      .touchable(true)
      .on('zoom', (event) => {
        const { transform, sourceEvent } = event;
        
        // Update x scale with zoom transform
        const newXScale = transform.rescaleX(xScale);
        
        // Check if this is a touch event
        const isTouchEvent = sourceEvent && sourceEvent.type && sourceEvent.type.startsWith('touch');
        const touchCount = isTouchEvent && sourceEvent.touches ? sourceEvent.touches.length : 0;
        
        if (isMobile && isTouchEvent) {
          console.log('Mobile touch event:', sourceEvent.type, 'touches:', touchCount);
        }
        
        // Apply vertical pan (Y translation) to the main group with bounds
        let clampedY = 0;
        
        // On mobile: allow vertical pan only with 1 finger (no pinch zoom)
        // On desktop: always allow vertical pan
        const allowVerticalPan = !isMobile || !isTouchEvent || touchCount <= 1;
        
        if (allowVerticalPan) {
          const maxVerticalPan = Math.max(0, cumulativeY - height + margin.top + margin.bottom);
          clampedY = Math.max(-maxVerticalPan, Math.min(0, transform.y));
          lastValidY = clampedY; // Store valid Y for when we need to block
        } else {
          // When 2+ fingers are detected on mobile, use last valid Y position
          clampedY = lastValidY;
        }
        
        // Apply vertical translation to the main group - keep header space
        g.attr('transform', `translate(${margin.left}, ${margin.top + 60 + clampedY})`);
        
        // Update group labels position to follow the scroll
        fixedLabelsGroup.selectAll('.group-label')
          .attr('y', function() {
            const d = d3.select(this).datum() as any;
            return groupYPositions[d.key] + groupHeights[d.key]/2 + clampedY;
          });
          
        // Update item labels position to follow the scroll
        fixedLabelsGroup.selectAll('text:not(.group-label)')
          .attr('y', (d: any, i: number) => {
            // Get original Y position from laneLabels
            const originalY = Object.values(laneLabels)[i]?.y || 0;
            return originalY + clampedY + 10;
          });
        
        // Calculate new visible time domain for adaptive formatting
        const newDomain = newXScale.domain();
        const adaptiveFormats = getAdaptiveTimeFormats(newDomain);
        
        console.log('Zoom level changed to:', adaptiveFormats.level);
        
        // Update zoom level indicator
        g.select('.zoom-indicator')
          .text(`🔍 ${adaptiveFormats.level}`);
        
        // Create new axes with adaptive formats
        const newXAxis = d3.axisBottom(newXScale)
          .tickFormat(adaptiveFormats.tickFormat as any)
          .ticks(adaptiveFormats.tickCount);
        
        const newXAxisMajor = d3.axisTop(newXScale)
          .tickFormat(adaptiveFormats.majorTickFormat as any)
          .ticks(Math.max(3, Math.floor(adaptiveFormats.tickCount / 3)));
        
        // Update axes with new adaptive formats - using fixed axes group
        fixedAxesGroup.select('.x-axis-major').call(newXAxisMajor as any);
        fixedAxesGroup.select('.x-axis-minor').call(newXAxis as any);
        fixedAxesGroup.select('.x-axis-bottom').call(newXAxis as any);
        
        // Update grid lines with new adaptive ticks
        const newTicks = newXScale.ticks(adaptiveFormats.tickCount);
        
        // Remove old grid lines and create new ones
        g.selectAll('.grid-line').remove();
        g.selectAll('.grid-line')
          .data(newTicks)
          .enter()
          .append('line')
          .attr('class', 'grid-line')
          .attr('x1', d => newXScale(d))
          .attr('x2', d => newXScale(d))
          .attr('y1', -5)
          .attr('y2', cumulativeY + 5)
          .attr('stroke', '#e2e8f0')
          .attr('stroke-width', 0.5)
          .attr('stroke-dasharray', '2,2')
          .attr('opacity', 0.7);
        
        // Update items positions using the new scale
        zoomGroup.selectAll('.timeline-item rect')
          .attr('x', (d: any) => newXScale(d.startDate))
          .attr('width', (d: any) => d.endDate ? Math.max(newXScale(d.endDate) - newXScale(d.startDate), 2) : 0);
        
        zoomGroup.selectAll('.timeline-item circle')
          .attr('cx', (d: any) => newXScale(d.startDate));
        
        zoomGroup.selectAll('.timeline-item text')
          .attr('x', (d: any) => d.endDate !== null ? 
            newXScale(d.startDate) + (newXScale(d.endDate!) - newXScale(d.startDate)) / 2 : 
            newXScale(d.startDate));

        // Update current time line
        currentTimeLine
          .attr('x1', newXScale(currentTime))
          .attr('x2', newXScale(currentTime));
      });

    // Apply zoom to SVG with mouse-centered behavior and vertical scrolling
    svg.call(zoom)
      .on('wheel.zoom', function(event) {
        // Prevent default scrolling
        event.preventDefault();
        event.stopPropagation();
        
        const currentTransform = d3.zoomTransform(this);
        
        if (event.shiftKey) {
          // Shift + wheel = vertical scroll
          const deltaY = event.deltaY > 0 ? 30 : -30;
          const maxVerticalPan = Math.max(0, cumulativeY - height + margin.top + margin.bottom);
          const newY = Math.max(-maxVerticalPan, Math.min(0, currentTransform.y + deltaY));
          
          const newTransform = d3.zoomIdentity
            .translate(currentTransform.x, newY)
            .scale(currentTransform.k);
            
          d3.select(this).call(zoom.transform, newTransform);
        } else {
          // Normal wheel = horizontal zoom centered on mouse
          const [mouseX] = d3.pointer(event, this);
          const centerX = mouseX - margin.left;
          
          // Apply zoom centered on mouse position (reduced sensitivity)
          const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
          
          // Calculate new transform to center zoom on mouse
          const newK = Math.max(0.01, Math.min(2000, currentTransform.k * scaleFactor));
          const newX = centerX - (centerX - currentTransform.x) * (newK / currentTransform.k);
          
          const newTransform = d3.zoomIdentity
            .translate(newX, currentTransform.y)
            .scale(newK);
          
          // Apply the new transform
          d3.select(this).call(zoom.transform, newTransform);
        }
      });

    setIsLoading(false);

    // Cleanup function
    return () => {
      tooltip.remove();
    };

  }, [groups, events, onItemClick, width, height, timeScale]);

  if (isLoading) {
    return (
      <div className="d3-timeline-loading">
        <div className="spinner">Rendering timeline...</div>
      </div>
    );
  }

  return (
    <div className="d3-timeline-container">
      <svg ref={svgRef} className="d3-timeline-svg" />
    </div>
  );
};

export default D3Timeline;