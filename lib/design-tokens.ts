export const designTokens = {
  colors: {
    primary: '#6366F1',
    primaryLight: '#A5B4FC',
    bg: '#F8FAFC',
    card: '#FFFFFF',
    border: '#E5E7EB',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    marketingBgLight: '#F7F8FE',
    marketingSurfaceLight: 'rgba(255,255,255,0.88)',
    marketingGlassLight: 'rgba(255,255,255,0.68)',
    marketingTintLight: 'rgba(99,102,241,0.10)',
    marketingBgDark: '#050814',
    marketingSurfaceDark: 'rgba(10,18,34,0.84)',
    marketingGlassDark: 'rgba(7,11,22,0.74)',
    marketingTintDark: 'rgba(99,102,241,0.22)',
    shellBgLight: '#F6F8FC',
    shellBgDark: '#0F172A',
    shellSurfaceLight: '#FFFFFF',
    shellSurfaceDark: '#111827',
  },
  radius: {
    card: '16px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
} as const;

export type DesignTokens = typeof designTokens;
