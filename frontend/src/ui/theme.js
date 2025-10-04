export const palette = {
  canvas: '#030a1c',
  surface: '#0a152a',
  surfaceRaised: '#101f3c',
  surfaceMuted: '#16294d',
  border: '#1f345a',
  borderStrong: '#2a4776',
  overlay: '#030a1c',
  accent: '#5b81ff',
  accentHover: '#769bff',
  accentText: '#05122d',
  textPrimary: '#e5edff',
  textSecondary: '#becbf2',
  textMuted: '#8fa4d6',
  textHint: '#7288bb'
};

export const colorTokens = {
  canvasBg: `bg-[${palette.canvas}]`,
  canvasText: `text-[${palette.textPrimary}]`,
  surfaceBg: `bg-[${palette.surface}]`,
  surfaceRaisedBg: `bg-[${palette.surfaceRaised}]`,
  surfaceMutedBg: `bg-[${palette.surfaceMuted}]`,
  surfaceTintBg: `bg-[${palette.surface}]/80`,
  border: `border-[${palette.border}]`,
  borderStrong: `border-[${palette.borderStrong}]`,
  overlayBg: `bg-[${palette.overlay}]/80`,
  accentBg: `bg-[${palette.accent}]`,
  accentHoverBg: `hover:bg-[${palette.accentHover}]`,
  accentBorder: `border-[${palette.accent}]`,
  accentText: `text-[${palette.accentText}]`,
  accentSoftBg: `bg-[${palette.accent}]/20`,
  textPrimary: `text-[${palette.textPrimary}]`,
  textSecondary: `text-[${palette.textSecondary}]`,
  textMuted: `text-[${palette.textMuted}]`,
  textHint: `text-[${palette.textHint}]`,
  link: `text-[${palette.accent}]`,
  linkHover: `hover:text-[${palette.accentHover}]`,
  ringAccent: `focus-visible:ring-[${palette.accent}]`,
  ringOffset: `focus-visible:ring-offset-[${palette.canvas}]`,
  inputRing: `focus:ring-[${palette.accent}]`
};

export const layout = {
  appShell: `flex min-h-screen flex-col ${colorTokens.canvasBg} ${colorTokens.canvasText}`,
  main: 'flex-1',
  page: 'mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8',
  header: 'flex flex-wrap items-center justify-between gap-4',
  sectionHeader: 'flex flex-wrap items-center justify-between gap-3',
  card: `rounded-2xl border ${colorTokens.border} ${colorTokens.surfaceRaisedBg} p-6 shadow-xl shadow-[#020817]/40`,
  cardActions: 'flex flex-wrap items-center gap-3',
  grid: 'grid gap-4 sm:grid-cols-2',
  tableWrapper: `overflow-x-auto rounded-2xl border ${colorTokens.border} ${colorTokens.surfaceRaisedBg} shadow-sm shadow-[#020817]/20`,
  navBar: `flex flex-wrap items-center gap-3 border-b ${colorTokens.border} ${colorTokens.surfaceMutedBg} px-6 py-3`,
  statusBar: `flex flex-wrap items-center gap-4 ${colorTokens.surfaceMutedBg} px-6 py-3 text-xs ${colorTokens.textSecondary}`,
  conversation: `flex min-h-[520px] flex-1 flex-col overflow-hidden`
};

export const button = {
  base: `inline-flex items-center justify-center rounded-lg border ${colorTokens.border} ${colorTokens.surfaceMutedBg} px-4 py-2 text-sm font-medium ${colorTokens.textPrimary} transition hover:bg-[${palette.surfaceRaised}] focus:outline-none focus-visible:ring-2 ${colorTokens.ringAccent} focus-visible:ring-offset-2 ${colorTokens.ringOffset} disabled:cursor-not-allowed disabled:opacity-60`,
  primary: `inline-flex items-center justify-center rounded-lg border ${colorTokens.accentBorder} ${colorTokens.accentBg} px-4 py-2 text-sm font-semibold ${colorTokens.accentText} transition ${colorTokens.accentHoverBg} focus:outline-none focus-visible:ring-2 ${colorTokens.ringAccent} focus-visible:ring-offset-2 ${colorTokens.ringOffset} disabled:cursor-not-allowed disabled:opacity-60`,
  muted: `inline-flex items-center justify-center rounded-lg border ${colorTokens.border} ${colorTokens.surfaceBg} px-4 py-2 text-sm font-medium ${colorTokens.textSecondary} transition hover:bg-[${palette.surfaceMuted}] focus:outline-none focus-visible:ring-2 ${colorTokens.ringAccent} focus-visible:ring-offset-2 ${colorTokens.ringOffset} disabled:cursor-not-allowed disabled:opacity-60`,
  nav: `inline-flex items-center justify-center rounded-md border ${colorTokens.border} px-4 py-2 text-sm font-medium ${colorTokens.textSecondary} transition hover:bg-[${palette.surfaceMuted}] focus:outline-none focus-visible:ring-2 ${colorTokens.ringAccent} focus-visible:ring-offset-2 ${colorTokens.ringOffset} disabled:cursor-not-allowed disabled:opacity-60`,
  link: `inline-flex items-center justify-center rounded-lg border ${colorTokens.border} px-4 py-2 text-sm font-medium ${colorTokens.textSecondary} transition hover:bg-[${palette.surfaceMuted}] focus:outline-none focus-visible:ring-2 ${colorTokens.ringAccent} focus-visible:ring-offset-2 ${colorTokens.ringOffset}`,
  pill: `inline-flex items-center gap-2 rounded-full border ${colorTokens.accentBorder} ${colorTokens.accentBg} px-3 py-1 text-xs font-semibold ${colorTokens.accentText} shadow-md shadow-[#020817]/40 transition ${colorTokens.accentHoverBg} focus:outline-none focus-visible:ring-2 ${colorTokens.ringAccent} focus-visible:ring-offset-2 ${colorTokens.ringOffset} disabled:cursor-not-allowed disabled:opacity-60`
};

export const text = {
  subtle: `text-sm ${colorTokens.textMuted}`,
  mono: `font-mono break-all ${colorTokens.textPrimary}`,
  hint: `text-xs ${colorTokens.textHint}`,
  pageTitle: `text-2xl font-semibold ${colorTokens.textPrimary}`,
  sectionHeading: `text-lg font-semibold ${colorTokens.textPrimary}`,
  dialogTitle: `text-xl font-semibold ${colorTokens.textPrimary}`,
  meta: `text-xs font-semibold uppercase tracking-wide ${colorTokens.textMuted}`,
  body: `text-sm ${colorTokens.textSecondary}`,
  link: `${colorTokens.link} underline ${colorTokens.linkHover}`
};

export const table = {
  base: `min-w-full divide-y divide-[${palette.border}] text-left text-sm ${colorTokens.textSecondary}`,
  headRow: `bg-[${palette.surfaceMuted}]`,
  headCell: `px-4 py-3 text-xs font-semibold uppercase tracking-wide ${colorTokens.textMuted}`,
  cell: 'px-4 py-3 align-top',
  row: `${colorTokens.surfaceBg} even:bg-[${palette.surfaceMuted}]`
};

export const surface = {
  pill: `inline-flex items-center rounded-full ${colorTokens.surfaceMutedBg} px-3 py-1 text-xs font-semibold ${colorTokens.textSecondary} shadow-sm ring-1 ${colorTokens.border}`,
  badge: `inline-flex items-center rounded-full ${colorTokens.surfaceBg} px-2.5 py-1 text-xs font-medium ${colorTokens.textSecondary}`,
  codeBlock: `overflow-x-auto rounded-xl bg-[#0d1f3e] p-4 font-mono text-sm ${colorTokens.textSecondary}`,
  panel: `rounded-3xl border ${colorTokens.border} ${colorTokens.surfaceRaisedBg}`,
  card: `rounded-2xl border ${colorTokens.border} ${colorTokens.surfaceRaisedBg}`,
  overlay: `${colorTokens.overlayBg}`,
  input: `rounded-2xl border ${colorTokens.border} ${colorTokens.surfaceBg}`,
  bubbleOwn: `max-w-[80%] rounded-3xl border ${colorTokens.accentBorder} ${colorTokens.accentBg} px-4 py-2 text-sm ${colorTokens.accentText} shadow-md shadow-[#020817]/30 sm:max-w-[70%]`,
  bubbleOther: `max-w-[80%] rounded-3xl border ${colorTokens.border} ${colorTokens.surfaceTintBg} px-4 py-2 text-sm ${colorTokens.textPrimary} shadow-md shadow-[#020817]/20 sm:max-w-[68%]`,
  systemMessage: `mx-auto rounded-full bg-[${palette.surfaceMuted}] px-3 py-1 text-xs ${colorTokens.textMuted}`
};

export const form = {
  label: `flex flex-col gap-2 text-sm font-medium ${colorTokens.textSecondary}`,
  input: `w-full rounded-lg border ${colorTokens.border} ${colorTokens.surfaceBg} px-3 py-2 text-sm ${colorTokens.textPrimary} shadow-sm transition focus:border-[${palette.accent}] focus:outline-none focus:ring-2 ${colorTokens.inputRing}`,
  textarea: `w-full rounded-lg border ${colorTokens.border} ${colorTokens.surfaceBg} px-3 py-2 text-sm ${colorTokens.textPrimary} shadow-sm transition focus:border-[${palette.accent}] focus:outline-none focus:ring-2 ${colorTokens.inputRing}`,
  select: `w-full rounded-lg border ${colorTokens.border} ${colorTokens.surfaceBg} px-3 py-2 text-sm ${colorTokens.textPrimary} shadow-sm transition focus:border-[${palette.accent}] focus:outline-none focus:ring-2 ${colorTokens.inputRing}`,
  checkbox: `flex items-center gap-3 text-sm ${colorTokens.textSecondary}`,
  radio: `flex items-center gap-3 text-sm ${colorTokens.textSecondary}`
};
