import React from 'react';

interface GaugeWidgetProps {
    value: number | null;
    label: string;
    colorScheme?: 'blue' | 'green' | 'purple' | 'orange';
}

const GaugeWidget: React.FC<GaugeWidgetProps> = ({ 
    value, 
    label,
    colorScheme = 'purple'
}) => {
    // Define color schemes with light/dark mode variables
    const colorSchemes = {
        blue: {
            primary: 'var(--chart-1)',
            secondary: 'hsl(220, 70%, 50%, 0.2)',
            glow: 'hsl(220, 70%, 50%, 0.15)',
            text: 'hsl(220, 70%, 60%)'
        },
        green: {
            primary: 'var(--chart-2)',
            secondary: 'hsl(160, 60%, 45%, 0.2)', 
            glow: 'hsl(160, 60%, 45%, 0.15)',
            text: 'hsl(160, 60%, 55%)'
        },
        purple: {
            primary: 'var(--primary)',
            secondary: 'hsl(244, 86%, 56%, 0.2)',
            glow: 'hsl(244, 86%, 56%, 0.15)',
            text: 'var(--primary)'
        },
        orange: {
            primary: 'var(--chart-4)',
            secondary: 'hsl(340, 75%, 55%, 0.2)',
            glow: 'hsl(340, 75%, 55%, 0.15)',
            text: 'hsl(340, 75%, 65%)'
        }
    };

    const colors = colorSchemes[colorScheme];
    const percentage = value ?? 0;
    const radius = 80;
    const strokeWidth = 12;
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const gradientId = `gradient-${colorScheme}`;

    return (
        <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="relative flex items-center justify-center">
                {/* Define gradient */}
                <svg width="0" height="0">
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style={{ stopColor: colors.primary, stopOpacity: 1 }} />
                            <stop offset="100%" style={{ stopColor: colors.text, stopOpacity: 0.8 }} />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Main gauge circle */}
                <svg
                    height={radius * 2}
                    width={radius * 2}
                    className="transform -rotate-90"
                >
                    {/* Background circle */}
                    <circle
                        stroke={colors.secondary}
                        fill="none"
                        strokeWidth={strokeWidth}
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        style={{
                            filter: `drop-shadow(0 0 6px ${colors.glow})`
                        }}
                    />
                    
                    {/* Progress circle */}
                    <circle
                        stroke={`url(#${gradientId})`}
                        fill="none"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        r={normalizedRadius}
                        cx={radius}
                        cy={radius}
                        style={{
                            strokeDasharray: circumference + ' ' + circumference,
                            strokeDashoffset: strokeDashoffset,
                            transition: 'stroke-dashoffset 1s ease-in-out',
                            filter: `drop-shadow(0 0 6px ${colors.glow})`
                        }}
                    />
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-bold" style={{ color: colors.primary }}>
                        {value === null ? 'N/A' : `${value.toFixed(1)}%`}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground mt-1">
                        {label}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default GaugeWidget; 