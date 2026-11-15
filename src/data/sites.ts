import raw from "../../data/sites.json";
import type { AnalogSite, ImageRef, Target } from "@/types/site";

export const SITES_VERSION: string = raw.version;
export const SITES = raw.sites as AnalogSite[];

/** Sites relevant to a target (a site can serve both bodies). */
export function sitesForTarget(sites: AnalogSite[], target: Target): AnalogSite[] {
  return sites.filter((s) => s.targets.includes(target));
}

/** Target-body images for the given target (untagged images apply to every target). */
export function targetImagesFor(site: AnalogSite, target: Target): ImageRef[] {
  return site.images.target.filter((img) => !img.target || img.target === target);
}
