import React, { useRef, useState, useEffect } from 'react';
import Draggable from 'react-draggable';
import SensorNode from './SensorNode';
import { useResizeObserver } from '../hooks/useLayout';

const DraggableSensor = ({ s, status, isEditing, onSensorStop, containerWidth, containerHeight }) => {
    const nodeRef = useRef(null);

    // Check if position is responsive (0-1) or absolute (>1)
    const isPercentage = s.position?.x <= 1 && s.position?.y <= 1;

    // Convert to pixels for rendering
    // If width/height is 0 (initial render), default to 0 to avoid jumping
    const x = isPercentage ? (s.position?.x || 0.05) * containerWidth : (s.position?.x || 10);
    const y = isPercentage ? (s.position?.y || 0.05) * containerHeight : (s.position?.y || 10);

    const handleStop = (e, data) => {
        // Calculate percentage based on current container size
        // Clamp between 0 and 1 to stay in bounds
        const pctX = Math.min(Math.max(data.x / containerWidth, 0), 1);
        const pctY = Math.min(Math.max(data.y / containerHeight, 0), 1);
        onSensorStop(s.id, pctX, pctY);
    };

    if (containerWidth === 0) return null; // Wait for measurement

    return (
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            disabled={!isEditing}
            position={{ x, y }} // Controlled position
            onStop={handleStop}
        >
            <div
                ref={nodeRef}
                className={`
                    absolute left-0 top-0 
                    cursor-${isEditing ? 'grab active:cursor-grabbing' : 'default'} 
                    ${isEditing ? 'z-50 hover:scale-110 transition-transform' : ''}
                `}
                style={{ width: 'max-content' }}
            >
                <SensorNode
                    label={s.label}
                    state={status.state}
                    type={s.type}
                    metadata={s.metadata}
                />
            </div>
        </Draggable>
    );
};

const Room = ({ name, className, isEditing, onSensorStop, sensors, sensorStatuses }) => {
    const roomRef = useRef(null);
    const { width, height } = useResizeObserver(roomRef);

    return (
        <div
            ref={roomRef}
            className={`
            bg-white/[0.03] border border-white/5 
            flex flex-col relative overflow-hidden group 
            min-h-[200px] h-full
            transition-colors hover:bg-white/[0.05]
            ${className} 
            ${isEditing ? 'border-dashed border-blue-500/50' : ''}
        `}
        >
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 py-1 block point-events-none select-none z-0">
                {name}
            </span>

            {/* Container for sensors - Use standard div context */}
            <div className="flex-1 w-full h-full relative z-10">
                {sensors && sensors.map(s => {
                    const status = sensorStatuses[s.id] || { state: 'closed' };
                    return (
                        <DraggableSensor
                            key={s.id}
                            s={s}
                            status={status}
                            isEditing={isEditing}
                            onSensorStop={onSensorStop}
                            containerWidth={width}
                            containerHeight={height} // Subtract header height approx? No, wrapper is Flex
                        />
                    );
                })}
            </div>
        </div>
    );
};

const FloorPlan = ({ config, sensors, isEditing, onLayoutSave }) => {
    const { rooms = [], sensors: sensorConfig = [] } = config;

    if (!rooms || rooms.length === 0) return <div className="text-center p-10 opacity-50">NO ROOMS DETECTED</div>;

    const handleSensorDrag = (sensorId, x, y) => {
        onLayoutSave({ sensors: { [sensorId]: { x, y } } });
    };

    return (
        <div className="w-full h-full overflow-y-auto p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 h-full content-start">
                {rooms.map(room => (
                    <Room
                        key={room.id}
                        id={room.id}
                        name={room.name}
                        isEditing={isEditing}
                        onSensorStop={handleSensorDrag}
                        sensors={sensorConfig.filter(s => s.roomId === room.id)}
                        sensorStatuses={sensors}
                    />
                ))}
            </div>
        </div>
    );
};

export default FloorPlan;
