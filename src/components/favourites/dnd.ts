/** Drag-and-drop payload types used inside the Favourites panel. */
export const DND_FAVOURITE = "application/x-hypatia-favourite";
export const DND_FOLDER = "application/x-hypatia-folder";

export const hasType = (e: React.DragEvent, type: string) => Array.from(e.dataTransfer.types).includes(type);
