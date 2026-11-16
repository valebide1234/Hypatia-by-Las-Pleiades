import raw from "../../data/sites.json";
import { asset } from "@/lib/asset";
import type { AnalogSite, ImageRef, Target } from "@/types/site";

export const SITES_VERSION: string = raw.version;
const rebase = (img: ImageRef): ImageRef => ({ ...img, url: asset(img.url) });
/** The catalogue, with image addresses pointing at where the app is served from. */
export const SITES: AnalogSite[] = (raw.sites as AnalogSite[]).map((s) => ({
  ...s,
  images: { earth: s.images.earth.map(rebase), target: s.images.target.map(rebase) },
}));

/** Sites relevant to a target (a site can serve both bodies). */
export function sitesForTarget(sites: AnalogSite[], target: Target): AnalogSite[] {
  return sites.filter((s) => s.targets.includes(target));
}

/** Target-body images for the given target (untagged images apply to every target). */
export function targetImagesFor(site: AnalogSite, target: Target): ImageRef[] {
  return site.images.target.filter((img) => !img.target || img.target === target);
}
