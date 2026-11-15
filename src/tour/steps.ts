/**
 * Guided tour. Each page has its own list of steps; a step points at the element marked with
 * `data-tour="<target>"` (or sits in the centre of the screen when it has no target or the
 * element is not on the page). The tour of a page starts by itself the first time the page is
 * visited, so a new visitor is led from the first screen to the globe.
 */
export type TourId = "landing" | "auth" | "targets" | "explore" | "lab";

export interface TourStep {
  /** Value of the element's `data-tour` attribute. */
  target?: string;
  title: string;
  body: string;
  /** Side of the element where the note is placed when there is room. */
  placement?: "top" | "bottom" | "left" | "right";
  /**
   * Globe page only: what the tour opens to show this step. "site" opens a site's panel,
   * "discover" opens the discovery panel; without it both are closed.
   */
  scene?: "site" | "discover";
  /** Skip this step when its element is not on the page (it depends on how the app is set up). */
  optional?: boolean;
}

export const TOURS: Record<TourId, TourStep[]> = {
  landing: [
    {
      title: "Welcome to Hypatia",
      body: "Hypatia finds places on Earth that can stand in for the Moon and Mars, so experiments, hardware and crews can be tested here before a mission flies. This tour shows what everything does, one screen at a time. You can skip it whenever you like.",
    },
    {
      target: "landing-login",
      title: "Log in or sign up",
      body: "With a free account you can save sites and new candidates as favourites, sort them into folders with your own notes, and save searches to repeat later. If you are already signed in, this button takes you straight in.",
      placement: "top",
    },
    {
      target: "landing-guest",
      title: "Or just look around",
      body: "Continue without an account to use everything straight away: the globe, the catalogue and the discovery engine. Nothing is saved, and reloading the page ends the visit.",
      placement: "top",
    },
    {
      target: "tour-button",
      title: "The tour follows you",
      body: "Pick either way in. The tour continues on the next screen, and this button replays it on any page.",
      placement: "bottom",
    },
  ],
  auth: [
    {
      target: "auth-tabs",
      title: "Log in or create an account",
      body: "Choose Log in if you already have an account, or Sign up to create one. An account is what keeps your favourites, folders and saved searches.",
      placement: "bottom",
    },
    {
      target: "auth-form",
      title: "Your details",
      body: "Enter your email and a password of at least 8 characters, or continue with Google. “Forgot password?” emails you a link to choose a new one.",
      placement: "right",
      optional: true,
    },
    {
      target: "auth-unavailable",
      title: "Accounts are not set up here",
      body: "This copy of Hypatia is not connected to its account service yet, so signing in is not possible. Go back and continue without an account to explore.",
      placement: "right",
      optional: true,
    },
    {
      target: "auth-back",
      title: "Changed your mind?",
      body: "Back returns to the first screen, where you can continue without an account.",
      placement: "top",
    },
  ],
  targets: [
    {
      target: "target-cards",
      title: "Choose where the mission is going",
      body: "Pick the Moon or Mars. Each opens a globe with the places on Earth used to study that world, and you can switch between them later.",
      placement: "top",
    },
    {
      target: "account",
      title: "Your session",
      body: "This corner shows how you came in. As a guest nothing is saved, and you can create an account from here at any time. Signed in, it shows your email and the button to sign out.",
      placement: "bottom",
    },
  ],
  explore: [
    {
      target: "globe",
      title: "The globe",
      body: "Every pin is a place on Earth used as an analog. Drag to turn the globe, scroll to zoom, and click a pin to open its file.",
    },
    {
      target: "legend",
      title: "Three kinds of pin",
      body: "The NASA badge marks sites used in NASA field work. The grey pin marks sites from other agencies or the scientific literature. The amber diamond is a Hypatia candidate: a new place proposed from data, not yet verified by anyone. The list below names every site on the globe.",
      placement: "right",
    },
    {
      target: "site-header",
      scene: "site",
      title: "A site's file",
      body: "Clicking a pin opens this panel; the tour has opened one for you. The badge says who recognises the site. Below it are the coordinates, the programmes that use it, a button to save it, and a shortcut to its limitations. Further down, real images of Earth and of the target sit side by side.",
      placement: "left",
    },
    {
      target: "site-why",
      scene: "site",
      title: "Why it is an analog",
      body: "Each quality the site shares with the target, how strong the match is (strong, moderate or partial) and the evidence for it.",
      placement: "left",
    },
    {
      target: "engine-findings",
      scene: "site",
      title: "What NASA data say here",
      body: "The Hypatia engine measured this exact location with NASA data. It shows new reasons to use the site that the catalogue does not list, the catalogue entries the data support, the mission regions it most resembles, and every value with a label: measured, reanalysis, derived or inferred.",
      placement: "left",
    },
    {
      target: "site-limitations",
      scene: "site",
      title: "Where the comparison breaks down",
      body: "No place on Earth is the Moon or Mars. Every site lists what it cannot reproduce, such as gravity, atmosphere or radiation, so a test is never trusted further than it should be.",
      placement: "left",
    },
    {
      target: "filter",
      title: "Say what you want to study",
      body: "Choose qualities such as basaltic lava, permafrost or rover testing. Only the sites that have all of them stay on the globe, ranked by how strongly they match. “How is this ranked?” on the right explains the score.",
      placement: "bottom",
    },
    {
      target: "discover",
      title: "Discover new analogs",
      body: "This opens the Hypatia engine. It reads NASA satellite and reanalysis data, compares Earth with the regions where Artemis and the Mars missions operate, and proposes places no catalogue lists yet. The next steps show how to use it.",
      placement: "bottom",
    },
    {
      target: "discover-qualities",
      scene: "discover",
      title: "What should the new place offer?",
      body: "Pick the qualities you need. The note under the list says which ones the engine can assess from data. It never claims the others: geology has to be checked in imagery and in the field.",
      placement: "left",
    },
    {
      target: "discover-mission",
      scene: "discover",
      title: "Where is the mission going?",
      body: "Optionally choose a region, such as the Artemis south-pole region or Jezero crater, to get the places on Earth closest to it. Tick the box to put first the places that the newest NASA months make a stronger match.",
      placement: "left",
    },
    {
      target: "discover-run",
      scene: "discover",
      title: "Run it",
      body: "The results appear as amber diamonds on the globe, ranked with the same rules as known sites, and listed here with the engine's confidence. Underneath, “Known sites, new reasons” lists catalogued sites the data suggest using in a new way.",
      placement: "top",
    },
    {
      target: "target-toggle",
      title: "Moon or Mars",
      body: "Switch target here. Each one keeps its own filters and its own candidates.",
      placement: "bottom",
    },
    {
      target: "lab-link",
      title: "The Lab",
      body: "The Lab opens up any comparison: every parameter side by side, the full scientific report, the machine-learning map, what a pair can be used for, an assistant that answers questions and adds places, and the sources of every value.",
      placement: "bottom",
    },
    {
      target: "assistant",
      title: "The assistant",
      body: "Ask in your own words, on any page. It answers from the engine's data and can act for you: find new places, add one from live NASA data, show it on the globe, or open a comparison in the Lab.",
      placement: "bottom",
    },
    {
      target: "favourites",
      title: "Keep what you find",
      body: "Save sites and candidates into folders with your own notes, and save searches to repeat them. This needs a free account; as a guest you can explore everything, but nothing is stored.",
      placement: "bottom",
    },
    {
      target: "tour-button",
      title: "That's the tour",
      body: "Click a pin to start. You can replay this tour from here whenever you like.",
      placement: "bottom",
    },
  ],
  lab: [
    {
      target: "lab-tabs",
      title: "Eight views of the same analysis",
      body: "Compare shows every parameter. Mission regions maps where the missions go. Report writes the scientific report. Machine learning maps Earth's environments. Applications says what a pair is good for. The Assistant answers questions and adds places. Sources and method shows where every value came from. About names the team.",
      placement: "bottom",
    },
    {
      target: "lab-selection",
      title: "Choose the pair",
      body: "Pick the Moon or Mars, a place on Earth, the mission region to compare it with, and what you want to test. The first four views all follow this choice.",
      placement: "bottom",
    },
    {
      target: "lab-score",
      title: "The score, and how far to trust it",
      body: "Similarity runs from 0 to 1. Confidence says how much of the comparison rests on data that exist for both sides, and how good those data are. A high score ranks a place; it never makes it equivalent to the Moon or Mars.",
      placement: "right",
    },
    {
      target: "lab-parameters",
      title: "Every value, with its origin",
      body: "Each row is one parameter: the value on Earth, the value in the region, how similar they are and how much the row weighs. The labels on the right say whether a value is measured, modelled, derived or coded from the literature.",
      placement: "top",
    },
    {
      target: "language",
      title: "English, Español, Italiano",
      body: "The interface, the reports and the assistant can be switched between the three languages here.",
      placement: "bottom",
    },
  ],
};

/** Which tour belongs to a route, if any. */
export function tourForPath(pathname: string): TourId | null {
  if (pathname === "/") return "landing";
  if (pathname === "/auth") return "auth";
  if (pathname === "/targets") return "targets";
  if (pathname.startsWith("/explore/")) return "explore";
  if (pathname === "/lab") return "lab";
  return null;
}
