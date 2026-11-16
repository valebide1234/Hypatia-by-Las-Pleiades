/** Preset folder colours and icons (shape glyphs, so folders are distinguishable without colour). */
export const FOLDER_COLORS = ["#b9d4ff", "#86efac", "#fcd34d", "#fca5a5", "#c4b5fd", "#67e8f9", "#f9a8d4", "#cbd5e1"] as const;

export const FOLDER_ICONS: Record<string, string> = {
  dot: "●",
  star: "★",
  triangle: "▲",
  diamond: "◆",
  square: "■",
  hexagon: "⬢",
  ring: "◎",
  flag: "⚑",
};

export const folderGlyph = (icon: string | null) => FOLDER_ICONS[icon ?? "dot"] ?? FOLDER_ICONS.dot!;
