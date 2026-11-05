import { App } from "./app.ts";
import { Shell } from "./ui/shell.ts";
import { CompaniesTab } from "./ui/companiesTab.ts";
import { GovernmentTab } from "./ui/governmentTab.ts";
import { NewsFeed } from "./ui/news.ts";
import { PeopleTab } from "./ui/peopleTab.ts";
import { StoryGuide } from "./ui/story.ts";
import { DashboardTab } from "./ui/dashboard.ts";
import { TownTab } from "./town/townTab.ts";

const params = new URLSearchParams(location.search);
const app = new App(Number(params.get("seed") ?? 2026));
const shell = new Shell(app, document.getElementById("app")!);

const town = new TownTab(app);
const dashboard = new DashboardTab(app);
const people = new PeopleTab(app);
const companies = new CompaniesTab(app);
const government = new GovernmentTab(app);
for (const tab of [town, dashboard, people, companies, government]) shell.addTab(tab);
town.openStory = (id) => { shell.showTab("people"); people.select(id); };
town.openCompany = (id) => { shell.showTab("companies"); companies.open(id); };
people.showInTown = (id) => { shell.showTab("town"); town.focusPerson(id); };
shell.showTab(params.get("tab") ?? "town");
const news = new NewsFeed(app);
shell.footer.prepend(news.el);
const story = new StoryGuide(app, shell, (t) => town.setDayTime(t));
// First visit: welcome and pause. Tests and shared links with parameters skip this.
if (!location.search) {
  app.setPaused(true);
  story.showIntro();
}
if (params.get("speed")) app.setSpeed(params.get("speed")!);
if (params.get("scenario")) app.chooseScenario(params.get("scenario")!);

let last = performance.now();
function loop(now: number) {
  const seconds = Math.min(0.25, (now - last) / 1000);
  last = now;
  app.advance(seconds);
  shell.frame(seconds);
  news.frame(seconds);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Test and debugging hook.
(window as unknown as { __app: unknown }).__app = { app, shell, town, dashboard, people, companies, government, story, news };
