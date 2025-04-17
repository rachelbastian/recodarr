import React from 'react';

interface GaugeWidgetProps {
    value: number | null;
    label: string;
    colorScheme?: 'blue' | 'green' | 'purple' | 'orange';
}

const GaugeWidget: React.FC<GaugeWidgetProps> = ({ 
    value, 
    label,
    colorScheme = 'blue'
}) => {
    // Define color schemes for different gauges
    const colorSchemes = {
        blue: {
            primary: '#3b82f6',
            glow: '#60a5fa30',
            background: '#1e3a8a20',
            text: '#93c5fd'
        },
        green: {
            primary: '#22c55e',
            glow: '#4ade8030',
            background: '#14532d20',
            text: '#86efac'
        },
        purple: {
            primary: '#a855f7',
            glow: '#c084fc30',
            background: '#581c8720',
            text: '#d8b4fe'
        },
        orange: {
            primary: '#f97316',
            glow: '#fb923c30',
            background: '#7c2d1220',
            text: '#fdba74'
        }
    };

    const colors = colorSchemes[colorScheme];
    const percentage = value ?? 0;
    const radius = 85; // Slightly larger radius
    const strokeWidth = 10; // Slightly thinner stroke
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * Math.PI; // Only half circle
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    // Calculate viewBox to position half circle correctly
    const viewBoxSize = radius * 2;

    return (
        <div className="relative flex flex-col items-center justify-center p-4 rounded-xl bg-black/40 border border-gray-800">
            {/* Gauge Title */}
            <h3 className="mb-6 text-sm font-medium text-gray-400">{label}</h3>

            {/* SVG Gauge */}
            <div className="relative">
                <svg
                    height={radius * 1.2} // Adjust height for half circle
                    width={viewBoxSize}
                    viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                    className="transform rotate-180" // Rotate to make it curve upward
                >
                    {/* Background arc */}
                    <path
                        d={`M ${strokeWidth/2},${radius} A ${normalizedRadius},${normalizedRadius} 0 0 0 ${viewBoxSize - strokeWidth/2},${radius}`}
                        stroke={colors.background}
                        fill="none"
                        strokeWidth={strokeWidth}
                    />
                    
                    {/* Gauge progress with focused glow */}
                    <path
                        d={`M ${strokeWidth/2},${radius} A ${normalizedRadius},${normalizedRadius} 0 0 0 ${viewBoxSize - strokeWidth/2},${radius}`}
                        stroke={colors.primary}
                        fill="none"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ 
                            strokeDashoffset: -strokeDashoffset,
                            filter: `
                                drop-shadow(0 0 1px ${colors.glow})
                                drop-shadow(0 0 2px ${colors.glow})
                                drop-shadow(0 0 4px ${colors.glow})
                            `,
                            transition: 'stroke-dashoffset 0.3s ease'
                        }}
                        strokeLinecap="round"
                    />

                    {/* Add minimal tick marks */}
                    {[...Array(11)].map((_, i) => {
                        const rotation = i * (180 / 10); // Spread across 180 degrees
                        const isLongTick = i % 2 === 0;
                        const tickAngle = (rotation + 180) * (Math.PI / 180); // Offset by 180 degrees
                        const x1 = radius + (normalizedRadius - (isLongTick ? 15 : 10)) * Math.cos(tickAngle);
                        const y1 = radius + (normalizedRadius - (isLongTick ? 15 : 10)) * Math.sin(tickAngle);
                        const x2 = radius + (normalizedRadius - strokeWidth) * Math.cos(tickAngle);
                        const y2 = radius + (normalizedRadius - strokeWidth) * Math.sin(tickAngle);
                        
                        return (
                            <line
                                key={i}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke={colors.background}
                                strokeWidth={2}
                                opacity={isLongTick ? 0.6 : 0.3}
                            />
                        );
                    })}
                </svg>

                {/* Center display */}
                <div 
                    className="absolute inset-x-0 -bottom-2 flex flex-col items-center justify-center"
                    style={{ color: colors.text }}
                >
                    <span className="text-3xl font-bold tracking-tighter">
                        {value === null ? 'N/A' : `${value.toFixed(1)}%`}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default GaugeWidget; 