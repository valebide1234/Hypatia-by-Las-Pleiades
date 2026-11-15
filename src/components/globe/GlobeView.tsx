import { useEffect, useRef, useState } from "react";
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  HeadingPitchRange,
  HeightReference,
  ImageryLayer,
  Ion,
  IonWorldImageryStyle,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
  createWorldImageryAsync,
  defined,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AnalogSite } from "@/types/site";
import { TOP_N } from "@/lib/ranking";
import { CLUSTER_SIZE, PIN_SIZE, clusterImage, loadPinAssets, pinGraphic } from "./pinImages";

const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();

/** NASA GIBS Blue Marble (public domain), used when no Cesium ion token is configured. */
const GIBS_BLUE_MARBLE =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

export const usingIonImagery = Boolean(ionToken);

function createViewer(container: HTMLElement): Viewer {
  let baseLayer: ImageryLayer;
  let terrain: Terrain | undefined;
  if (ionToken) {
    Ion.defaultAccessToken = ionToken;
    baseLayer = ImageryLayer.fromProviderAsync(createWorldImageryAsync({ style: IonWorldImageryStyle.AERIAL_WITH_LABELS }));
    terrain = Terrain.fromWorldTerrain();
  } else {
    baseLayer = new ImageryLayer(
      new UrlTemplateImageryProvider({
        url: GIBS_BLUE_MARBLE,
        tilingScheme: new WebMercatorTilingScheme(),
        maximumLevel: 8,
        credit: new Credit("Imagery: NASA Earth Observatory Blue Marble via NASA EOSDIS GIBS"),
      }),
    );
  }

  const viewer = new Viewer(container, {
    baseLayer,
    ...(terrain ? { terrain } : {}),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 800;
  viewer.camera.setView({ destination: Cartesian3.fromDegrees(-60, 22, 2.2e7) });
  return viewer;
}

/**
 * A fresh clustered data source. Pins are rebuilt into a NEW data source whenever the visible
 * set or ranks change: Cesium's EntityCluster otherwise keeps stale billboard images for
 * re-added entities with the same ids.
 */
function createSiteDataSource(): CustomDataSource {
  const ds = new CustomDataSource("analog-sites");
  ds.clustering.enabled = true;
  ds.clustering.pixelRange = 30;
  ds.clustering.minimumClusterSize = 2;
  ds.clustering.clusterEvent.addEventListener((entities, cluster) => {
    cluster.label.show = false;
    cluster.billboard.show = true;
    cluster.billboard.id = cluster.label.id;
    const clusterRanks = entities
      .map((en) => en.properties?.rank?.getValue() as number | undefined)
      .filter((r): r is number => typeof r === "number");
    const bestRank = clusterRanks.length ? Math.min(...clusterRanks) : undefined;
    // Cesium's typings say string, but billboards accept canvases at runtime.
    cluster.billboard.image = clusterImage(entities.length, bestRank) as unknown as string;
    cluster.billboard.width = CLUSTER_SIZE;
    cluster.billboard.height = CLUSTER_SIZE;
    cluster.billboard.verticalOrigin = VerticalOrigin.CENTER;
  });
  return ds;
}

interface Props {
  sites: AnalogSite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** siteId → rank in the full ranking, when filters are active. */
  ranks?: ReadonlyMap<string, number> | null;
  /** Site ids saved as favourites (drawn with a star). */
  favouriteIds?: ReadonlySet<string>;
  /** Reports the ground point at the centre of the view after the camera stops moving. */
  onViewCenter?: (c: { lat: number; lon: number } | null) => void;
}

export default function GlobeView({ sites, selectedId, onSelect, ranks, favouriteIds, onViewCenter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewCenterRef = useRef(onViewCenter);
  onViewCenterRef.current = onViewCenter;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create the viewer once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let viewer: Viewer;
    try {
      viewer = createViewer(container);
    } catch (e) {
      setError(e instanceof Error ? e.message : "WebGL is not available in this browser.");
      return;
    }
    viewerRef.current = viewer;
    // Handy for debugging in the browser console during development only.
    if (import.meta.env.DEV) (window as unknown as { __hypatiaViewer?: Viewer }).__hypatiaViewer = viewer;


    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position);
      if (!defined(picked)) return;
      const id = picked.id as unknown;
      if (Array.isArray(id)) {
        // A cluster: zoom in until it splits.
        const positions = (id as Entity[])
          .map((en) => en.position?.getValue(viewer.clock.currentTime))
          .filter((p): p is Cartesian3 => Boolean(p));
        if (positions.length) {
          const sphere = BoundingSphere.fromPoints(positions);
          viewer.camera.flyToBoundingSphere(sphere, {
            offset: new HeadingPitchRange(0, CesiumMath.toRadians(-60), Math.max(sphere.radius * 4, 60000)),
            duration: 1.4,
          });
        }
      } else if (id instanceof Entity && typeof id.properties?.siteId?.getValue() === "string") {
        onSelectRef.current(id.properties.siteId.getValue() as string);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const picked = viewer.scene.pick(e.endPosition);
      viewer.canvas.style.cursor = defined(picked) && picked.id ? "pointer" : "";
    }, ScreenSpaceEventType.MOUSE_MOVE);

    const reportCenter = () => {
      const canvas = viewer.scene.canvas;
      const hit = viewer.camera.pickEllipsoid(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
      if (!hit) return onViewCenterRef.current?.(null);
      const c = Cartographic.fromCartesian(hit);
      onViewCenterRef.current?.({ lat: CesiumMath.toDegrees(c.latitude), lon: CesiumMath.toDegrees(c.longitude) });
    };
    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(reportCenter);
    reportCenter();

    loadPinAssets().then(() => setReady(true));

    return () => {
      handler.destroy();
      removeMoveEnd();
      viewerRef.current = null;
      dataSourceRef.current = null;
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  // (Re)build pins whenever the visible site list changes.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    const ds = createSiteDataSource();
    ds.entities.suspendEvents();
    for (const site of sites) {
      const rank = ranks?.get(site.id);
      const pin = pinGraphic(site.origin, { rank, top: rank !== undefined && rank <= TOP_N, favourite: favouriteIds?.has(site.id) });
      const size = { width: pin.width, height: pin.height, anchor: PIN_SIZE[site.origin].anchor };
      const selected = site.id === selectedId;
      ds.entities.add(
        new Entity({
          id: `site:${site.id}`,
          name: rank !== undefined ? `#${rank} ${site.name}` : site.name,
          position: Cartesian3.fromDegrees(site.lon, site.lat),
          properties: rank !== undefined ? { siteId: site.id, rank } : { siteId: site.id },
          billboard: {
            image: pin.image,
            width: size.width,
            height: size.height,
            // Eye-space z points into the screen: better (lower) ranks sit slightly in front.
            ...(rank !== undefined ? { eyeOffset: new Cartesian3(0, 0, rank * 10) } : {}),
            verticalOrigin: size.anchor === "bottom" ? VerticalOrigin.BOTTOM : VerticalOrigin.CENTER,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            scaleByDistance: new NearFarScalar(2e4, selected ? 1.6 : 1.3, 2.2e7, selected ? 1.1 : 0.8),
            disableDepthTestDistance: 5e4,
          },
          label: {
            text: site.name,
            font: "500 13px 'Inter Variable', system-ui, sans-serif",
            fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString("#03050b"),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.TOP,
            pixelOffset: new Cartesian2(0, size.anchor === "bottom" ? 6 : size.height / 2 + 6),
            heightReference: HeightReference.CLAMP_TO_GROUND,
            distanceDisplayCondition: new DistanceDisplayCondition(0, 3.5e6),
            disableDepthTestDistance: 5e4,
          },
        }),
      );
    }
    ds.entities.resumeEvents();
    const previous = dataSourceRef.current;
    viewer.dataSources.add(ds);
    if (previous) viewer.dataSources.remove(previous, true);
    dataSourceRef.current = ds;
    viewer.scene.requestRender();
  }, [sites, ready, selectedId, ranks, favouriteIds]);

  // Fly to the selected site.
  useEffect(() => {
    const viewer = viewerRef.current;
    const site = sites.find((s) => s.id === selectedId);
    if (!viewer || !site) return;
    viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(site.lon, site.lat), 1000), {
      // Without ion the Blue Marble fallback tops out at ~500 m/pixel, so stay higher up.
      offset: new HeadingPitchRange(0, CesiumMath.toRadians(-40), usingIonImagery ? 30000 : 350000),
      duration: 2,
    });
    // Only re-run when the selection changes, not when the site list is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="hypatia-globe absolute inset-0" aria-label="3D globe of analog sites" role="application" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-space-950 p-6 text-center text-sm text-slate-300">
          The 3D globe could not start ({error}). The site list on the left still works.
        </div>
      )}
    </div>
  );
}
