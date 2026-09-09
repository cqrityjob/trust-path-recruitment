import { runControls, type Mutation } from "./runner";

const mutations: readonly Mutation[] = [
  {
    id: "EMPLOYER-TILE-UNGATED",
    defect: "an unavailable employer service becomes a live destination",
    file: "src/routes/employers.tsx",
    find: "<article key={title}",
    replace: '<Link to="/employers/recruitment" key={title}',
    guard: "about:check",
    expect: "employer tiles are unlinked",
  },
  {
    id: "ABOUT-STATUS-UNSOURCED",
    defect: "the blocked current-status section is published without owner copy",
    file: "src/routes/about.tsx",
    find: 'finalH: "Byggt för förtroende som går att förstå."',
    replace: 'finalH: "Var vi står i dag"',
    guard: "about:check",
    expect: "about ships six sourced sections",
  },
];

runControls("about", mutations);
