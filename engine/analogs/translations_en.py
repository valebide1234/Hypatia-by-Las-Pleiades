"""English text for the catalogues, keyed by identifier. Interface strings are in translations_ui_en.py."""
from .translations_ui_en import UI  # noqa: F401  (re-exported for i18n)

NO_NASA = "No NASA analogue programme documented in this catalogue."

SITES = {
    "atacama_yungay": dict(
        name="Atacama Desert, hyper-arid core (Yungay)", country="Chile",
        summary="One of the driest places on Earth: soils with sulfates, chlorides, nitrates and perchlorates, and almost no organic matter.",
        access="Road access from Antofagasta; no services on site.",
        heritage="Rover and life-detection instrument trials (Life in the Atacama project).",
        program="Life in the Atacama and ARADS (NASA ASTEP / NASA Ames): rover and drilling trials for life detection.", by="NASA"),
    "dry_valleys_university": dict(
        name="McMurdo Dry Valleys (University / Beacon Valley)", country="Antarctica",
        summary="Cold, hyper-arid polar desert: dry permafrost over ice-cemented ground, with no wet active layer in the upland zones.",
        access="Only through national Antarctic programmes (helicopter from McMurdo), austral summer.",
        heritage="Reference analogue for Martian subsurface ice; drilling trials.",
        program="IceBite project (NASA ASTEP): drilling trials in dry permafrost for the proposed Icebreaker mission.", by="NASA"),
    "don_juan_pond": dict(
        name="Don Juan Pond, Wright Valley", country="Antarctica",
        summary="CaCl2 brine pond that never freezes; fed by salt deliquescence and shallow subsurface flow.",
        access="Only through national Antarctic programmes.",
        heritage="Analogue for brines and recurring slope lineae on Mars.", program=NO_NASA, by="University groups"),
    "iceland_askja": dict(
        name="Askja - Dyngjusandur - Holuhraun, Highlands", country="Iceland",
        summary="Basaltic volcanic desert: caldera, recent lava flows, tephra and an extensive wind-shaped basaltic sand sheet.",
        access="Mountain tracks (F-roads), summer only; huts.",
        heritage="Geology training of Apollo astronauts (1965, 1967); basaltic sand studies for Mars.",
        program="Geology training of Apollo programme astronauts (NASA, 1965 and 1967).", by="NASA"),
    "hawaii_saddle": dict(
        name="Mauna Loa - Mauna Kea (HI-SEAS, Pu'u Nene)", country="United States (Hawaii)",
        summary="High-altitude basaltic shields with lava flows, cinder cones, lava tubes and palagonitic tephra (source of the JSC Mars-1 simulant).",
        access="Road (Saddle Road); permits depend on the area.",
        heritage="HI-SEAS habitat; BASALT programme; source of the JSC Mars-1 simulant.",
        program="HI-SEAS habitat (funded by NASA's Human Research Program), BASALT programme (NASA PSTAR) and JSC Mars-1 simulant (NASA JSC).", by="NASA"),
    "kilauea_kau": dict(
        name="Kīlauea - Ka'ū Desert", country="United States (Hawaii)",
        summary="Young basalts and tephra altered by acid volcanic gases, with opaline silica crusts and basaltic dunes.",
        access="Hawai'i Volcanoes National Park; research permits.",
        heritage="Analogue for acid-sulfate alteration and Gusev silica; BASALT programme.",
        program="BASALT programme (NASA PSTAR): science operations for human exploration on basaltic terrain.", by="NASA"),
    "salar_uyuni": dict(
        name="Salar de Uyuni", country="Bolivia",
        summary="The world's largest salt crust, a remnant of Altiplano palaeolakes, at high altitude and with strong UV radiation.",
        access="Road access from the town of Uyuni; floods in the austral summer.",
        heritage="Analogue for Martian chloride deposits and evaporite basins.",
        program="No NASA planetary-analogue programme documented in this catalogue (NASA used it to calibrate the ICESat altimeter, not as an analogue).",
        by="Academic groups"),
    "namib_sand_sea": dict(
        name="Namib Sand Sea (Sossusvlei)", country="Namibia",
        summary="Hyper-arid coastal erg with very large linear and star dunes and iron-oxide-coated sands.",
        access="Road to Sesriem; national park, permits.",
        heritage="Dune morphology studies applied to Mars and Titan.", program=NO_NASA, by="Academic groups"),
    "rio_tinto": dict(
        name="Río Tinto (headwaters, Peña de Hierro)", country="Spain",
        summary="Acidic river (pH ~2) with iron sulfate, jarosite, goethite and hematite deposits, on the Iberian Pyrite Belt.",
        access="Road and nearby towns.",
        heritage="Mineralogical analogue of Meridiani Planum; MARTE drilling project.",
        program="MARTE project (Mars Astrobiology Research and Technology Experiment, NASA ASTEP): robotic drilling in search of subsurface life.", by="NASA"),
    "haughton_devon": dict(
        name="Haughton impact structure, Devon Island", country="Canada (Nunavut)",
        summary="Well-preserved ~23 km impact crater in a polar desert with continuous permafrost; impact breccias and hydrothermal deposits.",
        access="Charter aircraft from Resolute Bay; summer campaign.",
        heritage="Haughton-Mars Project (since 1997): operations, pressurised rovers, drilling.",
        program="Haughton-Mars Project (NASA Ames, Mars Institute, SETI), active since 1997.", by="NASA"),
    "meteor_crater": dict(
        name="Barringer Crater (Meteor Crater)", country="United States (Arizona)",
        summary="Simple 1.2 km impact crater, among the best preserved on Earth, in sedimentary rocks.",
        access="Road; private property, authorisation required.",
        heritage="Apollo astronaut training; reference for cratering mechanics.",
        program="Geology training of Apollo programme astronauts (NASA / USGS).", by="NASA"),
    "sfvf_sp_crater": dict(
        name="San Francisco Volcanic Field (SP Crater - Black Point)", country="United States (Arizona)",
        summary="Young cinder cones and basaltic lava flows on a sedimentary plateau; source of the ash used for the JSC-1 lunar simulant.",
        access="Dirt tracks from Flagstaff.",
        heritage="NASA Desert RATS campaigns; Apollo training; JSC-1 simulant.",
        program="NASA Desert RATS campaigns, Apollo training and source of the JSC-1 lunar simulant.", by="NASA"),
    "craters_of_the_moon": dict(
        name="Craters of the Moon, Snake River Plain", country="United States (Idaho)",
        summary="Basaltic lava field along a fissure: flows, spatter and cinder cones, and lava tubes.",
        access="Road; national monument, research permits.",
        heritage="Apollo 14 training; NASA FINESSE and BASALT programmes.",
        program="Apollo 14 astronaut training and NASA's FINESSE and BASALT programmes.", by="NASA"),
    "lanzarote_timanfaya": dict(
        name="Lanzarote (Timanfaya - La Corona lava tube)", country="Spain (Canary Islands)",
        summary="Arid volcanic island with lava flows and lapilli from historical eruptions and one of the largest known lava tubes.",
        access="Road and services; national park, permits.",
        heritage="ESA PANGAEA course for astronauts; lava tube exploration trials.", program=NO_NASA, by="ESA (PANGAEA course)"),
    "amboy_crater": dict(
        name="Amboy Crater, Mojave Desert", country="United States (California)",
        summary="Cinder cone and basaltic lava field in a desert, with wind streaks and sand over the lava, next to a saline playa.",
        access="Road (Route 66).",
        heritage="Classic analogue site for wind-lava interaction; field data archived in the PDS.",
        program="Field analogue site whose data NASA archives in the PDS Geosciences Node.", by="NASA"),
    "utah_mdrs": dict(
        name="Utah Desert, Hanksville (MDRS)", country="United States (Utah)",
        summary="Badlands of Jurassic sediments: clay-rich mudstones, gypsum, iron concretions and inverted river channels.",
        access="Road to Hanksville and a short track.",
        heritage="Mars Desert Research Station (Mars Society); rover trials by several agencies.", program=NO_NASA, by="Mars Society (MDRS)"),
    "svalbard_bockfjorden": dict(
        name="Bockfjorden Volcanic Complex, Svalbard", country="Norway (Svalbard)",
        summary="Quaternary basaltic volcano and hot springs in Arctic permafrost, with carbonates comparable to those in the ALH84001 meteorite.",
        access="Ship expedition from Longyearbyen; summer.",
        heritage="AMASE campaigns: testing of Curiosity and ExoMars instruments.",
        program="AMASE expeditions, funded by NASA ASTEP: testing of Curiosity's CheMin and SAM instruments.", by="NASA"),
    "dallol": dict(
        name="Dallol geothermal area, Danakil Depression", country="Ethiopia",
        summary="Hyper-acidic, hyper-saline hydrothermal system below sea level: hot brines, salts, sulfur and iron oxides.",
        access="Expedition logistics; extreme heat and variable security conditions.",
        heritage="Studies of the limits of life in poly-extreme environments.", program=NO_NASA, by="Europlanet and European groups"),
    "pilbara_dresser": dict(
        name="Pilbara, Dresser Formation (North Pole Dome)", country="Australia",
        summary="Rocks about 3.5 billion years old with stromatolites and hot-spring deposits, in a belt of Archaean basalts.",
        access="4x4 tracks from Marble Bar; very hot climate.",
        heritage="Training of Mars 2020 and ExoMars science teams on ancient biosignatures.",
        program="Joint field trip of the Mars 2020 (NASA) and ExoMars (ESA) science teams, 2019.", by="NASA and ESA"),
    "qaidam_dalangtan": dict(
        name="Qaidam Basin (Dalangtan playa)", country="China",
        summary="High-altitude, hyper-arid, cold closed basin: saline playas, sulfates, yardangs and dunes.",
        access="Tracks; remote area of the Tibetan Plateau.",
        heritage="Mars analogue site proposed for Chinese exploration.", program=NO_NASA, by="Chinese institutions"),
    "lonar_crater": dict(
        name="Lonar Crater", country="India",
        summary="1.8 km impact crater excavated in Deccan basalts: a rare case of impact into basalt, as on Mars and the lunar maria.",
        access="Road and a town next to the crater.",
        heritage="Study of ejecta and impact glasses in basalt.", program=NO_NASA, by="Academic groups"),
    "ries_crater": dict(
        name="Nördlinger Ries crater", country="Germany",
        summary="Complex ~24 km crater with suevite (melt-bearing impact breccia), preserved ejecta and crater-lake sediments.",
        access="Road, accessible quarries and a museum.",
        heritage="Apollo 14 and 17 astronaut training; ESA courses.",
        program="Geology training of Apollo 14 and Apollo 17 astronauts (NASA, 1970).", by="NASA"),
    "mistastin": dict(
        name="Mistastin Lake impact structure (Kamestastin)", country="Canada (Labrador)",
        summary="~28 km crater excavated in anorthosite: one of the few analogues of an impact into lunar-highland-type crust.",
        access="Floatplane; summer campaign.",
        heritage="Lunar analogue missions of the Canadian Space Agency.", program=NO_NASA, by="Canadian Space Agency (CSA)"),
    "stillwater_complex": dict(
        name="Stillwater Complex", country="United States (Montana)",
        summary="Layered mafic intrusion with anorthosites and norites; feedstock for the NU-LHT lunar highland simulants.",
        access="Road; mining and mountain area.",
        heritage="Source of the NU-LHT highland regolith simulants.",
        program="Feedstock for the NU-LHT lunar regolith simulants (NASA MSFC / USGS).", by="NASA"),
    "axel_heiberg_mars": dict(
        name="Axel Heiberg Island (McGill station, Expedition Fiord)", country="Canada (Nunavut)",
        summary="Polar desert with permafrost more than 500 m thick cut by perennial saline springs and gypsum and salt diapirs.",
        access="Charter aircraft from Resolute Bay; summer campaign.",
        heritage="McGill Arctic Research Station; cold-spring studies as a Martian analogue.", program=NO_NASA, by="McGill University and CSA"),
    "white_sands": dict(
        name="White Sands", country="United States (New Mexico)",
        summary="The world's largest gypsum dune field, fed by an evaporite playa.",
        access="Road; national park and adjacent military range.",
        heritage="Analogue for the gypsum dunes of Olympia Undae.",
        program="No NASA planetary-analogue programme documented in this catalogue.", by="Academic groups"),
    "licancabur": dict(
        name="Licancabur volcano and high-Andean lakes", country="Chile / Bolivia",
        summary="Stratovolcano almost 6000 m high with a crater lake and saline lakes at its base: low pressure, cold and very high UV radiation.",
        access="Track to the base; high-altitude ascent.",
        heritage="High Lakes Project (NASA/SETI): drying lakes as an analogue for early Mars.",
        program="High Lakes Project (NASA Astrobiology Institute, SETI and NASA Ames).", by="NASA"),
    "channeled_scabland": dict(
        name="Channeled Scabland (Dry Falls)", country="United States (Washington)",
        summary="Landscape carved by glacial megafloods into flood basalts: dry cataracts, channels and giant bars.",
        access="Road and state parks.",
        heritage="Classic analogue for Martian outflow channels.",
        program="Field guide and planetary geology conference sponsored by NASA (1978) on the channels of Mars.", by="NASA"),
    "lava_beds": dict(
        name="Lava Beds, Medicine Lake volcano", country="United States (California)",
        summary="Basaltic lava field with hundreds of accessible lava tubes.",
        access="Road; national monument, permits.",
        heritage="Robotic cave exploration trials (NASA BRAILLE project).",
        program="BRAILLE project (NASA PSTAR): robotic exploration of lava tubes.", by="NASA"),
}

REGIONS = {
    "apollo11_tranquillitatis": dict(name="Mare Tranquillitatis (Apollo 11)",
        summary="Plain of titanium-rich mare basalts covered by several metres of mature regolith."),
    "apollo15_hadley": dict(name="Hadley-Apennine (Apollo 15)",
        summary="Edge of a basaltic mare next to a sinuous lava channel (Rima Hadley) and the Apennine mountain front."),
    "apollo16_descartes": dict(name="Descartes Highlands (Apollo 16)",
        summary="Feldspathic highlands: anorthositic impact breccias, with no mare basalts."),
    "apollo17_taurus_littrow": dict(name="Taurus-Littrow Valley (Apollo 17)",
        summary="Valley between highland massifs, filled with basalts and with pyroclastic deposits (orange glass)."),
    "shackleton_south_pole": dict(name="Shackleton crater (south pole, Artemis region)",
        summary="Polar crater with a permanently shadowed interior and rims in near-continuous sunlight; a candidate to hold volatiles.",
        notes="The presence of ice at Shackleton is likely but not confirmed (g_ground_ice = 0.5). LCROSS measured water at Cabeus, "
              "not here. Insolation computed for flat ground is not valid at the pole: it depends on local topography."),
    "marius_hills": dict(name="Marius Hills (lava tube skylight)",
        summary="Volcanic complex with domes and cones on mare basalts; hosts a skylight of a possible lava tube.",
        notes="Skylight coordinates published by Haruyama et al. (2009)."),
    "aristarchus_plateau": dict(name="Aristarchus Plateau",
        summary="Volcanic plateau with the Moon's largest regional pyroclastic deposit and the sinuous channel Vallis Schröteri.",
        notes="IAU coordinates of Vallis Schröteri, at the centre of the plateau. No literature albedo value assigned "
              "(dark pyroclastic mantle over mixed terrain)."),
    "von_karman_spa": dict(name="Von Kármán crater, South Pole-Aitken basin (Chang'E-4)",
        summary="Basalt-filled crater floor inside the largest lunar impact basin, on the far side.",
        notes="No literature albedo value assigned."),
    "gale_crater": dict(name="Gale crater (Curiosity)",
        summary="Crater with clay-rich fluvio-lacustrine sediments, an upper sulfate unit and an active basaltic dune field."),
    "jezero_crater": dict(name="Jezero crater (Perseverance)",
        summary="Palaeolake with a well-preserved delta, a floor of aqueously altered igneous rocks and carbonate-bearing units."),
    "meridiani_planum": dict(name="Meridiani Planum (Opportunity)",
        summary="Plain of sulfate-rich sandstones with hematite spherules and jarosite, formed in acidic, saline environments."),
    "gusev_crater": dict(name="Gusev crater / Columbia Hills (Spirit)",
        summary="Basaltic lava plains and hills with hydrothermal opaline silica deposits and carbonate-bearing outcrops."),
    "elysium_insight": dict(name="Elysium Planitia (InSight)",
        summary="Very flat volcanic plain with a few metres of sandy regolith over basaltic flows."),
    "phoenix_vastitas": dict(name="Vastitas Borealis (Phoenix)",
        summary="Polar plain with polygonal ground and water ice a few centimetres deep; soil with perchlorates and carbonate."),
    "ares_vallis": dict(name="Ares Vallis, Chryse Planitia (Mars Pathfinder)",
        summary="Mouth of a catastrophic flood channel: a plain of boulders deposited by megafloods."),
    "arsia_mons": dict(name="Arsia Mons (Tharsis)",
        summary="Giant shield volcano; possible volcanic cave skylights have been identified on its flanks.",
        notes="IAU coordinates correspond to the centre of the edifice (caldera); the skylights are on the northern flank."),
    "melas_chasma": dict(name="Melas Chasma (Valles Marineris)",
        summary="Central section of the canyon system, with walls several kilometres high and sulfate-rich layered deposits."),
    "oxia_planum": dict(name="Oxia Planum (Rosalind Franklin rover site)",
        summary="Ancient plain with extensive Fe/Mg-rich clay deposits and remnants of a fluvio-deltaic system."),
    "olympia_undae": dict(name="Olympia Undae (north polar erg)",
        summary="Circumpolar dune sea of basaltic sand and gypsum, seasonally stabilised by frost and ice."),
}

PARAMS = {
    "relief_m": dict(label="Local relief (P95-P5 of elevation)"),
    "slope_mean_deg": dict(label="Mean slope (463 m baseline)"),
    "slope_p95_deg": dict(label="95th-percentile slope"),
    "roughness_tri_m": dict(label="Roughness (mean TRI, 463 m)"),
    "tsurf_mean_K": dict(label="Mean surface temperature",
        note="Earth: MERRA-2 skin temperature (reanalysis). Moon: Diviner bolometric temperature (measured). Mars: MCD (model)."),
    "tsurf_min_K": dict(label="Minimum surface temperature"),
    "tsurf_max_K": dict(label="Maximum surface temperature"),
    "diurnal_range_K": dict(label="Diurnal surface temperature range",
        note="The 'day' differs: 24 h (Earth), 24.66 h (Mars), 29.53 days (Moon). The range is compared, not the rate of change."),
    "albedo": dict(label="Broadband albedo",
        note="Earth: CERES SYN1deg (measured, ~110 km), weighted by monthly insolation; includes seasonal snow and is omitted if the "
             "cell is mostly ocean. Mars: TES bolometric albedo (measured). Moon: literature value by terrain type (mare/highlands), not a map."),
    "insolation_Wm2": dict(label="Annual mean insolation on a horizontal surface",
        note="Earth: CERES at the surface (with clouds). Mars: MCD surface flux (model). Moon: astronomical computation without "
             "atmosphere for flat ground (ignores topographic shadows)."),
    "pressure_Pa": dict(label="Surface atmospheric pressure",
        note="No Earth site comes close to Mars (~600 Pa) or the lunar vacuum. It is included so the gap is quantified, not to reward any site."),
    "wind_speed_ms": dict(label="Mean wind speed (10 m)",
        note="Similar speeds do NOT mean similar forces: Martian air density is ~1 % of Earth's. See dynamic pressure."),
    "wind_dynamic_pressure_Pa": dict(label="Mean wind dynamic pressure (0.5 rho v^2)",
        note="Derived. Earth: rho from the ideal gas law with POWER pressure and temperature. Mars: rho and wind from the MCD."),
    "dust_optical_depth": dict(label="Aerosol/dust optical depth (visible)",
        note="Earth: AOD at 550 nm (MERRA-2). Mars: visible column dust optical depth (MCD). Different composition and particle size."),
    "precip_mm_yr": dict(label="Annual precipitation",
        note="On the Moon and on present-day Mars liquid precipitation is zero by physics (it is not a missing value)."),
    "soil_wetness": dict(label="Surface soil wetness (fraction of saturation)",
        note="Earth: MERRA-2 GWETTOP (land-surface model, ~50 km). Moon/Mars: 0 (no liquid water in the soil)."),
    "column_water_vapor_kgm2": dict(label="Column water vapour"),
    "thermal_cycling_273K": dict(label="Fraction of the year whose diurnal cycle crosses 273.15 K",
        note="Indicator of freeze-thaw cycles. On Mars crossing 273 K does not imply stable liquid water (pressure near the triple point)."),
    "g_basalt": dict(label="Basaltic lithology"),
    "g_anorthosite": dict(label="Anorthositic / feldspathic lithology"),
    "g_volcanic": dict(label="Volcanic landforms (flows, cones, shields)"),
    "g_lava_tubes": dict(label="Lava tubes / caves"),
    "g_pyroclastic": dict(label="Pyroclastic deposits / tephra"),
    "g_impact": dict(label="Impact structures and lithologies"),
    "g_aeolian": dict(label="Aeolian landforms (dunes, ripples)"),
    "g_fluvial_lacustrine": dict(label="Fluvial / deltaic / lacustrine sediments"),
    "g_evaporite": dict(label="Evaporites / chlorides"),
    "g_sulfate": dict(label="Sulfates"),
    "g_iron_oxide": dict(label="Iron oxides and hydroxides / jarosite"),
    "g_clay": dict(label="Phyllosilicates (clays)"),
    "g_carbonate": dict(label="Carbonates"),
    "g_perchlorate": dict(label="Perchlorates / nitrates (oxidants)"),
    "g_silica": dict(label="Hydrothermal / opaline silica"),
    "g_ground_ice": dict(label="Ground ice / permafrost"),
    "g_periglacial": dict(label="Glacial / periglacial landforms"),
    "g_loose_regolith": dict(label="Loose fine-grained cover (regolith, sand, tephra)"),
}

CATEGORIES = {"geology": "Geology and mineralogy", "topography": "Topography",
              "environment": "Environmental conditions", "water": "Water and ice"}

OBJECTIVES = {
    "balanced": dict(label="Balanced (general)",
        description="Gives the same weight to geology, topography, environment and water/ice."),
    "planetary_geology": dict(label="Planetary geology",
        description="Comparable geological processes and units: lithology, volcanism, impacts, sedimentation."),
    "regolith_soil": dict(label="Regolith and soils",
        description="Loose materials: composition, fine-grained cover, salts and moisture."),
    "rover_mobility": dict(label="Rover mobility",
        description="Slopes, roughness, relief and type of loose terrain (sand, regolith, dunes)."),
    "instrument_testing": dict(label="Instrument and sensor testing",
        description="Diagnostic mineralogy and operating conditions (temperature, illumination, dust)."),
    "habitat_infrastructure": dict(label="Habitats and infrastructure",
        description="Environmental loads on structures and systems: thermal cycles, wind, insolation, dust, terrain."),
    "extreme_survival": dict(label="Survival in extreme environments",
        description="Cold, aridity, solar radiation and isolation as combined stressors."),
    "water_ice_detection": dict(label="Water and ice detection",
        description="Ground ice, dry permafrost, sub-zero thermal regime and aridity."),
    "astrobiology": dict(label="Astrobiology",
        description="Ancient or extreme aqueous environments and minerals that preserve biosignatures (clays, sulfates, carbonates, silica, salts)."),
}

BODIES = {
    "earth": dict(label="Earth", atmosphere="N2 78.1 %, O2 20.9 %, Ar 0.93 %, CO2 ~0.04 %",
                  radiation="~2.4 mSv/year world-average natural background (≈0.4 mSv/year of cosmic origin at sea level)"),
    "moon": dict(label="Moon", atmosphere="Exosphere (He, Ar, Ne, Na, K); no collisional atmosphere",
                 radiation="1369 µSv/day (surface dose equivalent, Chang'E-4 LND)"),
    "mars": dict(label="Mars", atmosphere="CO2 96.0 %, Ar 1.93 %, N2 1.89 %, O2 0.145 % (Curiosity/SAM)",
                 radiation="0.64 ± 0.12 mSv/day (surface galactic cosmic ray dose equivalent, MSL/RAD)"),
}

# Same order as data/catalog/planetary_constants.yaml: (item, why)
NOT_REPRODUCIBLE = {
    "moon": [
        ("Gravity of 1.62 m/s² (1/6 g)", "It can only be approximated for seconds in parabolic flights or with weight-offload systems; it cannot be sustained in the field."),
        ("Vacuum (~3e-10 Pa) and absence of atmosphere", "It changes heat transfer, outgassing, lubrication and regolith mechanics. It requires thermal-vacuum chambers, not the field."),
        ("Thermal range from ~95 K to ~390 K at the equator and <40 K in permanently shadowed regions", "No Earth site falls below ~180 K or has 29.5-day cycles."),
        ("Night lasting ~14 Earth days", "Earth's polar night is the only operational parallel, but with an atmosphere and far higher temperatures."),
        ("Radiation: cosmic rays and solar particle events with no magnetic or atmospheric shielding", "Dose ~200 times Earth's natural background; it can only be tested in accelerators."),
        ("Real lunar regolith: angular grains, agglutinates, nanophase iron, electrostatic charging", "Earth soils are weathered by water and oxygen; simulants are used, and they reproduce only some properties."),
        ("Regolith ejection by engines in vacuum", "In vacuum and low gravity the particles follow long-range ballistic trajectories."),
    ],
    "mars": [
        ("Gravity of 3.71 m/s² (0.38 g)", "Not reproducible in a sustained way in the field."),
        ("CO2 atmosphere at ~600 Pa", "The lowest surface pressure on Earth (~33 kPa on the summit of Everest) is ~50 times higher. It affects convective cooling, aerodynamics, electrical arcing and the stability of water."),
        ("Entry, descent and landing (EDL)", "No test on Earth combines Martian density, composition, gravity and entry velocity; it is validated piece by piece."),
        ("Surface radiation (~0.64 mSv/day) and UV-C flux", "Earth's ozone layer and magnetic field prevent it; high-altitude sites only increase UV-A/B."),
        ("Oxidising soil chemistry (perchlorates ~0.5 wt%)", "The Atacama contains perchlorates, but at concentrations orders of magnitude lower."),
        ("Instability of liquid water near the triple point", "At ~600 Pa water boils or sublimates; brine and frost processes differ from those on Earth."),
        ("Global dust storms and electrostatically charged ~1-2 µm dust", "Earth dust differs in size, composition and moisture."),
        ("Real communication delay (~3-22 min one way) and no possibility of abort", "The delay can be simulated, not the real operational risk."),
    ],
}

FEASIBLE = {
    "planetary_geology": ["Mapping and sampling of analogue units", "Field geology protocols with astronauts", "Ground-truth validation of orbital image interpretation"],
    "regolith_soil": ["Characterisation of materials for simulants", "Excavation, sieving and handling of loose soils", "Geotechnical tests (at 1 g)"],
    "rover_mobility": ["Traction and sinkage on sand, tephra and slopes (at 1 g)", "Autonomous navigation and hazard detection", "Traverse planning with simulated delay"],
    "instrument_testing": ["Spectroscopy (VNIR, Raman, LIBS, XRD) on analogue mineralogy", "Ground-penetrating radar and geophysical sounding", "Calibration with samples of known composition"],
    "habitat_infrastructure": ["Deployment and operation of habitats", "Dust mitigation in airlocks and mechanisms", "Solar power and storage through day-night cycles or polar night", "Use of lava tubes as shelter"],
    "extreme_survival": ["Physiology and psychology under isolation and cold", "Logistics with limited resupply", "Simulated suited operations and EVA"],
    "water_ice_detection": ["Drilling in dry permafrost and ice-cemented ground", "Radar, neutron and thermal sounding over buried ice", "Water extraction from frozen soil (at Earth pressure)"],
    "astrobiology": ["Limits of life under aridity, cold, acidity and salinity", "Preservation and detection of biosignatures in analogue minerals", "Contamination-free sampling protocols"],
}

LINKS = {
    "earthdata_search": dict(what="NASA's catalogue of Earth observation data.",
        how="Earthdata Search is the interface of the CMR catalogue. The pipeline queries CMR directly to (1) count, site by site, the "
            "MODIS temperature and albedo scenes available and the date of the most recent one, and (2) record how current the MERRA-2 "
            "collections are. The climate variables of each site (temperature, pressure, wind, humidity, precipitation, insolation, "
            "albedo) come from Earthdata's MERRA-2 and CERES collections, read through the NASA POWER service, because downloading "
            "files through Earthdata Search requires an Earthdata Login account."),
    "worldview": dict(what="NASA's viewer of daily satellite imagery.",
        how="Worldview displays the layers of the GIBS service. The 3-D globe and the map use those same layers, including the ones in "
            "the challenge link: Blue Marble, MODIS Terra and Aqua, VIIRS NOAA-20 and NOAA-21 and PACE OCI in true colour. In addition, "
            "a satellite image of each site is downloaded with the Worldview Snapshots service, and each site has a link that opens "
            "Worldview at that location."),
    "pds_diviner": dict(what="Diviner radiometer on the Lunar Reconnaissance Orbiter: temperature of the lunar surface.",
        how="The page links to the archive of Diviner derived products. From there the pipeline reads, for each lunar region, the full "
            "diurnal temperature cycle (GCP product, LRO-L-DLRE-5-GCP-V1.0): 96 local-time bins of the 0.5° cell that contains the site. "
            "The Moon's mean, minimum and maximum temperature and thermal range come from those data."),
    "pds_lro": dict(what="Archive of the LRO mission: Diviner, LOLA, LEND, Mini-RF.",
        how="Besides Diviner, the LOLA laser altimeter is used: the LDEM_64 elevation model (64 pixels per degree) is read in windows to "
            "compute relief, slope and roughness of each lunar region with the same algorithm as on Earth and Mars."),
    "pds": dict(what="Official archive of data from NASA's planetary missions.",
        how="From the Geosciences Node: Diviner and LOLA (Moon) and the TES thermal inertia maps of Mars Global Surveyor "
            "(MGS-M-TES-5-TIMAP-V1.0). From the PDS services of USGS Astrogeology: MOLA topography of Mars and TES albedo. The Amboy "
            "Crater field dataset archived in the PDS is also cited."),
    "jaxa_gportal": dict(what="JAXA's Earth observation data portal.",
        how="Not queried: downloading requires user registration. Data from a JAXA mission are used, the Kaguya (SELENE) mineral maps, "
            "obtained from USGS Astrogeology."),
    "esa_open_science": dict(what="Catalogue of science products from ESA-funded projects.",
        how="Not queried: the catalogue describes thematic research products and does not contain the variables this system compares."),
    "copernicus_dataspace": dict(what="Data portal of the Copernicus programme (Sentinel satellites and derived products).",
        how="The Data Space catalogue is queried to obtain, site by site, the most recent Sentinel-2 scene. Earth topography uses the "
            "Copernicus DEM GLO-90, a product of the same programme, read from its public copy on AWS because downloading from the Data "
            "Space requires an account."),
    "csa_radarsat": dict(title="Canadian Space Agency · RADARSAT-1, RCM and SAR tutorial",
        what="Canadian synthetic aperture radar (SAR) data and a processing tutorial.",
        how="Not used: the portal did not respond to automated queries and the system does not include radar variables. The Canadian "
            "analogue sites (Devon Island, Axel Heiberg, Mistastin) would be the first candidates for adding SAR surface roughness."),
}

OTHER_SOURCES = {
    "mcd": "Mars Climate Database (LMD / ESA / CNES)",
    "kaguya_mi_minerals": "USGS Astrogeology (JAXA Kaguya data)",
    "iau_gazetteer": "IAU / USGS Gazetteer",
    "nssdca_factsheets": "NASA NSSDCA (planetary fact sheets)",
    "nasa_trek": "NASA Solar System Treks",
}

# Ordered replacements for generated text (notes, warnings, coordinate sources). Longer and more
# specific phrases come first.
PHRASES = [
    ("Cero por física: sin precipitación líquida en las condiciones actuales", "Zero by physics: no liquid precipitation under current conditions"),
    ("Cero por física: sin agua líquida en el suelo; el agua adsorbida o de hidratación no es comparable",
     "Zero by physics: no liquid water in the soil; adsorbed or hydration water is not comparable"),
    ("Exosfera lunar: orden de magnitud de la presión superficial nocturna", "Lunar exosphere: order of magnitude of the night-side surface pressure"),
    ("Cálculo astronómico para superficie horizontal sin atmósfera; ignora sombras topográficas",
     "Astronomical computation for a horizontal airless surface; ignores topographic shadowing"),
    (" (no fiable a esta latitud)", " (not reliable at this latitude)"),
    ("Albedo de Bond a incidencia normal adoptado para tierras altas.", "Bond albedo at normal incidence adopted for highlands."),
    ("Albedo de Bond a incidencia normal adoptado para mares.", "Bond albedo at normal incidence adopted for maria."),
    ("Celda de reanálisis MERRA-2", "MERRA-2 reanalysis cell"),
    ("corregido por elevación: sitio", "elevation-corrected: site"),
    (" m, celda ", " m, cell "),
    ("(gradiente estándar", "(standard lapse rate"),
    (" K/km y ecuación hipsométrica)", " K/km and hypsometric equation)"),
    ("Ventana ", "Window "), ("línea de base", "baseline"), ("DEM nativo", "native DEM"),
    ("elevación respecto de", "elevation relative to"), ("geoide", "geoid"), ("areoide MOLA", "MOLA areoid"),
    ("esfera de", "sphere of radius"), ("de píxeles válidos", "valid pixels"),
    ("escenario climatológico de polvo, radiación solar media; media sobre", "climatological dust scenario, average solar radiation; mean over"),
    ("longitudes solares x", "solar longitudes x"), ("horas locales; viento y densidad a", "local times; wind and density at"),
    ("Codificado a partir de:", "Coded from:"),
    ("Temperatura de brillo bolométrica, celda de", "Bolometric brightness temperature, cell of"),
    ("centrada en", "centred on"), ("celda(s) promediadas", "cell(s) averaged"),
    ("intervalos de hora local observados", "local-time bins observed"),
    ("Albedo bolométrico TES", "TES bolometric albedo"),
    ("Inercia térmica nocturna TES (Putzig y Mellon 2007)", "TES night-side thermal inertia (Putzig and Mellon 2007)"),
    (", media en un radio de", ", mean within a radius of"), ("píxeles)", "pixels)"),
    ("Plagioclasa", "Plagioclase"), ("Olivino", "Olivine"), ("Clinopiroxeno", "Clinopyroxene"), ("Ortopiroxeno", "Orthopyroxene"),
    ("aproximada (±0.5°): sector noroeste de la cuenca", "approximate (±0.5°): north-western part of the basin"),
    ("(centro del salar)", "(centre of the salt flat)"), ("catálogo (", "catalogue ("),
    ("; verificadas dentro de", "; verified to lie within"), ("coordenadas de misión", "mission coordinates"),
    ("coordenadas de publicación", "published coordinates"), ("coordenadas indicadas por el usuario", "coordinates given by the user"),
    (" m por debajo del sitio; temperatura y presión se corrigieron por elevación (dato derivado)",
     " m below the site; temperature and pressure were corrected for elevation (derived value)"),
    (" m por encima del sitio; temperatura y presión se corrigieron por elevación (dato derivado)",
     " m above the site; temperature and pressure were corrected for elevation (derived value)"),
    (": la celda de reanálisis está", ": the reanalysis cell is"), (": la celda climática es", ": the climate cell is"),
    ("% océano; temperatura, viento y humedad son representativos del entorno marino, no del terreno del sitio",
     "% ocean; temperature, wind and humidity represent the marine surroundings, not the site's terrain"),
    ("celda CERES de 1° con solo", "1° CERES cell with only"),
    ("% de tierra: el albedo describiría el océano, no el sitio", "% land: the albedo would describe the ocean, not the site"),
    ("fuera de la cobertura del mapa o sin píxeles válidos", "outside the map coverage or no valid pixels"),
    ("clima húmedo (probable cobertura vegetal)", "humid climate (probably vegetated)"),
    ("nieve o hielo permanente", "permanent snow or ice"), ("hiperárido / árido", "hyper-arid / arid"),
    ("semiárido", "semi-arid"), ("sin clasificar", "unclassified"), ("no verificada", "not verified"),
    ("año marciano climatológico", "climatological Martian year"),
    ("Geología no verificada: la comparación usa solo clima y topografía; confianza baja.",
     "Geology not verified: the comparison uses climate and topography only; low confidence."),
    ("Lugar agregado por el usuario; geología no verificada.", "Place added by the user; geology not verified."),
]

ENVIRONMENT_WORDS = [
    (", cubierto de nieve o hielo", ", snow- or ice-covered"), (", de gran altitud", ", high-altitude"),
    ("(variante ", "(variant "), ("muy húmedo", "very humid"), ("hiperárido", "hyper-arid"), ("semiárido", "semi-arid"), ("árido", "arid"),
    ("húmedo", "humid"), ("frío", "cold"), ("templado", "temperate"), ("cálido", "warm"),
]
