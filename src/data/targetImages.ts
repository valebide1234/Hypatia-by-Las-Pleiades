import type { ImageRef, Target } from "@/types/site";

/** Real, public-domain photographs used on the target-selection cards. */
export const TARGET_CARD_IMAGES: Record<Target, ImageRef> = {
  moon: {
    url: "/images/targets/moon-apollo11-as11-44-6667.jpg",
    caption: "Full Moon photographed from the Apollo 11 spacecraft on its trans-Earth journey, ~10,000 nautical miles out.",
    source: "NASA (Project Apollo), via Wikimedia Commons",
    instrument: "Apollo 11 Hasselblad camera, frame AS11-44-6667",
    date: "1969-07-21",
    credit: "NASA",
    license: "Public domain",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:AS11-44-6667_-_Full_Moon_Photographed_From_Apollo_11_Spacecraft.jpg",
  },
  mars: {
    url: "/images/targets/mars-viking1-valles-marineris.jpg",
    caption: "Mosaic of 102 Viking 1 Orbiter images centred on Valles Marineris, in point perspective from 2,500 km altitude.",
    source: "NASA / USGS (PIA04304), via Wikimedia Commons",
    instrument: "Viking 1 Orbiter, Visual Imaging Subsystem",
    date: "1980-02-22",
    credit: "NASA / USGS",
    license: "Public domain",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Mars_Valles_Marineris.jpeg",
  },
};
